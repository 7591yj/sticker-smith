import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type {
  PublishLocalPackInput,
  StickerPackDetails,
  TelegramEvent,
  TelegramPackSummary,
  TelegramState,
  UpdateTelegramPackInput,
} from "@sticker-smith/shared";

import type { LibraryService } from "./libraryService";
import type { SettingsService } from "./settingsService";
import { TelegramMirrorService } from "./telegramMirrorService";
import { TelegramSecretsService } from "./telegramSecretsService";
import {
  TelegramTdlibService,
  type TelegramRemoteStickerSet,
} from "./telegramTdlibService";

const ACCOUNT_KEY = "default";

interface StoredTelegramState {
  schemaVersion: 1;
  backend: "tdlib";
  status: TelegramState["status"];
  authStep: TelegramState["authStep"];
  selectedMode: TelegramState["selectedMode"];
  recommendedMode: TelegramState["recommendedMode"];
  message: string;
  tdlib: TelegramState["tdlib"];
  user: TelegramState["user"];
  sessionUser: TelegramState["sessionUser"];
  lastError: string | null;
  updatedAt: string;
}

interface LegacyTelegramCredentialsState {
  apiId?: string | null;
  apiHash?: string | null;
  phoneNumber?: string | null;
  botToken?: string | null;
}

interface PersistedTelegramState
  extends Partial<StoredTelegramState> {
  credentials?: LegacyTelegramCredentialsState;
  tdlib?: Partial<StoredTelegramState["tdlib"]> & {
    apiHash?: string | null;
  };
  user?: Partial<StoredTelegramState["user"]>;
  sessionUser?: StoredTelegramState["sessionUser"];
  lastError?: string | null;
}

interface TelegramServiceOptions {
  secretsService?: TelegramSecretsService;
  tdlibService?: TelegramTdlibService;
  mirrorService?: TelegramMirrorService;
}

