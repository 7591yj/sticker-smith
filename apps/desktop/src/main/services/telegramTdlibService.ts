import fs from "node:fs/promises";
import path from "node:path";

import type { TelegramSessionUser } from "@sticker-smith/shared";
import { describeTelegramAuthStep } from "../utils/telegramUtils";
import { FULL_FILE_DOWNLOAD_LIMIT, OWNED_STICKER_SETS_PAGE_SIZE } from "../config/constants";

export interface TelegramTdlibCredentials {
  apiId: number;
  apiHash: string;
  phoneNumber: string | null;
  databaseDirectory: string;
  filesDirectory: string;
  databaseEncryptionKey: string;
}

export interface TelegramDownloadedFile {
  numericFileId: number;
  fileId: string | null;
  fileUniqueId: string | null;
  localPath: string | null;
  size: number;
  downloadedSize: number;
  isDownloaded: boolean;
}

export interface TelegramRemoteSticker {
  stickerId: string;
  fileId: string | null;
  fileUniqueId: string | null;
  numericFileId: number;
  position: number;
  emojiList: string[];
  format: "video" | "static" | "animated" | "unknown";
}

export interface TelegramRemoteStickerSet {
  stickerSetId: string;
  shortName: string;
  title: string;
  format: "video" | "static" | "animated" | "mixed" | "unknown";
  thumbnailStickerId: string | null;
  thumbnailFile?: TelegramDownloadedFile | null;
  stickers: TelegramRemoteSticker[];
}

export interface TelegramTdlibStateListener {
  onAuthStateChanged: (state: {
    authStep:
      | "wait_tdlib_parameters"
      | "wait_phone_number"
      | "wait_code"
      | "wait_password"
      | "ready"
      | "logged_out";
    message: string;
    sessionUser?: TelegramSessionUser | null;
    lastError?: string | null;
  }) => void;
  onFileDownloadProgress?: (update: {
    numericFileId: number;
    downloadedSize: number;
    totalSize: number;
  }) => void;
  onRuntimeError?: (error: Error) => void;
}

type TdClient = {
  invoke(request: Record<string, unknown>): Promise<any>;
  on(event: "update" | "error" | "close", listener: (...args: any[]) => void): void;
  close(): Promise<void>;
  isClosed(): boolean;
};

interface PendingDownload {
  resolve: (file: TelegramDownloadedFile) => void;
  reject: (error: Error) => void;
}

function summarizeTdlibParameters(credentials: TelegramTdlibCredentials) {
  return {
    apiId: credentials.apiId,
    apiHashLength: credentials.apiHash.length,
    databaseDirectory: credentials.databaseDirectory,
    filesDirectory: credentials.filesDirectory,
    databaseEncryptionKeyLength: credentials.databaseEncryptionKey.length,
  };
}

function asNumber(value: unknown, fallback = 0) {
  return Number(value ?? fallback);
}

function asPresentString(value: unknown) {
  return value ? String(value) : null;
}

function getObjectValue(source: any, key: string) {
  return source?.[key];
}

function mapFile(file: any): TelegramDownloadedFile {
  const remote = getObjectValue(file, "remote");
  const local = getObjectValue(file, "local");
  const size = getObjectValue(file, "size") ?? getObjectValue(file, "expected_size");

  return {
    numericFileId: asNumber(getObjectValue(file, "id")),
    fileId: getObjectValue(remote, "id") ?? null,
    fileUniqueId: getObjectValue(remote, "unique_id") ?? null,
    localPath: getObjectValue(local, "path") || null,
    size: asNumber(size),
    downloadedSize: asNumber(getObjectValue(local, "downloaded_size")),
    isDownloaded: Boolean(getObjectValue(local, "is_downloading_completed")),
  };
}

function mapStickerFormat(format: any) {
  switch (format?._) {
    case "stickerFormatWebm":
      return "video" as const;
    case "stickerFormatTgs":
      return "animated" as const;
    case "stickerFormatWebp":
      return "static" as const;
    default:
      return "unknown" as const;
  }
}

function listStickers(set: any) {
  return Array.isArray(set?.stickers) ? set.stickers : [];
}

