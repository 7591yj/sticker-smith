import { randomBytes } from "node:crypto";
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
import { collectTelegramAssetSignatures } from "./telegramAssetSignatures";
import {
  TelegramTdlibService,
  type TelegramRemoteSticker,
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
  extends Omit<
    Partial<StoredTelegramState>,
    "tdlib" | "user" | "sessionUser" | "lastError"
  > {
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

function supportsTelegramMirrorEditing(
  format: TelegramPackSummary["format"],
) {
  return format === "video";
}

function describeUnsupportedStickerSet(
  stickerSet: Pick<TelegramRemoteStickerSet, "title" | "format">,
) {
  return `Telegram pack "${stickerSet.title}" uses ${stickerSet.format} stickers, and only video sticker packs are supported currently.`;
}

function describeTelegramAuthStep(
  authStep: TelegramState["authStep"],
) {
  switch (authStep) {
    case "wait_tdlib_parameters":
      return "TDLib requires your Telegram api_id and api_hash.";
    case "wait_phone_number":
      return "Enter the phone number for the Telegram account that owns the sticker sets.";
    case "wait_code":
      return "Enter the login code Telegram sent to your account.";
    case "wait_password":
      return "Enter your Telegram two-step verification password.";
    case "ready":
      return "Telegram is connected.";
    default:
      return "Telegram is logged out.";
  }
}

function normalizeTdlibCredential(value: string) {
  return value
    .trim()
    .replace(/^['"`]+|['"`]+$/g, "")
    .replace(/[\s\u200B\u200C\u200D\u2060\uFEFF]+/gu, "");
}

function parseTdlibParameters(input: { apiId: string; apiHash: string }) {
  const apiId = normalizeTdlibCredential(input.apiId);
  const apiHash = normalizeTdlibCredential(input.apiHash);

  if (!/^\d+$/.test(apiId)) {
    throw new Error("Telegram api_id should contain only digits.");
  }

  if (!/^[0-9a-f]{32}$/i.test(apiHash)) {
    throw new Error(
      "Telegram api_hash should be the 32-character hash from my.telegram.org.",
    );
  }

  return { apiId, apiHash };
}

function isTdlibBytesString(value: string) {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) {
    return false;
  }

  try {
    return Buffer.from(value, "base64").toString("base64") === value;
  } catch {
    return false;
  }
}

function createTdlibDatabaseEncryptionKey() {
  return randomBytes(32).toString("base64");
}

function normalizeTelegramPhoneNumber(value: string) {
  const trimmed = value.trim();
  const normalized = trimmed.replace(/[\s\u00A0\u200B\u200C\u200D\u2060\uFEFF()-]+/gu, "");

  if (normalized.startsWith("00")) {
    return `+${normalized.slice(2)}`;
  }

  return normalized;
}

const INVALID_TDLIB_CREDENTIALS_MESSAGE =
  "Stored Telegram TDLib credentials are invalid. Enter your api_id and api_hash from my.telegram.org again.";

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

    let apiHash: string | null;
    try {
      apiHash = await this.secretsService.getSecret(ACCOUNT_KEY, "api_hash");
    } catch (error) {
      const message = (error as Error)?.message ?? INVALID_TDLIB_CREDENTIALS_MESSAGE;
      return this.updateState((current) => ({
        ...current,
        status: "awaiting_credentials",
        authStep: "wait_tdlib_parameters",
        tdlib: {
          ...current.tdlib,
          apiHashConfigured: false,
        },
        message,
        lastError: message,
        updatedAt: new Date().toISOString(),
      }));
    }

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
        lastError: "Telegram api_hash is missing. Enter your TDLib credentials again.",
        updatedAt: new Date().toISOString(),
      }));
    }

    let normalizedApiId: string;
    let normalizedApiHash: string;
    try {
      const normalized = parseTdlibParameters({
        apiId: state.tdlib.apiId,
        apiHash,
      });
      normalizedApiId = normalized.apiId;
      normalizedApiHash = normalized.apiHash;
    } catch {
      await this.secretsService.deleteSecret(ACCOUNT_KEY, "api_hash");
      return this.updateState((current) => ({
        ...current,
        status: "awaiting_credentials",
        authStep: "wait_tdlib_parameters",
        tdlib: {
          apiId: /^\d+$/.test(normalizeTdlibCredential(current.tdlib.apiId ?? ""))
            ? normalizeTdlibCredential(current.tdlib.apiId ?? "")
            : null,
          apiHashConfigured: false,
        },
        message: INVALID_TDLIB_CREDENTIALS_MESSAGE,
        lastError: INVALID_TDLIB_CREDENTIALS_MESSAGE,
        updatedAt: new Date().toISOString(),
      }));
    }

    if (normalizedApiId !== state.tdlib.apiId || normalizedApiHash !== apiHash) {
      await this.secretsService.setSecret(ACCOUNT_KEY, "api_hash", normalizedApiHash);
      await this.updateState((current) => ({
        ...current,
        tdlib: {
          ...current.tdlib,
          apiId: normalizedApiId,
        },
        updatedAt: new Date().toISOString(),
      }));
    }

    const accountRoot = path.join(this.telegramRoot, "tdlib", ACCOUNT_KEY);
    let databaseEncryptionKey = await this.secretsService.getSecret(
      ACCOUNT_KEY,
      "database_encryption_key",
    );
    if (!databaseEncryptionKey || !isTdlibBytesString(databaseEncryptionKey)) {
      await fs.rm(accountRoot, {
        recursive: true,
        force: true,
      });
      databaseEncryptionKey = createTdlibDatabaseEncryptionKey();
      await this.secretsService.setSecret(
        ACCOUNT_KEY,
        "database_encryption_key",
        databaseEncryptionKey,
      );
    }

    try {
      await this.tdlibService.ensureStarted({
        apiId: Number(normalizedApiId),
        apiHash: normalizedApiHash,
        phoneNumber: state.user.phoneNumber,
        databaseDirectory: path.join(accountRoot, "db"),
        filesDirectory: path.join(accountRoot, "files"),
        databaseEncryptionKey,
      });
    } catch (error) {
      const message = (error as Error)?.message ?? "Telegram startup failed.";
      const isParameterParseError =
        /Failed to parse JSON object as TDLib request|Wrong character in the string/i.test(
          message,
        );

      if (isParameterParseError) {
        await this.secretsService.deleteSecret(ACCOUNT_KEY, "api_hash");
        const detailedMessage = [
          "Telegram rejected the saved TDLib parameters.",
          "TDLib reported:",
          message,
        ].join(" ");
        return this.updateState((current) => ({
          ...current,
          status: "awaiting_credentials",
          authStep: "wait_tdlib_parameters",
          tdlib: {
            apiId: null,
            apiHashConfigured: false,
          },
          user: {
            phoneNumber: null,
          },
          sessionUser: null,
          message: detailedMessage,
          lastError: detailedMessage,
          updatedAt: new Date().toISOString(),
        }));
      }

      throw error;
    }

    const runtimeState = this.tdlibService.getCurrentAuthState();
    const expectedStatus =
      runtimeState.authStep === "ready" ? "connected" : "awaiting_credentials";
    const expectedSessionUser =
      runtimeState.authStep === "ready" ? runtimeState.sessionUser ?? null : null;

    if (
      state.status !== expectedStatus ||
      state.authStep !== runtimeState.authStep ||
      state.message !== describeTelegramAuthStep(runtimeState.authStep) ||
      state.sessionUser?.id !== expectedSessionUser?.id
    ) {
      return this.updateState((current) => ({
        ...current,
        status: expectedStatus,
        authStep: runtimeState.authStep,
        message: describeTelegramAuthStep(runtimeState.authStep),
        sessionUser: expectedSessionUser,
        lastError: runtimeState.authStep === "ready" ? null : current.lastError,
        updatedAt: new Date().toISOString(),
      }));
    }

    return state;
  }

  private async requireConnectedState() {
    await this.ensureRuntimeStarted();
    const fresh = await this.readState();
    const runtimeState = this.tdlibService.getCurrentAuthState();
    if (
      !this.tdlibService.isStarted() ||
      fresh.status !== "connected" ||
      fresh.authStep !== "ready" ||
      runtimeState.authStep !== "ready"
    ) {
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
    const normalized = parseTdlibParameters(input);
    await this.secretsService.setSecret(
      ACCOUNT_KEY,
      "api_hash",
      normalized.apiHash,
    );
    const next = await this.updateState((current) => ({
      ...current,
      status: "awaiting_credentials",
      authStep: current.user.phoneNumber ? "wait_code" : "wait_phone_number",
      tdlib: {
        apiId: normalized.apiId,
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
    const phoneNumber = normalizeTelegramPhoneNumber(input.phoneNumber);
    const next = await this.updateState((current) => ({
      ...current,
      status: "awaiting_credentials",
      authStep: "wait_phone_number",
      user: {
        phoneNumber,
      },
      message: "Submitting your phone number to Telegram.",
      lastError: null,
      updatedAt: new Date().toISOString(),
    }));

    try {
      await this.ensureRuntimeStarted();
      await this.lastRuntimeUpdate;
      const state = await this.readState();
      if (state.authStep === "wait_phone_number") {
        await this.tdlibService.submitPhoneNumber(phoneNumber);
        await this.lastRuntimeUpdate;
      }
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

  async reset(): Promise<TelegramState> {
    return this.logout();
  }

  private async resolveStickerSetThumbnailPath(
    stickerSet: TelegramRemoteStickerSet,
    options: { allowDownload?: boolean } = {},
  ) {
    const resolveExistingLocalPath = async (localPath: string | null | undefined) => {
      if (!localPath) {
        return null;
      }

      try {
        await fs.access(localPath);
        return localPath;
      } catch {
        return null;
      }
    };

    const thumbnailFile = stickerSet.thumbnailFile;
    if (thumbnailFile && thumbnailFile.numericFileId > 0) {
      const existingLocalPath = thumbnailFile.isDownloaded
        ? await resolveExistingLocalPath(thumbnailFile.localPath)
        : null;
      if (existingLocalPath) {
        return existingLocalPath;
      }

      if (!options.allowDownload) {
        return null;
      }

      try {
        const downloaded = await this.tdlibService.downloadFile(
          thumbnailFile.numericFileId,
        );
        const downloadedLocalPath = await resolveExistingLocalPath(
          downloaded.localPath,
        );
        if (downloadedLocalPath) {
          return downloadedLocalPath;
        }
      } catch {}
    }

    if (!stickerSet.thumbnailStickerId) {
      return null;
    }

    if (!options.allowDownload) {
      return null;
    }

    const thumbnailSticker = stickerSet.stickers.find(
      (sticker) => sticker.stickerId === stickerSet.thumbnailStickerId,
    );
    if (!thumbnailSticker || thumbnailSticker.numericFileId <= 0) {
      return null;
    }

    try {
      const downloaded = await this.tdlibService.downloadFile(
        thumbnailSticker.numericFileId,
      );
      const downloadedLocalPath = await resolveExistingLocalPath(
        downloaded.localPath,
      );
      if (downloadedLocalPath) {
        return downloadedLocalPath;
      }
    } catch {
      return null;
    }

    return null;
  }

  private async hasAccessibleLocalFile(localPath: string | null | undefined) {
    if (!localPath) {
      return false;
    }

    try {
      await fs.access(localPath);
      return true;
    } catch {
      return false;
    }
  }

  private inferStickerSetThumbnailExtension(
    stickerSet: TelegramRemoteStickerSet,
  ) {
    const thumbnailFileExtension = path.extname(
      stickerSet.thumbnailFile?.localPath ?? "",
    );
    if (thumbnailFileExtension) {
      return thumbnailFileExtension;
    }

    if (
      stickerSet.format === "video" &&
      (stickerSet.thumbnailFile || stickerSet.thumbnailStickerId)
    ) {
      return ".webm";
    }

    return null;
  }

  private async syncOneStickerSet(
    stickerSet: TelegramRemoteStickerSet,
    options: { publishedFromLocalPackId?: string | null } = {},
  ) {
    const existingMirror = await this.libraryService.findPackByTelegramStickerSetId(
      stickerSet.stickerSetId,
    );
    const existingThumbnailPath = existingMirror?.record.telegram?.thumbnailPath ?? null;
    const publishedFromLocalPackId =
      options.publishedFromLocalPackId ??
      existingMirror?.record.telegram?.publishedFromLocalPackId ??
      null;

    if (!supportsTelegramMirrorEditing(stickerSet.format)) {
      const details = await this.mirrorService.upsertStickerSet({
        stickerSet,
        thumbnailPath: null,
        hasThumbnail: false,
        thumbnailExtension: null,
        publishedFromLocalPackId,
        syncState: "unsupported",
        lastSyncError: describeUnsupportedStickerSet(stickerSet),
        includeAssets: false,
      });
      await this.mirrorService.markPackSyncState(
        details.pack.id,
        "unsupported",
        describeUnsupportedStickerSet(stickerSet),
      );
      this.emit({
        type: "pack_sync_completed",
        packId: details.pack.id,
        stickerSetId: stickerSet.stickerSetId,
      });
      return details.pack.id;
    }

    const hasRemoteThumbnail =
      Boolean(stickerSet.thumbnailFile && stickerSet.thumbnailFile.numericFileId > 0) ||
      Boolean(stickerSet.thumbnailStickerId);
    const thumbnailPath = await this.resolveStickerSetThumbnailPath(stickerSet, {
      allowDownload: !(await this.hasAccessibleLocalFile(existingThumbnailPath)),
    });

    const details = await this.mirrorService.upsertStickerSet({
      stickerSet,
      thumbnailPath,
      hasThumbnail: hasRemoteThumbnail,
      thumbnailExtension: this.inferStickerSetThumbnailExtension(stickerSet),
      publishedFromLocalPackId,
      syncState: "syncing",
      lastSyncError: null,
    });
    this.emit({
      type: "pack_sync_started",
      packId: details.pack.id,
      stickerSetId: stickerSet.stickerSetId,
    });

    await this.downloadPackMedia({ packId: details.pack.id });
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

      const stickerSets = await this.tdlibService.getOwnedStickerSets();
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

  async downloadPackMedia(input: { packId: string; force?: boolean }) {
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
      if (
        details.pack.telegram &&
        !supportsTelegramMirrorEditing(details.pack.telegram.format)
      ) {
        throw new Error(describeUnsupportedStickerSet(details.pack.telegram));
      }

      const remoteSet = await this.getRemoteStickerSetOrThrow(stickerSetId);
      const shouldBackfillThumbnail =
        details.pack.iconAssetId === null &&
        !(await this.hasAccessibleLocalFile(details.pack.thumbnailPath));
      if (shouldBackfillThumbnail) {
        const thumbnailPath = await this.resolveStickerSetThumbnailPath(remoteSet, {
          allowDownload: true,
        });
        const hasRemoteThumbnail =
          Boolean(
            remoteSet.thumbnailFile && remoteSet.thumbnailFile.numericFileId > 0,
          ) || Boolean(remoteSet.thumbnailStickerId);

        if (thumbnailPath || hasRemoteThumbnail) {
          await this.libraryService.syncTelegramThumbnail({
            packId: details.pack.id,
            thumbnailPath,
            hasThumbnail: hasRemoteThumbnail,
            thumbnailExtension: this.inferStickerSetThumbnailExtension(remoteSet),
          });
        }
      }

      const remoteByStickerId = new Map(
        remoteSet.stickers.map((sticker) => [sticker.stickerId, sticker]),
      );

      for (const asset of details.assets) {
        if (!asset.telegram) {
          continue;
        }
        if (!input.force && asset.downloadState === "ready") {
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

  private getStickerAssets(details: StickerPackDetails) {
    return details.assets
      .filter((asset) => {
        if (asset.id === details.pack.iconAssetId) {
          return false;
        }

        if (asset.telegram) {
          return true;
        }

        return (
          asset.emojiList.length > 0 ||
          this.getStickerOutput(details, asset.id) !== undefined
        );
      })
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  }

  private getPublishStickerAssets(details: StickerPackDetails) {
    return this.getStickerAssets(details);
  }

  private getStickerOutput(details: StickerPackDetails, assetId: string) {
    return details.outputs.find(
      (output) => output.sourceAssetId === assetId && output.mode === "sticker",
    );
  }

  private getStickerOutputs(details: StickerPackDetails) {
    return details.outputs
      .filter((output) => output.mode === "sticker")
      .sort(
        (left, right) =>
          left.order - right.order || left.sourceAssetId.localeCompare(right.sourceAssetId),
      );
  }

  private getIconOutput(details: StickerPackDetails) {
    return details.outputs.find((output) => output.mode === "icon");
  }

  private async moveRemoteStickerToPosition(
    remoteStickers: TelegramRemoteSticker[],
    stickerId: string,
    targetIndex: number,
  ) {
    const currentIndex = remoteStickers.findIndex(
      (sticker) => sticker.stickerId === stickerId,
    );
    if (currentIndex === -1 || currentIndex === targetIndex) {
      return;
    }

    const movedSticker = remoteStickers[currentIndex];
    if (!movedSticker?.fileId) {
      throw new Error(
        `Telegram sticker ${stickerId} cannot be reordered because its remote file id is missing.`,
      );
    }

    await this.tdlibService.setStickerPositionInSet({
      fileId: movedSticker.fileId,
      position: targetIndex,
    });

    remoteStickers.splice(currentIndex, 1);
    remoteStickers.splice(targetIndex, 0, movedSticker);
  }

  private async reorderExistingRemoteStickerAssets(
    remoteSet: TelegramRemoteStickerSet,
    stickerAssets: ReturnType<TelegramService["getStickerAssets"]>,
  ) {
    const remoteStickers = remoteSet.stickers.slice();
    const desiredRemoteStickerIds = stickerAssets
      .filter((asset) => asset.telegram)
      .map((asset) => asset.telegram!.stickerId);

    let nextPosition = 0;
    for (const stickerId of desiredRemoteStickerIds) {
      const currentIndex = remoteStickers.findIndex(
        (sticker) => sticker.stickerId === stickerId,
      );
      if (currentIndex === -1) {
        continue;
      }

      await this.moveRemoteStickerToPosition(
        remoteStickers,
        stickerId,
        nextPosition,
      );
      nextPosition += 1;
    }
  }

  private async reorderAddedRemoteStickerAssets(
    remoteSet: TelegramRemoteStickerSet,
    stickerAssets: ReturnType<TelegramService["getStickerAssets"]>,
    addedAssetIds: Set<string>,
  ) {
    const addedAssets = stickerAssets.filter((asset) => addedAssetIds.has(asset.id));
    if (addedAssets.length === 0) {
      return;
    }

    const refreshedRemoteStickers = remoteSet.stickers.slice();
    const existingRemoteStickerIds = new Set(
      stickerAssets
        .filter((asset) => asset.telegram)
        .map((asset) => asset.telegram!.stickerId),
    );
    const unmatchedRemoteStickers = refreshedRemoteStickers.filter(
      (sticker) => !existingRemoteStickerIds.has(sticker.stickerId),
    );
    const addedRemoteStickers = unmatchedRemoteStickers.slice(-addedAssets.length);

    if (addedRemoteStickers.length < addedAssets.length) {
      return;
    }

    const addedStickerByAssetId = new Map(
      addedAssets.map((asset, index) => [asset.id, addedRemoteStickers[index]!]),
    );

    for (const [targetIndex, asset] of stickerAssets.entries()) {
      const addedRemoteSticker = addedStickerByAssetId.get(asset.id);
      if (!addedRemoteSticker) {
        continue;
      }

      await this.moveRemoteStickerToPosition(
        refreshedRemoteStickers,
        addedRemoteSticker.stickerId,
        targetIndex,
      );
    }
  }

  private getDuplicateLocalStickerAssetIds(details: StickerPackDetails) {
    const remoteSignatures = new Set<string>();
    const duplicateAssetIds = new Set<string>();

    for (const asset of this.getStickerAssets(details)) {
      if (!asset.telegram) {
        continue;
      }

      const output = this.getStickerOutput(details, asset.id);
      for (const signature of collectTelegramAssetSignatures({
        emojis: asset.emojiList,
        sha256Values: [asset.telegram.baselineOutputHash ?? null, output?.sha256 ?? null],
      })) {
        if (signature) {
          remoteSignatures.add(signature);
        }
      }
    }

    for (const asset of this.getStickerAssets(details)) {
      if (asset.telegram) {
        continue;
      }

      const output = this.getStickerOutput(details, asset.id);
      const signatures = collectTelegramAssetSignatures({
        emojis: asset.emojiList,
        sha256Values: [output?.sha256 ?? null],
      });
      if (!signatures.some((signature) => remoteSignatures.has(signature))) {
        continue;
      }

      duplicateAssetIds.add(asset.id);
    }

    return duplicateAssetIds;
  }

  private async validateTelegramPackOutputs(
    details: StickerPackDetails,
    options: { operation: "upload" | "update"; requireIconOutput: boolean },
  ) {
    const stickerAssets = this.getStickerAssets(details);
    const stickerAssetIds = new Set(stickerAssets.map((asset) => asset.id));
    const stickerOutputs = this.getStickerOutputs(details);
    const mismatchMessage = `Pack outputs do not match the current assets. Run Convert before Telegram ${options.operation}.`;

    if (stickerOutputs.some((output) => !stickerAssetIds.has(output.sourceAssetId))) {
      throw new Error(mismatchMessage);
    }

    for (const asset of stickerAssets) {
      const matchingOutputs = stickerOutputs.filter(
        (output) => output.sourceAssetId === asset.id,
      );
      if (matchingOutputs.length === 0) {
        if (options.operation === "upload") {
          throw new Error(
            `Every sticker asset must have a current sticker output before upload. Missing output for ${asset.relativePath}.`,
          );
        }

        throw new Error(
          `Sticker output for ${asset.relativePath} is missing. Run Convert before Telegram update.`,
        );
      }
      if (matchingOutputs.length > 1) {
        throw new Error(mismatchMessage);
      }
    }

    const iconOutput = this.getIconOutput(details);
    if (iconOutput) {
      if (
        details.pack.iconAssetId === null ||
        iconOutput.sourceAssetId !== details.pack.iconAssetId
      ) {
        throw new Error(mismatchMessage);
      }
    } else if (options.requireIconOutput && details.pack.iconAssetId !== null) {
      throw new Error(
        `The selected icon asset must have a current icon output before Telegram ${options.operation}.`,
      );
    }
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
    const stickerAssets = this.getPublishStickerAssets(details);

    if (details.pack.source !== "local") {
      throw new Error("Only local packs can be uploaded to Telegram.");
    }
    if (stickerAssets.length === 0) {
      throw new Error("The pack needs at least one sticker asset before upload.");
    }

    await this.validateTelegramPackOutputs(details, {
      operation: "upload",
      requireIconOutput: true,
    });

    for (const asset of stickerAssets) {
      const output = this.getStickerOutput(details, asset.id);
      if (!output) {
        throw new Error(
          `Every sticker asset must have a current sticker output before upload. Missing output for ${asset.relativePath}.`,
        );
      }
      await this.ensureOutputFileExists(
        output.absolutePath,
        `Sticker output for ${asset.relativePath}`,
      );
      if (asset.emojiList.length === 0) {
        throw new Error(
          `Every sticker asset must have at least one emoji before upload. Missing emoji for ${asset.relativePath}.`,
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

  private async resolveTelegramMirrorShortName(input: {
    packId: string;
    telegram: NonNullable<StickerPackDetails["pack"]["telegram"]>;
    remoteSet: TelegramRemoteStickerSet;
  }) {
    const telegramShortName = input.telegram.shortName || input.remoteSet.shortName;
    if (!telegramShortName) {
      throw new Error(
        "Telegram mirror short name is missing. Resync the pack and try again.",
      );
    }

    if (input.telegram.shortName !== telegramShortName) {
      await this.libraryService.updateTelegramMirrorMetadata({
        packId: input.packId,
        shortName: telegramShortName,
      });
    }

    return telegramShortName;
  }

  private async syncTelegramMirrorTitle(input: {
    details: StickerPackDetails;
    remoteSet: TelegramRemoteStickerSet;
    telegramShortName: string;
  }) {
    if (input.details.pack.name === input.remoteSet.title) {
      return;
    }

    await this.tdlibService.setStickerSetTitle({
      shortName: input.telegramShortName,
      title: input.details.pack.name,
    });
  }

  private async applyTelegramStickerAssetChanges(input: {
    details: StickerPackDetails;
    stickerAssets: ReturnType<TelegramService["getStickerAssets"]>;
    telegramShortName: string;
    remoteByStickerId: ReadonlyMap<string, TelegramRemoteSticker>;
    duplicateLocalStickerAssetIds: ReadonlySet<string>;
  }) {
    const remotelyAddedAssetIds = new Set<string>();

    for (const asset of input.stickerAssets) {
      const output = this.getStickerOutput(input.details, asset.id);
      if (asset.emojiList.length === 0) {
        throw new Error(
          `Every sticker asset must have at least one emoji before update. Missing emoji for ${asset.relativePath}.`,
        );
      }

      if (!asset.telegram) {
        if (input.duplicateLocalStickerAssetIds.has(asset.id)) {
          continue;
        }

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
          shortName: input.telegramShortName,
          stickerPath: output.absolutePath,
          emojis: asset.emojiList,
        });
        remotelyAddedAssetIds.add(asset.id);
        continue;
      }

      const remoteSticker = input.remoteByStickerId.get(asset.telegram.stickerId);
      if (!remoteSticker) {
        continue;
      }

      const remoteFileId = asset.telegram.fileId ?? remoteSticker.fileId;
      if (output) {
        await this.ensureOutputFileExists(
          output.absolutePath,
          `Sticker output for ${asset.relativePath}`,
        );
      }

      if (
        output &&
        output.sha256 !== asset.telegram.baselineOutputHash &&
        remoteFileId
      ) {
        await this.tdlibService.replaceStickerInSet({
          shortName: input.telegramShortName,
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
          stickerSetId: input.details.pack.telegram!.stickerSetId,
          fileId: remoteFileId,
          emojis: asset.emojiList,
        });
      }
    }

    return remotelyAddedAssetIds;
  }

  private async removeDeletedRemoteStickers(input: {
    telegram: NonNullable<StickerPackDetails["pack"]["telegram"]>;
    remoteSet: TelegramRemoteStickerSet;
    localByStickerId: ReadonlyMap<string, StickerPackDetails["assets"][number]>;
  }) {
    for (const remoteSticker of input.remoteSet.stickers) {
      if (input.localByStickerId.has(remoteSticker.stickerId) || !remoteSticker.fileId) {
        continue;
      }

      await this.tdlibService.removeStickerFromSet({
        stickerSetId: input.telegram.stickerSetId,
        fileId: remoteSticker.fileId,
      });
    }
  }

  private async syncTelegramMirrorThumbnail(input: {
    details: StickerPackDetails;
    telegramShortName: string;
  }) {
    const iconOutput = this.getIconOutput(input.details);
    if (iconOutput) {
      await this.ensureOutputFileExists(
        iconOutput.absolutePath,
        `Icon output for ${input.details.pack.name}`,
      );
      await this.tdlibService.setStickerSetThumbnail({
        shortName: input.telegramShortName,
        thumbnailPath: iconOutput.absolutePath,
        format: "video",
      });
      return;
    }

    if (
      input.details.pack.iconAssetId === null &&
      input.details.pack.telegram?.thumbnailPath === null
    ) {
      await this.tdlibService.setStickerSetThumbnail({
        shortName: input.telegramShortName,
        thumbnailPath: null,
        format: null,
      });
    }
  }

  private async resyncUpdatedTelegramMirror(input: {
    stickerSetId: string;
    stickerAssets: ReturnType<TelegramService["getStickerAssets"]>;
    remotelyAddedAssetIds: ReadonlySet<string>;
  }) {
    const refreshedRemoteSet = await this.getRemoteStickerSetOrThrow(input.stickerSetId);
    await this.reorderAddedRemoteStickerAssets(
      refreshedRemoteSet,
      input.stickerAssets,
      input.remotelyAddedAssetIds,
    );

    const reorderedRemoteSet = await this.getRemoteStickerSetOrThrow(input.stickerSetId);
    await this.syncOneStickerSet(reorderedRemoteSet);
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
        stickers: this.getPublishStickerAssets(details).map((asset) => {
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

      this.emit({
        type: "publish_finished",
        localPackId: input.packId,
        packId: input.packId,
        stickerSetId: createdStickerSetId,
      });
      return;
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
    const stickerAssets = this.getStickerAssets(details);
    if (details.pack.source !== "telegram" || !telegram) {
      throw new Error(`Pack ${input.packId} is not a Telegram mirror.`);
    }
    if (!supportsTelegramMirrorEditing(telegram.format)) {
      throw new Error(describeUnsupportedStickerSet(telegram));
    }

    this.emit({
      type: "update_started",
      packId: input.packId,
      stickerSetId: telegram.stickerSetId,
    });
    await this.mirrorService.markPackSyncState(input.packId, "syncing", null);

    try {
      if (stickerAssets.length === 0) {
        throw new Error(
          "Telegram mirrors must keep at least one sticker. Deleting the entire remote sticker set is not supported by Update.",
        );
      }

      await this.validateTelegramPackOutputs(details, {
        operation: "update",
        requireIconOutput: false,
      });

      const remoteSet = await this.getRemoteStickerSetOrThrow(telegram.stickerSetId);
      const telegramShortName = await this.resolveTelegramMirrorShortName({
        packId: input.packId,
        telegram,
        remoteSet,
      });
      const remoteByStickerId = new Map(
        remoteSet.stickers.map((sticker) => [sticker.stickerId, sticker]),
      );
      const duplicateLocalStickerAssetIds =
        this.getDuplicateLocalStickerAssetIds(details);
      const localByStickerId = new Map(
        details.assets
          .filter((asset) => asset.telegram)
          .map((asset) => [asset.telegram!.stickerId, asset]),
      );

      await this.syncTelegramMirrorTitle({
        details,
        remoteSet,
        telegramShortName,
      });
      await this.reorderExistingRemoteStickerAssets(remoteSet, stickerAssets);
      const remotelyAddedAssetIds = await this.applyTelegramStickerAssetChanges({
        details,
        stickerAssets,
        telegramShortName,
        remoteByStickerId,
        duplicateLocalStickerAssetIds,
      });
      await this.removeDeletedRemoteStickers({
        telegram,
        remoteSet,
        localByStickerId,
      });
      await this.syncTelegramMirrorThumbnail({
        details,
        telegramShortName,
      });
      await this.resyncUpdatedTelegramMirror({
        stickerSetId: telegram.stickerSetId,
        stickerAssets,
        remotelyAddedAssetIds,
      });
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
