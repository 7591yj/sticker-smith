import fs from "node:fs/promises";
import path from "node:path";

import type { TelegramSessionUser } from "@sticker-smith/shared";

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

const FULL_FILE_DOWNLOAD_LIMIT = 1_000_000_000;
const OWNED_STICKER_SETS_PAGE_SIZE = 100;

function summarizeTdlibParameters(credentials: TelegramTdlibCredentials) {
  return {
    apiId: credentials.apiId,
    apiHashLength: credentials.apiHash.length,
    databaseDirectory: credentials.databaseDirectory,
    filesDirectory: credentials.filesDirectory,
    databaseEncryptionKeyLength: credentials.databaseEncryptionKey.length,
  };
}

function mapFile(file: any): TelegramDownloadedFile {
  return {
    numericFileId: Number(file?.id ?? 0),
    fileId: file?.remote?.id ?? null,
    fileUniqueId: file?.remote?.unique_id ?? null,
    localPath: file?.local?.path || null,
    size: Number(file?.size ?? file?.expected_size ?? 0),
    downloadedSize: Number(file?.local?.downloaded_size ?? 0),
    isDownloaded: Boolean(file?.local?.is_downloading_completed),
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

function mapStickerSet(set: any): TelegramRemoteStickerSet {
  const stickers = Array.isArray(set?.stickers) ? set.stickers : [];
  const stickerFormats = stickers.map((sticker: any) =>
    mapStickerFormat(sticker.format),
  ) as Array<TelegramRemoteStickerSet["format"]>;
  const uniqueFormats = new Set(stickerFormats);
  const format: TelegramRemoteStickerSet["format"] =
    uniqueFormats.size === 1
      ? stickerFormats[0] ?? "unknown"
      : uniqueFormats.size > 1
        ? "mixed"
        : "unknown";

  return {
    stickerSetId: String(set?.id ?? ""),
    shortName: String(set?.name ?? ""),
    title: String(set?.title ?? ""),
    format,
    thumbnailStickerId: set?.thumbnail?.sticker?.id
      ? String(set.thumbnail.sticker.id)
      : null,
    thumbnailFile: set?.thumbnail?.file ? mapFile(set.thumbnail.file) : null,
    stickers: stickers.map((sticker: any, index: number) => ({
      stickerId: String(sticker?.id ?? index),
      fileId: sticker?.sticker?.remote?.id ?? null,
      fileUniqueId: sticker?.sticker?.remote?.unique_id ?? null,
      numericFileId: Number(sticker?.sticker?.id ?? 0),
      position: index,
      emojiList: Array.isArray(sticker?.emoji)
        ? sticker.emoji
        : typeof sticker?.emoji === "string" && sticker.emoji.length > 0
          ? sticker.emoji.trim().split(/\s+/)
          : [],
      format: mapStickerFormat(sticker?.format),
    })),
  };
}

function describeAuthState(authState: string) {
  switch (authState) {
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

let tdlibConfigured = false;

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

    const message = options.message ?? describeAuthState(authStep);
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
    return {
      createBareClient: tdl.createBareClient,
      configure: tdl.configure,
      tdjson: prebuiltTdlib.getTdjson(),
    };
  }

  private async handleAuthorizationState(authorizationState: any) {
    if (!this.client) {
      return;
    }

    switch (authorizationState?._) {
      case "authorizationStateWaitTdlibParameters": {
        if (!this.credentials) {
          this.emitAuthStateChanged("wait_tdlib_parameters");
          return;
        }

        this.emitAuthStateChanged("wait_tdlib_parameters");
        if (this.tdlibParametersSubmitted) {
          return;
        }

        this.tdlibParametersSubmitted = true;
        try {
          await this.client.invoke({
            _: "setTdlibParameters",
            use_test_dc: false,
            database_directory: this.credentials.databaseDirectory,
            files_directory: this.credentials.filesDirectory,
            database_encryption_key: this.credentials.databaseEncryptionKey,
            use_message_database: true,
            use_secret_chats: false,
            system_language_code: "en",
            application_version: "1.0",
            device_model: "Unknown device",
            system_version: "Unknown",
            api_id: this.credentials.apiId,
            api_hash: this.credentials.apiHash,
          });
        } catch (error) {
          this.tdlibParametersSubmitted = false;
          console.error("TDLib rejected setTdlibParameters", {
            error,
            parameters: summarizeTdlibParameters(this.credentials),
          });
          throw error;
        }
        return;
      }
      case "authorizationStateWaitPhoneNumber":
        this.emitAuthStateChanged("wait_phone_number");
        if (this.credentials?.phoneNumber) {
          await this.submitPhoneNumber(this.credentials.phoneNumber);
        }
        return;
      case "authorizationStateWaitCode":
        this.emitAuthStateChanged("wait_code");
        return;
      case "authorizationStateWaitPassword":
        this.emitAuthStateChanged("wait_password");
        return;
      case "authorizationStateReady": {
        const me = await this.getSessionUser();
        this.emitAuthStateChanged("ready", { sessionUser: me });
        return;
      }
      case "authorizationStateLoggingOut":
      case "authorizationStateClosing":
      case "authorizationStateClosed":
        this.emitAuthStateChanged("logged_out", { sessionUser: null });
        return;
      default:
        return;
    }
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

  async ensureStarted(credentials: TelegramTdlibCredentials) {
    const credentialsChanged =
      this.credentials &&
      (this.credentials.apiId !== credentials.apiId ||
        this.credentials.apiHash !== credentials.apiHash ||
        this.credentials.databaseDirectory !== credentials.databaseDirectory ||
        this.credentials.filesDirectory !== credentials.filesDirectory ||
        this.credentials.databaseEncryptionKey !==
          credentials.databaseEncryptionKey);
    this.credentials = credentials;

    if (credentialsChanged) {
      await this.close();
    }

    if (this.client && !this.client.isClosed()) {
      return;
    }

    await fs.mkdir(credentials.databaseDirectory, { recursive: true });
    await fs.mkdir(credentials.filesDirectory, { recursive: true });

    const { configure, createBareClient, tdjson } = await this.loadTdlibModules();
    configureTdlibOnce(configure, tdjson);

    this.client = createBareClient() as TdClient;
    this.tdlibParametersSubmitted = false;
    try {
      await this.attachClient(this.client);
      const authorizationState = await this.client.invoke({
        _: "getAuthorizationState",
      });
      await this.handleAuthorizationState(authorizationState);
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

  async getSessionUser() {
    if (!this.client) {
      return null;
    }

    const me = await this.client.invoke({ _: "getMe" });
    return {
      id: Number(me?.id ?? 0),
      username: me?.usernames?.editable_username ?? me?.username ?? null,
      displayName: [me?.first_name, me?.last_name].filter(Boolean).join(" ") || "Telegram User",
    } satisfies TelegramSessionUser;
  }

  async getOwnedStickerSets() {
    if (!this.client) {
      throw new Error("TDLib client is not started.");
    }

    const sets: any[] = [];
    let offsetStickerSetId = "0";

    while (true) {
      const response = await this.client.invoke({
        _: "getOwnedStickerSets",
        offset_sticker_set_id: offsetStickerSetId,
        limit: OWNED_STICKER_SETS_PAGE_SIZE,
      });
      const chunk = Array.isArray(response?.sets) ? response.sets : [];
      if (chunk.length === 0) {
        break;
      }

      sets.push(...chunk);
      if (chunk.length < OWNED_STICKER_SETS_PAGE_SIZE) {
        break;
      }

      const lastSetId = String(chunk.at(-1)?.id ?? "");
      if (!/^[1-9]\d*$/.test(lastSetId)) {
        break;
      }
      offsetStickerSetId = lastSetId;
    }

    const fullSets: TelegramRemoteStickerSet[] = [];

    for (const set of sets) {
      const full = await this.client.invoke({
        _: "getStickerSet",
        set_id: set.id,
      });
      fullSets.push(mapStickerSet(full));
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

  async replaceStickerInSet(input: {
    stickerSetId: string;
    oldFileId: string;
    newStickerPath: string;
    emojis: string[];
  }) {
    if (!this.client) {
      throw new Error("TDLib client is not started.");
    }

    await this.client.invoke({
      _: "replaceStickerInSet",
      sticker_set_id: input.stickerSetId,
      old_sticker: { _: "inputFileRemote", id: input.oldFileId },
      sticker: this.toInputSticker({
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
    if (!this.client) {
      throw new Error("TDLib client is not started.");
    }

    const me = await this.getSessionUser();
    if (!me) {
      throw new Error("Telegram user session is not ready.");
    }

    await this.client.invoke({
      _: "addStickerToSet",
      user_id: me.id,
      name: input.shortName,
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

  async removeStickerFromSet(input: { stickerSetId: string; fileId: string }) {
    if (!this.client) {
      throw new Error("TDLib client is not started.");
    }

    await this.client.invoke({
      _: "removeStickerFromSet",
      sticker: { _: "inputFileRemote", id: input.fileId },
    });
  }

  async setStickerSetTitle(input: { stickerSetId: string; title: string }) {
    if (!this.client) {
      throw new Error("TDLib client is not started.");
    }

    await this.client.invoke({
      _: "setStickerSetTitle",
      sticker_set_id: input.stickerSetId,
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

    await this.client.invoke({
      _: "setStickerSetThumbnail",
      name: input.shortName,
      thumbnail:
        input.thumbnailPath === null
          ? null
          : {
              _: "inputSticker",
              sticker: { _: "inputFileLocal", path: input.thumbnailPath },
              format: { _: "stickerFormatWebm" },
              emojis: "",
            },
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