function getStickerSetFormat(
  stickerFormats: Array<TelegramRemoteSticker["format"]>,
): TelegramRemoteStickerSet["format"] {
  const uniqueFormats = new Set(stickerFormats);

  if (uniqueFormats.size === 1) {
    return stickerFormats[0] ?? "unknown";
  }

  return uniqueFormats.size > 1 ? "mixed" : "unknown";
}

function mapStickerEmojiList(emoji: unknown) {
  if (Array.isArray(emoji)) {
    return emoji;
  }

  if (typeof emoji !== "string" || emoji.length === 0) {
    return [];
  }

  return emoji.trim().split(/\s+/);
}

function mapSticker(sticker: any, index: number): TelegramRemoteSticker {
  const file = getObjectValue(sticker, "sticker");
  const remote = getObjectValue(file, "remote");

  return {
    stickerId: String(getObjectValue(sticker, "id") ?? index),
    fileId: getObjectValue(remote, "id") ?? null,
    fileUniqueId: getObjectValue(remote, "unique_id") ?? null,
    numericFileId: asNumber(getObjectValue(file, "id")),
    position: index,
    emojiList: mapStickerEmojiList(getObjectValue(sticker, "emoji")),
    format: mapStickerFormat(getObjectValue(sticker, "format")),
  };
}

function getStickerSetThumbnail(set: any) {
  const thumbnail = getObjectValue(set, "thumbnail");
  return {
    stickerId: asPresentString(getObjectValue(getObjectValue(thumbnail, "sticker"), "id")),
    file: getObjectValue(thumbnail, "file"),
  };
}

function mapStickerSet(set: any): TelegramRemoteStickerSet {
  const stickers = listStickers(set);
  const stickerFormats = stickers.map((sticker: any) =>
    mapStickerFormat(sticker.format),
  );
  const thumbnail = getStickerSetThumbnail(set);

  return {
    stickerSetId: String(getObjectValue(set, "id") ?? ""),
    shortName: String(getObjectValue(set, "name") ?? ""),
    title: String(getObjectValue(set, "title") ?? ""),
    format: getStickerSetFormat(stickerFormats),
    thumbnailStickerId: thumbnail.stickerId,
    thumbnailFile: thumbnail.file ? mapFile(thumbnail.file) : null,
    stickers: stickers.map(mapSticker),
  };
}

let tdlibConfigured = false;

export async function resolvePackagedTdjsonPath(tdjson: string) {
  const normalizedTdjson = path.normalize(tdjson);
  const asarSegment = `${path.sep}app.asar${path.sep}`;

  if (!normalizedTdjson.includes(asarSegment)) {
    return normalizedTdjson;
  }

  const unpackedTdjson = normalizedTdjson.replace(
    asarSegment,
    `${path.sep}app.asar.unpacked${path.sep}`,
  );

  try {
    await fs.access(unpackedTdjson);
    return unpackedTdjson;
  } catch {
    return normalizedTdjson;
  }
}

function configureTdlibOnce(
  configure: (options: {
    tdjson: string;
    verbosityLevel: number;
  }) => void,
  tdjson: string,
) {
  if (tdlibConfigured) {
    return;
  }

  configure({
    tdjson,
    verbosityLevel: 1,
  });
  tdlibConfigured = true;
}

export class TelegramTdlibService {
  private client: TdClient | null = null;
  private credentials: TelegramTdlibCredentials | null = null;
  private tdlibParametersSubmitted = false;
  private currentAuthStep:
    | "wait_tdlib_parameters"
    | "wait_phone_number"
    | "wait_code"
    | "wait_password"
    | "ready"
    | "logged_out" = "logged_out";
  private sessionUser: TelegramSessionUser | null = null;
  private readonly listeners = new Set<TelegramTdlibStateListener>();
  private readonly pendingDownloads = new Map<number, PendingDownload>();