function createDefaultState(): StoredTelegramState {
  return {
    schemaVersion: 1,
    backend: "tdlib",
    status: "disconnected",
    authStep: "wait_tdlib_parameters",
    selectedMode: "user",
    recommendedMode: "user",
    message:
      "Enter your Telegram api_id and api_hash to start a user session and sync owned sticker packs.",
    tdlib: {
      apiId: null,
      apiHashConfigured: false,
    },
    user: {
      phoneNumber: null,
    },
    sessionUser: null,
    lastError: null,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeState(
  state: Partial<StoredTelegramState> | null | undefined,
): StoredTelegramState {
  const defaults = createDefaultState();

  return {
    schemaVersion: 1,
    backend: "tdlib",
    status: state?.status ?? defaults.status,
    authStep: state?.authStep ?? defaults.authStep,
    selectedMode: "user",
    recommendedMode: "user",
    message: state?.message ?? defaults.message,
    tdlib: {
      apiId: state?.tdlib?.apiId ?? defaults.tdlib.apiId,
      apiHashConfigured:
        state?.tdlib?.apiHashConfigured ?? defaults.tdlib.apiHashConfigured,
    },
    user: {
      phoneNumber: state?.user?.phoneNumber ?? defaults.user.phoneNumber,
    },
    sessionUser: state?.sessionUser ?? defaults.sessionUser,
    lastError: state?.lastError ?? defaults.lastError,
    updatedAt: state?.updatedAt ?? defaults.updatedAt,
  };
}

function normalizeTelegramStatus(
  status: unknown,
  options: {
    apiId: string | null;
    apiHashConfigured: boolean;
  },
): StoredTelegramState["status"] {
  if (
    status === "disconnected" ||
    status === "awaiting_credentials" ||
    status === "connected"
  ) {
    return status;
  }

  if (!options.apiId || !options.apiHashConfigured) {
    return "disconnected";
  }

  return "awaiting_credentials";
}

function normalizeTelegramAuthStep(
  authStep: unknown,
  options: {
    apiId: string | null;
    apiHashConfigured: boolean;
    phoneNumber: string | null;
    status: StoredTelegramState["status"];
  },
): StoredTelegramState["authStep"] {
  if (
    authStep === "wait_tdlib_parameters" ||
    authStep === "wait_phone_number" ||
    authStep === "wait_code" ||
    authStep === "wait_password" ||
    authStep === "ready" ||
    authStep === "logged_out"
  ) {
    return authStep;
  }

  if (options.status === "connected") {
    return "ready";
  }

  if (!options.apiId || !options.apiHashConfigured) {
    return "wait_tdlib_parameters";
  }

  if (!options.phoneNumber) {
    return "wait_phone_number";
  }

  return "wait_code";
}

function extractInlineApiId(state: PersistedTelegramState) {
  return state.tdlib?.apiId ?? state.credentials?.apiId ?? null;
}

function extractInlinePhoneNumber(state: PersistedTelegramState) {
  return state.user?.phoneNumber ?? state.credentials?.phoneNumber ?? null;
}

function extractInlineSecret(
  state: PersistedTelegramState,
  key: "apiHash" | "botToken",
) {
  if (key === "apiHash") {
    return state.tdlib?.apiHash ?? state.credentials?.apiHash ?? null;
  }

  return state.credentials?.botToken ?? null;
}

function toPublicState(state: StoredTelegramState): TelegramState {
  return {
    backend: "tdlib",
    status: state.status,
    authStep: state.authStep,
    selectedMode: state.selectedMode,
    recommendedMode: state.recommendedMode,
    message: state.message,
    tdlib: state.tdlib,
    user: state.user,
    sessionUser: state.sessionUser,
    lastError: state.lastError,
    updatedAt: state.updatedAt,
  };
}

function describeTdlibError(error: unknown) {
  const message = (error as Error)?.message ?? "Telegram request failed.";

  if (/PHONE_CODE_INVALID/i.test(message)) {
    return "The Telegram login code is invalid.";
  }

  if (/PASSWORD_HASH_INVALID/i.test(message)) {
    return "The Telegram password is invalid.";
  }

  if (/FLOOD_WAIT/i.test(message)) {
    return message;
  }

  if (/STICKERSET_INVALID|STICKERSET_OWNER_ANONYMOUS/i.test(message)) {
    return "The selected Telegram sticker set is no longer owned by the current account.";
  }

  return message;
}

export class TelegramService {
  private readonly telegramRoot: string;
  private readonly statePath: string;
  private readonly legacyStatePath: string;
  private readonly listeners = new Set<(event: TelegramEvent) => void>();
  private readonly activeDownloads = new Map<
    number,
    { packId: string; assetId: string; stickerSetId: string }
  >();
  private readonly activePackDownloads = new Map<string, Promise<void>>();
  private activeOwnedPackSync: Promise<void> | null = null;
  private lastRuntimeUpdate: Promise<unknown> = Promise.resolve();
  private readonly secretsService: TelegramSecretsService;
  private readonly tdlibService: TelegramTdlibService;
  private readonly mirrorService: TelegramMirrorService;

  constructor(
    private readonly settingsService: SettingsService,
    private readonly libraryService: LibraryService,
    options: TelegramServiceOptions = {},
  ) {
    this.telegramRoot = path.join(this.settingsService.getLibraryRoot(), "telegram");
    this.statePath = path.join(this.telegramRoot, "state.json");
    this.legacyStatePath = path.join(
      this.settingsService.getLibraryRoot(),
      "telegram.json",
    );
    this.secretsService =
      options.secretsService ?? new TelegramSecretsService(settingsService);
    this.tdlibService = options.tdlibService ?? new TelegramTdlibService();
    this.mirrorService =
      options.mirrorService ?? new TelegramMirrorService(libraryService);

    this.tdlibService.subscribe({
      onAuthStateChanged: (payload) => {
        this.lastRuntimeUpdate = this.handleRuntimeAuthState(payload);
      },
      onFileDownloadProgress: (progress) => {
        const mapped = this.activeDownloads.get(progress.numericFileId);
        if (!mapped) {
          return;
        }

        this.emit({
          type: "file_download_progress",
          packId: mapped.packId,
          assetId: mapped.assetId,
          stickerSetId: mapped.stickerSetId,
          downloadedSize: progress.downloadedSize,
          totalSize: progress.totalSize,
        });
      },
      onRuntimeError: (error) => {
        this.lastRuntimeUpdate = this.updateState((current) => ({
          ...current,
          status: current.tdlib.apiId && current.tdlib.apiHashConfigured
            ? "awaiting_credentials"
            : "disconnected",
          lastError: describeTdlibError(error),
          message: describeTdlibError(error),
          updatedAt: new Date().toISOString(),
        }));
      },
    });
  }

  private emit(event: TelegramEvent) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  subscribe(listener: (event: TelegramEvent) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private async ensureTelegramRoot() {
    await fs.mkdir(this.telegramRoot, { recursive: true });
  }

  private async sanitizePersistedState(state: PersistedTelegramState) {
    const apiId = extractInlineApiId(state);
    const phoneNumber = extractInlinePhoneNumber(state);
    const inlineApiHash = extractInlineSecret(state, "apiHash");
    const inlineBotToken = extractInlineSecret(state, "botToken");

    if (typeof inlineApiHash === "string" && inlineApiHash.length > 0) {
      await this.secretsService.setSecret(ACCOUNT_KEY, "api_hash", inlineApiHash);
    }

    if (typeof inlineBotToken === "string" && inlineBotToken.length > 0) {
      await this.secretsService.setSecret(ACCOUNT_KEY, "bot_token", inlineBotToken);
    }

    const apiHashConfigured =
      Boolean(inlineApiHash) || state.tdlib?.apiHashConfigured === true;
    const status = normalizeTelegramStatus(state.status, {
      apiId,
      apiHashConfigured,
    });
    const authStep = normalizeTelegramAuthStep(state.authStep, {
      apiId,
      apiHashConfigured,
      phoneNumber,
      status,
    });

    const nextState = normalizeState({
      ...state,
      status,
      authStep,
      tdlib: {
        apiId,
        apiHashConfigured,
      },
      user: {
        phoneNumber,
      },
    });

    return {
      state: nextState,
      changed:
        Boolean(inlineApiHash) ||
        Boolean(inlineBotToken) ||
        state.credentials !== undefined ||
        state.tdlib?.apiId !== nextState.tdlib.apiId ||
        state.tdlib?.apiHashConfigured !== nextState.tdlib.apiHashConfigured ||
        state.user?.phoneNumber !== nextState.user.phoneNumber ||
        state.status !== nextState.status ||
        state.authStep !== nextState.authStep ||
        state.selectedMode !== "user" ||
        state.recommendedMode !== "user" ||
        state.schemaVersion !== 1,
    };
  }

  private async migrateLegacyState() {
    try {
      const raw = await fs.readFile(this.legacyStatePath, "utf8");
      const legacy = JSON.parse(raw) as {
        credentials?: {
          apiId?: string | null;
          apiHash?: string | null;
          phoneNumber?: string | null;
        };
      } & Partial<StoredTelegramState>;

      const nextState = normalizeState({
        ...legacy,
        tdlib: {
          apiId: legacy.credentials?.apiId ?? legacy.tdlib?.apiId ?? null,
          apiHashConfigured:
            Boolean(legacy.credentials?.apiHash) ||
            legacy.tdlib?.apiHashConfigured ||
            false,
        },
        user: {
          phoneNumber:
            legacy.credentials?.phoneNumber ?? legacy.user?.phoneNumber ?? null,
        },
      });

      if (legacy.credentials?.apiHash) {
        await this.secretsService.setSecret(
          ACCOUNT_KEY,
          "api_hash",
          legacy.credentials.apiHash,
        );
      }
      await this.writeState(nextState);
      await fs.rm(this.legacyStatePath, { force: true });
    } catch {
      // No legacy state to migrate.
    }
  }

  private async readState(): Promise<StoredTelegramState> {
    await this.settingsService.ensureLibrary();
    await this.ensureTelegramRoot();

    try {
      const raw = await fs.readFile(this.statePath, "utf8");
      const persisted = JSON.parse(raw) as PersistedTelegramState;
      const next = await this.sanitizePersistedState(persisted);
      if (next.changed) {
        await this.writeState(next.state);
      }
      return next.state;
    } catch {
      await this.migrateLegacyState();

      try {
        const raw = await fs.readFile(this.statePath, "utf8");
        const persisted = JSON.parse(raw) as PersistedTelegramState;
        const next = await this.sanitizePersistedState(persisted);
        if (next.changed) {
          await this.writeState(next.state);
        }
        return next.state;
      } catch {
        const nextState = createDefaultState();
        await this.writeState(nextState);
        return nextState;
      }
    }
  }

  private async writeState(state: StoredTelegramState) {
    await this.ensureTelegramRoot();
    state.updatedAt = new Date().toISOString();
    await fs.writeFile(this.statePath, JSON.stringify(state, null, 2));
  }

  private async updateState(
    mutate: (current: StoredTelegramState) => StoredTelegramState,
  ) {
    const current = await this.readState();
    const next = mutate(current);
    await this.writeState(next);
    this.emit({
      type: "auth_state_changed",
      state: toPublicState(next),
    });
    return next;
  }

  private async handleRuntimeAuthState(payload: {
    authStep:
      | "wait_tdlib_parameters"
      | "wait_phone_number"
      | "wait_code"
      | "wait_password"
      | "ready"
      | "logged_out";
    message: string;
    sessionUser?: TelegramState["sessionUser"];
    lastError?: string | null;
  }) {
    const next = await this.updateState((current) => ({
      ...current,
      status:
        payload.authStep === "ready"
          ? "connected"
          : current.tdlib.apiId && current.tdlib.apiHashConfigured
            ? "awaiting_credentials"
            : "disconnected",
      authStep: payload.authStep,
      message: payload.message,
      sessionUser:
        payload.authStep === "ready" ? payload.sessionUser ?? null : null,
      lastError: payload.lastError ?? null,
      updatedAt: new Date().toISOString(),
    }));

    return toPublicState(next);
  }

  private async ensureRuntimeStarted() {
    const state = await this.readState();
    if (!state.tdlib.apiId || !state.tdlib.apiHashConfigured) {
      return state;
    }

    const apiHash = await this.secretsService.getSecret(ACCOUNT_KEY, "api_hash");
    if (!apiHash) {
      return this.updateState((current) => ({
        ...current,
        status: "awaiting_credentials",
        authStep: "wait_tdlib_parameters",
        tdlib: {
          ...current.tdlib,
          apiHashConfigured: false,
        },
        message: "Telegram api_hash is missing. Enter your TDLib credentials again.",
        updatedAt: new Date().toISOString(),
      }));
    }

    let databaseEncryptionKey = await this.secretsService.getSecret(
      ACCOUNT_KEY,
      "database_encryption_key",
    );
    if (!databaseEncryptionKey) {
      databaseEncryptionKey = randomUUID();
      await this.secretsService.setSecret(
        ACCOUNT_KEY,
        "database_encryption_key",
        databaseEncryptionKey,
      );
    }

    const accountRoot = path.join(this.telegramRoot, "tdlib", ACCOUNT_KEY);
    await this.tdlibService.ensureStarted({
      apiId: Number(state.tdlib.apiId),
      apiHash,
      phoneNumber: state.user.phoneNumber,
      databaseDirectory: path.join(accountRoot, "db"),
      filesDirectory: path.join(accountRoot, "files"),
      databaseEncryptionKey,
    });

    return state;
  }

  private async requireConnectedState() {
    const state = await this.ensureRuntimeStarted();
    const fresh = await this.readState();
    if (fresh.status !== "connected" || fresh.authStep !== "ready") {
      throw new Error("Telegram is not connected.");
    }
    return fresh;
  }

  private async getRemoteStickerSetOrThrow(stickerSetId: string) {
    const remoteSet = await this.tdlibService.getStickerSet(stickerSetId);
    if (!remoteSet.stickerSetId) {
      throw new Error(`Unable to load Telegram sticker set ${stickerSetId}.`);
    }
    return remoteSet;
  }

  async getState(): Promise<TelegramState> {
    const state = await this.readState();
    if (state.tdlib.apiId && state.tdlib.apiHashConfigured) {
      await this.ensureRuntimeStarted();
      return toPublicState(await this.readState());
    }
    return toPublicState(state);
  }

  async submitTdlibParameters(input: {
    apiId: string;
    apiHash: string;
  }): Promise<TelegramState> {
    await this.secretsService.setSecret(ACCOUNT_KEY, "api_hash", input.apiHash.trim());
    const next = await this.updateState((current) => ({
      ...current,
      status: "awaiting_credentials",
      authStep: current.user.phoneNumber ? "wait_code" : "wait_phone_number",
      tdlib: {
        apiId: input.apiId.trim(),
        apiHashConfigured: true,
      },
      message: current.user.phoneNumber
        ? "TDLib credentials saved. If Telegram prompts for a code, enter it to finish login."
        : "TDLib credentials saved. Enter the phone number for your Telegram account.",
      lastError: null,
      updatedAt: new Date().toISOString(),
    }));
    await this.ensureRuntimeStarted();
    return toPublicState(next);
  }

  async submitPhoneNumber(input: { phoneNumber: string }): Promise<TelegramState> {
    const next = await this.updateState((current) => ({
      ...current,
      status: "awaiting_credentials",
      authStep: "wait_code",
      user: {
        phoneNumber: input.phoneNumber.trim(),
      },
      message: "Telegram is requesting a login code for the configured account.",
      lastError: null,
      updatedAt: new Date().toISOString(),
    }));

    try {
      await this.ensureRuntimeStarted();
      await this.tdlibService.submitPhoneNumber(input.phoneNumber.trim());
      await this.lastRuntimeUpdate;
    } catch (error) {
      await this.updateState((current) => ({
        ...current,
        status: "awaiting_credentials",
        authStep: "wait_phone_number",
        lastError: describeTdlibError(error),
        message: describeTdlibError(error),
        updatedAt: new Date().toISOString(),
      }));
    }

    return toPublicState(await this.readState());
  }

  async submitCode(input: { code: string }): Promise<TelegramState> {
    try {
      await this.ensureRuntimeStarted();
      await this.tdlibService.submitCode(input.code.trim());
      await this.lastRuntimeUpdate;
    } catch (error) {
      await this.updateState((current) => ({
        ...current,
        status: "awaiting_credentials",
        authStep: "wait_code",
        lastError: describeTdlibError(error),
        message: describeTdlibError(error),
        updatedAt: new Date().toISOString(),
      }));
    }

    return toPublicState(await this.readState());
  }

  async submitPassword(input: { password: string }): Promise<TelegramState> {
    try {
      await this.ensureRuntimeStarted();
      await this.tdlibService.submitPassword(input.password);
      await this.lastRuntimeUpdate;
    } catch (error) {
      await this.updateState((current) => ({
        ...current,
        status: "awaiting_credentials",
        authStep: "wait_password",
        lastError: describeTdlibError(error),
        message: describeTdlibError(error),
        updatedAt: new Date().toISOString(),
      }));
    }

    return toPublicState(await this.readState());
  }

  async logout(): Promise<TelegramState> {
    try {
      await this.tdlibService.logout();
    } catch {
      // Best-effort logout before local reset.
    }

    await this.tdlibService.close();
    await this.secretsService.clearAccount(ACCOUNT_KEY);
    await fs.rm(path.join(this.telegramRoot, "tdlib", ACCOUNT_KEY), {
      recursive: true,
      force: true,
    });
    const telegramPacks = (await this.libraryService.listPacks()).filter(
      (pack) => pack.source === "telegram",
    );
    await Promise.all(
      telegramPacks.map((pack) => this.libraryService.deletePack({ packId: pack.id })),
    );
    const next = createDefaultState();
    await this.writeState(next);
    this.emit({
      type: "auth_state_changed",
      state: toPublicState(next),
    });
    return toPublicState(next);
  }

  private async syncOneStickerSet(
    stickerSet: TelegramRemoteStickerSet,
    options: { publishedFromLocalPackId?: string | null } = {},
  ) {
    const details = await this.mirrorService.upsertStickerSet({
      stickerSet,
      publishedFromLocalPackId: options.publishedFromLocalPackId ?? null,
      syncState: "syncing",
      lastSyncError: null,
    });
    this.emit({
      type: "pack_sync_started",
      packId: details.pack.id,
      stickerSetId: stickerSet.stickerSetId,
    });

    const iconAssetId =
      details.assets.find(
        (asset) => asset.telegram?.stickerId === stickerSet.thumbnailStickerId,
      )?.id ?? details.pack.iconAssetId;

    if (iconAssetId) {
      const iconAsset = details.assets.find((asset) => asset.id === iconAssetId);
      const remoteSticker = stickerSet.stickers.find(
        (sticker) => sticker.stickerId === iconAsset?.telegram?.stickerId,
      );

      if (iconAsset && remoteSticker && remoteSticker.numericFileId > 0) {
        try {
          this.activeDownloads.set(remoteSticker.numericFileId, {
            packId: details.pack.id,
            assetId: iconAsset.id,
            stickerSetId: stickerSet.stickerSetId,
          });
          await this.mirrorService.markStickerQueued(details.pack.id, iconAsset.id);
          await this.mirrorService.markStickerDownloading(
            details.pack.id,
            iconAsset.id,
          );
          const downloaded = await this.tdlibService.downloadFile(
            remoteSticker.numericFileId,
          );
          await this.mirrorService.storeDownloadedSticker({
            packId: details.pack.id,
            assetId: iconAsset.id,
            sticker: remoteSticker,
            file: downloaded,
          });
        } catch {
          await this.mirrorService.markStickerFailed(details.pack.id, iconAsset.id);
        } finally {
          this.activeDownloads.delete(remoteSticker.numericFileId);
        }
      }
    }

    await this.mirrorService.markPackSyncState(details.pack.id, "idle", null);
    this.emit({
      type: "pack_sync_completed",
      packId: details.pack.id,
      stickerSetId: stickerSet.stickerSetId,
    });

    return details.pack.id;
  }

  async syncOwnedPacks(): Promise<void> {
    if (this.activeOwnedPackSync) {
      return this.activeOwnedPackSync;
    }

    const syncPromise = (async () => {
      await this.requireConnectedState();
      this.emit({ type: "sync_started" });

      const stickerSets = (await this.tdlibService.getOwnedStickerSets()).filter(
        (set) => set.format === "video",
      );
      const stickerSetIds = new Set(stickerSets.map((set) => set.stickerSetId));
      const packIds: string[] = [];

      for (const stickerSet of stickerSets) {
        try {
          packIds.push(await this.syncOneStickerSet(stickerSet));
        } catch (error) {
          const existing = await this.libraryService.findPackByTelegramStickerSetId(
            stickerSet.stickerSetId,
          );
          if (existing) {
            await this.mirrorService.markPackSyncState(
              existing.record.id,
              "error",
              describeTdlibError(error),
            );
          }
          this.emit({
            type: "pack_sync_failed",
            packId: existing?.record.id ?? null,
            stickerSetId: stickerSet.stickerSetId,
            error: describeTdlibError(error),
          });
        }
      }

      const existingTelegramPacks = (await this.libraryService.listPacks()).filter(
        (pack) => pack.source === "telegram",
      );
      await Promise.all(
        existingTelegramPacks
          .filter((pack) => {
            const stickerSetId = pack.telegram?.stickerSetId;
            return stickerSetId ? !stickerSetIds.has(stickerSetId) : false;
          })
          .map((pack) => this.libraryService.deletePack({ packId: pack.id })),
      );

      this.emit({
        type: "sync_finished",
        packIds,
      });
    })();

    this.activeOwnedPackSync = syncPromise;

    try {
      await syncPromise;
    } finally {
      if (this.activeOwnedPackSync === syncPromise) {
        this.activeOwnedPackSync = null;
      }
    }
  }

  async downloadPackMedia(input: { packId: string }) {
    const existingDownload = this.activePackDownloads.get(input.packId);
    if (existingDownload) {
      return existingDownload;
    }

    const downloadPromise = (async () => {
      await this.requireConnectedState();
      const details = await this.libraryService.getPack(input.packId);
      const stickerSetId = details.pack.telegram?.stickerSetId;
      if (!stickerSetId) {
        throw new Error(`Pack ${input.packId} is not a Telegram mirror.`);
      }

      const remoteSet = await this.getRemoteStickerSetOrThrow(stickerSetId);
      const remoteByStickerId = new Map(
        remoteSet.stickers.map((sticker) => [sticker.stickerId, sticker]),
      );

      for (const asset of details.assets) {
        if (!asset.telegram) {
          continue;
        }
        if (asset.downloadState === "ready") {
          continue;
        }

        const remoteSticker = remoteByStickerId.get(asset.telegram.stickerId);
        if (!remoteSticker || remoteSticker.numericFileId <= 0) {
          await this.mirrorService.markStickerFailed(details.pack.id, asset.id);
          continue;
        }

        this.activeDownloads.set(remoteSticker.numericFileId, {
          packId: details.pack.id,
          assetId: asset.id,
          stickerSetId,
        });

        try {
          await this.mirrorService.markStickerQueued(details.pack.id, asset.id);
          await this.mirrorService.markStickerDownloading(details.pack.id, asset.id);
          const downloaded = await this.tdlibService.downloadFile(
            remoteSticker.numericFileId,
          );
          await this.mirrorService.storeDownloadedSticker({
            packId: details.pack.id,
            assetId: asset.id,
            sticker: remoteSticker,
            file: downloaded,
          });
        } catch {
          await this.mirrorService.markStickerFailed(details.pack.id, asset.id);
        } finally {
          this.activeDownloads.delete(remoteSticker.numericFileId);
        }
      }
    })();

    this.activePackDownloads.set(input.packId, downloadPromise);

    try {
      await downloadPromise;
    } finally {
      if (this.activePackDownloads.get(input.packId) === downloadPromise) {
        this.activePackDownloads.delete(input.packId);
      }
    }
  }

  private getNonIconAssets(details: StickerPackDetails) {
    return details.assets.filter((asset) => asset.id !== details.pack.iconAssetId);
  }

  private getStickerOutput(details: StickerPackDetails, assetId: string) {
    return details.outputs.find(
      (output) => output.sourceAssetId === assetId && output.mode === "sticker",
    );
  }

  private async ensureOutputFileExists(
    absolutePath: string,
    description: string,
  ) {
    try {
      await fs.access(absolutePath);
    } catch {
      throw new Error(`${description} is missing at ${absolutePath}.`);
    }
  }

  private async preflightPublishPack(input: PublishLocalPackInput) {
    const details = await this.libraryService.getPack(input.packId);
    const nonIconAssets = this.getNonIconAssets(details);

    if (details.pack.source !== "local") {
      throw new Error("Only local packs can be uploaded to Telegram.");
    }
    if (nonIconAssets.length === 0) {
      throw new Error("The pack needs at least one non-icon asset before upload.");
    }

    for (const asset of nonIconAssets) {
      const output = this.getStickerOutput(details, asset.id);
      if (!output) {
        throw new Error(
          `Every non-icon asset must have a current sticker output before upload. Missing output for ${asset.relativePath}.`,
        );
      }
      await this.ensureOutputFileExists(
        output.absolutePath,
        `Sticker output for ${asset.relativePath}`,
      );
      if (asset.emojiList.length === 0) {
        throw new Error(
          `Every non-icon asset must have at least one emoji before upload. Missing emoji for ${asset.relativePath}.`,
        );
      }
    }

    return details;
  }

  private async recoverPublishedMirrorAfterFailure(input: {
    localPackId: string;
    stickerSetId: string;
    errorMessage: string;
  }) {
    try {
      await this.syncOwnedPacks();
    } catch {
      // Best-effort recovery; fall through to mirror lookup.
    }

    const mirror = await this.libraryService.findPackByTelegramStickerSetId(
      input.stickerSetId,
    );
    if (!mirror) {
      return null;
    }

    await this.libraryService.updateTelegramMirrorMetadata({
      packId: mirror.record.id,
      publishedFromLocalPackId: input.localPackId,
      syncState: "error",
      lastSyncError: input.errorMessage,
    });

    return mirror.record.id;
  }

  private async recoverMirrorAfterFailedUpdate(input: {
    packId: string;
    stickerSetId: string;
    errorMessage: string;
  }) {
    try {
      await this.syncOwnedPacks();
    } catch {
      // Best-effort recovery; fall through to local error state.
    }

    const mirror =
      (await this.libraryService.findPackByTelegramStickerSetId(
        input.stickerSetId,
      ))?.record.id ?? input.packId;

    try {
      await this.libraryService.updateTelegramMirrorMetadata({
        packId: mirror,
        syncState: "error",
        lastSyncError: input.errorMessage,
      });
    } catch {
      // The mirror may have been deleted or replaced during recovery.
    }
  }

  async publishLocalPack(input: PublishLocalPackInput) {
    await this.requireConnectedState();
    const details = await this.preflightPublishPack(input);
    let createdStickerSetId: string | null = null;
    this.emit({
      type: "publish_started",
      localPackId: input.packId,
    });

    try {
      await this.tdlibService.checkStickerSetName(input.shortName);
      createdStickerSetId = await this.tdlibService.createNewStickerSet({
        title: input.title,
        shortName: input.shortName,
        stickers: this.getNonIconAssets(details).map((asset) => {
          const output = this.getStickerOutput(details, asset.id);
          if (!output) {
            throw new Error(`Missing sticker output for ${asset.relativePath}.`);
          }

          return {
            stickerPath: output.absolutePath,
            emojis: asset.emojiList,
            format: "video" as const,
          };
        }),
      });

      const iconOutput = details.outputs.find((output) => output.mode === "icon");
      if (iconOutput) {
        await this.ensureOutputFileExists(
          iconOutput.absolutePath,
          `Icon output for ${details.pack.name}`,
        );
        await this.tdlibService.setStickerSetThumbnail({
          shortName: input.shortName,
          thumbnailPath: iconOutput.absolutePath,
          format: "video",
        });
      }

      await this.syncOwnedPacks();
      const mirror = await this.libraryService.findPackByTelegramStickerSetId(
        createdStickerSetId,
      );
      if (mirror) {
        await this.libraryService.updateTelegramMirrorMetadata({
          packId: mirror.record.id,
          publishedFromLocalPackId: input.packId,
          syncState: "idle",
        });
        this.emit({
          type: "publish_finished",
          localPackId: input.packId,
          packId: mirror.record.id,
          stickerSetId: createdStickerSetId,
        });
        return;
      }

      throw new Error("Telegram pack was created but the local mirror was not found after resync.");
    } catch (error) {
      const errorMessage = describeTdlibError(error);
      if (createdStickerSetId) {
        const recoveredPackId = await this.recoverPublishedMirrorAfterFailure({
          localPackId: input.packId,
          stickerSetId: createdStickerSetId,
          errorMessage,
        });
        if (recoveredPackId) {
          this.emit({
            type: "publish_finished",
            localPackId: input.packId,
            packId: recoveredPackId,
            stickerSetId: createdStickerSetId,
          });
          return;
        }
      }

      this.emit({
        type: "publish_failed",
        localPackId: input.packId,
        error: errorMessage,
      });
      throw error;
    }
  }

  async updateTelegramPack(input: UpdateTelegramPackInput) {
    await this.requireConnectedState();
    const details = await this.libraryService.getPack(input.packId);
    const telegram = details.pack.telegram;
    const nonIconAssets = this.getNonIconAssets(details);
    if (details.pack.source !== "telegram" || !telegram) {
      throw new Error(`Pack ${input.packId} is not a Telegram mirror.`);
    }
    if (nonIconAssets.length === 0) {
      throw new Error(
        "Telegram mirrors must keep at least one non-icon sticker. Deleting the entire remote sticker set is not supported by Update.",
      );
    }

    this.emit({
      type: "update_started",
      packId: input.packId,
      stickerSetId: telegram.stickerSetId,
    });
    await this.mirrorService.markPackSyncState(input.packId, "syncing", null);

    try {
      const remoteSet = await this.getRemoteStickerSetOrThrow(telegram.stickerSetId);
      const remoteByStickerId = new Map(
        remoteSet.stickers.map((sticker) => [sticker.stickerId, sticker]),
      );
      const localByStickerId = new Map(
        details.assets
          .filter((asset) => asset.telegram)
          .map((asset) => [asset.telegram!.stickerId, asset]),
      );

      if (details.pack.name !== remoteSet.title) {
        await this.tdlibService.setStickerSetTitle({
          stickerSetId: telegram.stickerSetId,
          title: details.pack.name,
        });
      }

      for (const asset of nonIconAssets) {
        const output = this.getStickerOutput(details, asset.id);
        if (asset.emojiList.length === 0) {
          throw new Error(
            `Every non-icon asset must have at least one emoji before update. Missing emoji for ${asset.relativePath}.`,
          );
        }

        if (!asset.telegram) {
          if (!output) {
            throw new Error(
              `Added Telegram mirror asset ${asset.relativePath} is missing a sticker output.`,
            );
          }
          await this.ensureOutputFileExists(
            output.absolutePath,
            `Sticker output for ${asset.relativePath}`,
          );

          await this.tdlibService.addStickerToSet({
            shortName: telegram.shortName,
            stickerPath: output.absolutePath,
            emojis: asset.emojiList,
          });
          continue;
        }

        const remoteSticker = remoteByStickerId.get(asset.telegram.stickerId);
        if (!remoteSticker) {
          continue;
        }
        const remoteFileId = asset.telegram.fileId ?? remoteSticker.fileId;

        if (
          output &&
          output.sha256 &&
          output.sha256 !== asset.telegram.baselineOutputHash &&
          remoteFileId
        ) {
          await this.ensureOutputFileExists(
            output.absolutePath,
            `Sticker output for ${asset.relativePath}`,
          );
          await this.tdlibService.replaceStickerInSet({
            stickerSetId: telegram.stickerSetId,
            oldFileId: remoteFileId,
            newStickerPath: output.absolutePath,
            emojis: asset.emojiList,
          });
          continue;
        }

        const remoteEmojis = remoteSticker.emojiList.join(" ");
        const localEmojis = asset.emojiList.join(" ");
        if (localEmojis !== remoteEmojis && remoteFileId) {
          await this.tdlibService.setStickerEmojis({
            stickerSetId: telegram.stickerSetId,
            fileId: remoteFileId,
            emojis: asset.emojiList,
          });
        }
      }

      for (const remoteSticker of remoteSet.stickers) {
        if (localByStickerId.has(remoteSticker.stickerId)) {
          continue;
        }

        const assetToDelete = details.assets.find(
          (asset) => asset.telegram?.stickerId === remoteSticker.stickerId,
        );
        const fileId = assetToDelete?.telegram?.fileId ?? remoteSticker.fileId;
        if (!fileId) {
          continue;
        }

        await this.tdlibService.removeStickerFromSet({
          stickerSetId: telegram.stickerSetId,
          fileId,
        });
      }

      const iconOutput = details.outputs.find((output) => output.mode === "icon");
      if (iconOutput) {
        await this.ensureOutputFileExists(
          iconOutput.absolutePath,
          `Icon output for ${details.pack.name}`,
        );
        await this.tdlibService.setStickerSetThumbnail({
          shortName: telegram.shortName,
          thumbnailPath: iconOutput.absolutePath,
          format: "video",
        });
      } else if (details.pack.iconAssetId === null) {
        await this.tdlibService.setStickerSetThumbnail({
          shortName: telegram.shortName,
          thumbnailPath: null,
          format: null,
        });
      }

      await this.syncOwnedPacks();
      await this.mirrorService.markPackSyncState(input.packId, "idle", null);
      this.emit({
        type: "update_finished",
        packId: input.packId,
        stickerSetId: telegram.stickerSetId,
      });
    } catch (error) {
      const errorMessage = describeTdlibError(error);
      await this.recoverMirrorAfterFailedUpdate({
        packId: input.packId,
        stickerSetId: telegram.stickerSetId,
        errorMessage,
      });
      this.emit({
        type: "update_failed",
        packId: input.packId,
        stickerSetId: telegram.stickerSetId,
        error: errorMessage,
      });
      throw error;
    }
  }
}