  subscribe(listener: TelegramTdlibStateListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  isStarted() {
    return Boolean(this.client && !this.client.isClosed());
  }

  getCurrentAuthState() {
    return {
      authStep: this.currentAuthStep,
      sessionUser: this.sessionUser,
    };
  }

  private emitAuthStateChanged(
    authStep:
      | "wait_tdlib_parameters"
      | "wait_phone_number"
      | "wait_code"
      | "wait_password"
      | "ready"
      | "logged_out",
    options: {
      message?: string;
      sessionUser?: TelegramSessionUser | null;
      lastError?: string | null;
    } = {},
  ) {
    this.currentAuthStep = authStep;
    if (options.sessionUser !== undefined) {
      this.sessionUser = options.sessionUser;
    }

    const message = options.message ?? describeTelegramAuthStep(authStep);
    for (const listener of this.listeners) {
      listener.onAuthStateChanged({
        authStep,
        message,
        sessionUser: this.sessionUser,
        lastError: options.lastError ?? null,
      });
    }
  }

  private emitRuntimeError(error: Error) {
    for (const listener of this.listeners) {
      listener.onRuntimeError?.(error);
    }
  }

  private emitFileDownloadProgress(update: {
    numericFileId: number;
    downloadedSize: number;
    totalSize: number;
  }) {
    for (const listener of this.listeners) {
      listener.onFileDownloadProgress?.(update);
    }
  }

  private async loadTdlibModules() {
    const tdl = await import("tdl");
    const prebuiltTdlib = await import("prebuilt-tdlib");
    const tdjson = await resolvePackagedTdjsonPath(prebuiltTdlib.getTdjson());
    return {
      createBareClient: tdl.createBareClient,
      configure: tdl.configure,
      tdjson,
    };
  }

  private buildTdlibParameters(credentials: TelegramTdlibCredentials) {
    return {
      _: "setTdlibParameters",
      use_test_dc: false,
      database_directory: credentials.databaseDirectory,
      files_directory: credentials.filesDirectory,
      database_encryption_key: credentials.databaseEncryptionKey,
      use_message_database: true,
      use_secret_chats: false,
      system_language_code: "en",
      application_version: "1.0",
      device_model: "Unknown device",
      system_version: "Unknown",
      api_id: credentials.apiId,
      api_hash: credentials.apiHash,
    };
  }

  private async submitTdlibParameters() {
    this.emitAuthStateChanged("wait_tdlib_parameters");

    if (!this.client || !this.credentials || this.tdlibParametersSubmitted) {
      return;
    }

    this.tdlibParametersSubmitted = true;
    try {
      await this.client.invoke(this.buildTdlibParameters(this.credentials));
    } catch (error) {
      this.tdlibParametersSubmitted = false;
      console.error("TDLib rejected setTdlibParameters", {
        error,
        parameters: summarizeTdlibParameters(this.credentials),
      });
      throw error;
    }
  }

  private async requestPhoneNumberIfAvailable() {
    this.emitAuthStateChanged("wait_phone_number");

    if (this.credentials?.phoneNumber) {
      await this.submitPhoneNumber(this.credentials.phoneNumber);
    }
  }

  private async markAuthorizationReady() {
    const me = await this.getSessionUser();
    this.emitAuthStateChanged("ready", { sessionUser: me });
  }

  private getAuthorizationStateHandlers() {
    return {
      authorizationStateWaitTdlibParameters: () => this.submitTdlibParameters(),
      authorizationStateWaitPhoneNumber: () => this.requestPhoneNumberIfAvailable(),
      authorizationStateWaitCode: () => this.emitAuthStateChanged("wait_code"),
      authorizationStateWaitPassword: () => this.emitAuthStateChanged("wait_password"),
      authorizationStateReady: () => this.markAuthorizationReady(),
      authorizationStateLoggingOut: () =>
        this.emitAuthStateChanged("logged_out", { sessionUser: null }),
      authorizationStateClosing: () =>
        this.emitAuthStateChanged("logged_out", { sessionUser: null }),
      authorizationStateClosed: () =>
        this.emitAuthStateChanged("logged_out", { sessionUser: null }),
    };
  }

  private async handleAuthorizationState(authorizationState: any) {
    if (!this.client) {
      return;
    }

    const handlers = this.getAuthorizationStateHandlers();
    const handler = handlers[authorizationState?._ as keyof typeof handlers];
    await handler?.();
  }

  private handleFileUpdate(file: any) {
    const mapped = mapFile(file);
    this.emitFileDownloadProgress({
      numericFileId: mapped.numericFileId,
      downloadedSize: mapped.downloadedSize,
      totalSize: mapped.size,
    });

    if (!mapped.isDownloaded) {
      return;
    }

    const pending = this.pendingDownloads.get(mapped.numericFileId);
    if (!pending) {
      return;
    }

    this.pendingDownloads.delete(mapped.numericFileId);
    pending.resolve(mapped);
  }

  private async attachClient(client: TdClient) {
    client.on("update", (update: any) => {
      void (async () => {
        try {
          if (update?._ === "updateAuthorizationState") {
            await this.handleAuthorizationState(update.authorization_state);
            return;
          }

          if (update?._ === "updateFile") {
            this.handleFileUpdate(update.file);
          }
        } catch (error) {
          this.emitRuntimeError(error as Error);
        }
      })();
    });

    client.on("error", (error: Error) => {
      this.emitRuntimeError(error);
    });

    client.on("close", () => {
      this.emitAuthStateChanged("logged_out", { sessionUser: null });
    });
  }

  private credentialsChanged(credentials: TelegramTdlibCredentials) {
    return Boolean(
      this.credentials &&
        (this.credentials.apiId !== credentials.apiId ||
          this.credentials.apiHash !== credentials.apiHash ||
          this.credentials.databaseDirectory !== credentials.databaseDirectory ||
          this.credentials.filesDirectory !== credentials.filesDirectory ||
          this.credentials.databaseEncryptionKey !==
            credentials.databaseEncryptionKey),
    );
  }

  private async prepareTdlibDirectories(credentials: TelegramTdlibCredentials) {
    await fs.mkdir(credentials.databaseDirectory, { recursive: true });
    await fs.mkdir(credentials.filesDirectory, { recursive: true });
  }

  private async createClient() {
    const { configure, createBareClient, tdjson } = await this.loadTdlibModules();
    configureTdlibOnce(configure, tdjson);
    return createBareClient() as TdClient;
  }

  private async initializeClient(client: TdClient) {
    await this.attachClient(client);
    const authorizationState = await client.invoke({
      _: "getAuthorizationState",
    });
    await this.handleAuthorizationState(authorizationState);
  }

  async ensureStarted(credentials: TelegramTdlibCredentials) {
    const shouldRestart = this.credentialsChanged(credentials);
    this.credentials = credentials;

    if (shouldRestart) {
      await this.close();
    }

    if (this.client && !this.client.isClosed()) {
      return;
    }

    await this.prepareTdlibDirectories(credentials);

    this.client = await this.createClient();
    this.tdlibParametersSubmitted = false;
    try {
      await this.initializeClient(this.client);
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  async close() {
    for (const [numericFileId, pending] of this.pendingDownloads) {
      pending.reject(new Error("TDLib client closed while downloading a file."));
      this.pendingDownloads.delete(numericFileId);
    }

    if (!this.client || this.client.isClosed()) {
      this.client = null;
      return;
    }

    try {
      await this.client.close();
    } finally {
      this.client = null;
      this.tdlibParametersSubmitted = false;
      this.sessionUser = null;
      this.currentAuthStep = "logged_out";
    }
  }

  async submitPhoneNumber(phoneNumber: string) {
    if (!this.client) {
      throw new Error("TDLib client is not started.");
    }

    await this.client.invoke({
      _: "setAuthenticationPhoneNumber",
      phone_number: phoneNumber,
    });
  }

  async submitCode(code: string) {
    if (!this.client) {
      throw new Error("TDLib client is not started.");
    }

    await this.client.invoke({
      _: "checkAuthenticationCode",
      code,
    });
  }

  async submitPassword(password: string) {
    if (!this.client) {
      throw new Error("TDLib client is not started.");
    }

    await this.client.invoke({
      _: "checkAuthenticationPassword",
      password,
    });
  }

  async logout() {
    if (!this.client) {
      return;
    }

    await this.client.invoke({ _: "logOut" });
  }

  private mapSessionUser(me: any): TelegramSessionUser {
    const displayName = [me?.first_name, me?.last_name]
      .filter(Boolean)
      .join(" ");

    return {
      id: asNumber(me?.id),
      username: me?.usernames?.editable_username ?? me?.username ?? null,
      displayName: displayName || "Telegram User",
    } satisfies TelegramSessionUser;
  }

  async getSessionUser() {
    if (!this.client) {
      return null;
    }

    return this.mapSessionUser(await this.client.invoke({ _: "getMe" }));
  }

  private async getOwnedStickerSetPage(offsetStickerSetId: string) {
    if (!this.client) {
      throw new Error("TDLib client is not started.");
    }

    const response = await this.client.invoke({
      _: "getOwnedStickerSets",
      offset_sticker_set_id: offsetStickerSetId,
      limit: OWNED_STICKER_SETS_PAGE_SIZE,
    });
    return Array.isArray(response?.sets) ? response.sets : [];
  }

  private getNextOwnedStickerSetOffset(chunk: any[]) {
    if (chunk.length < OWNED_STICKER_SETS_PAGE_SIZE) {
      return null;
    }

    const lastSetId = String(chunk.at(-1)?.id ?? "");
    return /^[1-9]\d*$/.test(lastSetId) ? lastSetId : null;
  }

  private async listOwnedStickerSetSummaries() {
    const sets: any[] = [];
    let offsetStickerSetId: string | null = "0";

    while (offsetStickerSetId !== null) {
      const chunk = await this.getOwnedStickerSetPage(offsetStickerSetId);
      if (chunk.length === 0) {
        break;
      }

      sets.push(...chunk);
      offsetStickerSetId = this.getNextOwnedStickerSetOffset(chunk);
    }

    return sets;
  }

  private async getFullStickerSet(set: any) {
    if (!this.client) {
      throw new Error("TDLib client is not started.");
    }

    const full = await this.client.invoke({
      _: "getStickerSet",
      set_id: set.id,
    });
    return mapStickerSet(full);
  }

  async getOwnedStickerSets() {
    if (!this.client) {
      throw new Error("TDLib client is not started.");
    }

    const sets = await this.listOwnedStickerSetSummaries();
    const fullSets: TelegramRemoteStickerSet[] = [];

    for (const set of sets) {
      fullSets.push(await this.getFullStickerSet(set));
    }

    return fullSets;
  }

  async getStickerSet(stickerSetId: string) {
    if (!this.client) {
      throw new Error("TDLib client is not started.");
    }

    const response = await this.client.invoke({
      _: "getStickerSet",
      set_id: stickerSetId,
    });
    return mapStickerSet(response);
  }

  async getRawStickerSet(stickerSetId: string) {
    if (!this.client) {
      throw new Error("TDLib client is not started.");
    }

    return this.client.invoke({
      _: "getStickerSet",
      set_id: stickerSetId,
    });
  }

  async downloadFile(numericFileId: number) {
    if (!this.client) {
      throw new Error("TDLib client is not started.");
    }

    const initial = mapFile(
      await this.client.invoke({
        _: "downloadFile",
        file_id: numericFileId,
        priority: 32,
        offset: 0,
        // Newer TDLib builds reject 0 here even though older docs allowed it.
        limit: FULL_FILE_DOWNLOAD_LIMIT,
        synchronous: false,
      }),
    );

    if (initial.isDownloaded) {
      return initial;
    }

    return new Promise<TelegramDownloadedFile>((resolve, reject) => {
      this.pendingDownloads.set(numericFileId, { resolve, reject });
    });
  }

  async createNewStickerSet(input: {
    title: string;
    shortName: string;
    stickers: Array<{
      stickerPath: string;
      emojis: string[];
      format: "video";
    }>;
  }) {
    if (!this.client) {
      throw new Error("TDLib client is not started.");
    }

    const me = await this.getSessionUser();
    if (!me) {
      throw new Error("Telegram user session is not ready.");
    }

    const [firstSticker, ...rest] = input.stickers;
    const created = await this.client.invoke({
      _: "createNewStickerSet",
      user_id: me.id,
      title: input.title,
      name: input.shortName,
      sticker_type: { _: "stickerTypeRegular" },
      needs_repainting: false,
      stickers: [this.toInputSticker(firstSticker)],
      source: "Sticker Smith",
    });

    const createdSetId = String(created?.id ?? "");

    for (const sticker of rest) {
      await this.client.invoke({
        _: "addStickerToSet",
        user_id: me.id,
        name: input.shortName,
        sticker: this.toInputSticker(sticker),
      });
    }

    return createdSetId;
  }

  async checkStickerSetName(shortName: string) {
    if (!this.client) {
      throw new Error("TDLib client is not started.");
    }

    const result = await this.client.invoke({
      _: "checkStickerSetName",
      name: shortName,
    });

    switch (result?._) {
      case "checkStickerSetNameResultOk":
      case "ok":
        return;
      case "checkStickerSetNameResultNameInvalid":
        throw new Error(
          "The Telegram sticker short name is invalid. Start with a letter and use only letters, numbers, or underscores.",
        );
      case "checkStickerSetNameResultNameOccupied":
        throw new Error(
          "A Telegram sticker set with that short name already exists.",
        );
      default:
        return;
    }
  }

  private async requireStickerSetEditContext(shortNameInput: string) {
    if (!this.client) {
      throw new Error("TDLib client is not started.");
    }

    const me = await this.getSessionUser();
    if (!me) {
      throw new Error("Telegram user session is not ready.");
    }

    const shortName = shortNameInput.trim();
    if (!shortName) {
      throw new Error("Telegram sticker set short name must be non-empty.");
    }

    return { client: this.client, me, shortName };
  }

  async replaceStickerInSet(input: {
    shortName: string;
    oldFileId: string;
    newStickerPath: string;
    emojis: string[];
  }) {
    const { client, me, shortName } = await this.requireStickerSetEditContext(input.shortName);

    await client.invoke({
      _: "replaceStickerInSet",
      user_id: me.id,
      name: shortName,
      old_sticker: { _: "inputFileRemote", id: input.oldFileId },
      new_sticker: this.toInputSticker({
        stickerPath: input.newStickerPath,
        emojis: input.emojis,
        format: "video",
      }),
    });
  }

  async addStickerToSet(input: {
    shortName: string;
    stickerPath: string;
    emojis: string[];
  }) {
    const { client, me, shortName } = await this.requireStickerSetEditContext(input.shortName);

    await client.invoke({
      _: "addStickerToSet",
      user_id: me.id,
      name: shortName,
      sticker: this.toInputSticker({
        stickerPath: input.stickerPath,
        emojis: input.emojis,
        format: "video",
      }),
    });
  }

  async setStickerEmojis(input: {
    stickerSetId: string;
    fileId: string;
    emojis: string[];
  }) {
    if (!this.client) {
      throw new Error("TDLib client is not started.");
    }

    await this.client.invoke({
      _: "setStickerEmojis",
      sticker: { _: "inputFileRemote", id: input.fileId },
      emojis: input.emojis.join(" "),
    });
  }

  async setStickerPositionInSet(input: { fileId: string; position: number }) {
    if (!this.client) {
      throw new Error("TDLib client is not started.");
    }

    await this.client.invoke({
      _: "setStickerPositionInSet",
      sticker: { _: "inputFileRemote", id: input.fileId },
      position: input.position,
    });
  }

  async removeStickerFromSet(input: { stickerSetId: string; fileId: string }) {
    if (!this.client) {
      throw new Error("TDLib client is not started.");
    }

    await this.client.invoke({
      _: "removeStickerFromSet",
      sticker: { _: "inputFileRemote", id: input.fileId },
    });
  }

  async setStickerSetTitle(input: { shortName: string; title: string }) {
    if (!this.client) {
      throw new Error("TDLib client is not started.");
    }

    const shortName = input.shortName.trim();
    if (!shortName) {
      throw new Error("Telegram sticker set short name must be non-empty.");
    }

    await this.client.invoke({
      _: "setStickerSetTitle",
      name: shortName,
      title: input.title,
    });
  }

  async setStickerSetThumbnail(input: {
    shortName: string;
    thumbnailPath: string | null;
    format: "video" | null;
  }) {
    if (!this.client) {
      throw new Error("TDLib client is not started.");
    }

    const shortName = input.shortName.trim();
    if (!shortName) {
      throw new Error("Telegram sticker set short name must be non-empty.");
    }

    const me = await this.getSessionUser();
    if (!me) {
      throw new Error("Telegram user session is not ready.");
    }

    await this.client.invoke({
      _: "setStickerSetThumbnail",
      user_id: me.id,
      name: shortName,
      thumbnail:
        input.thumbnailPath === null
          ? null
          : { _: "inputFileLocal", path: path.resolve(input.thumbnailPath) },
      format: input.format === null ? null : { _: "stickerFormatWebm" },
    });
  }

  private toInputSticker(input: {
    stickerPath: string;
    emojis: string[];
    format: "video";
  }) {
    return {
      _: "inputSticker",
      sticker: {
        _: "inputFileLocal",
        path: path.resolve(input.stickerPath),
      },
      format: {
        _: input.format === "video" ? "stickerFormatWebm" : "stickerFormatWebp",
      },
      emojis: input.emojis.join(" "),
    };
  }
}
