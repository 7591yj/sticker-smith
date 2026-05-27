import fs from "node:fs/promises";

import type { TelegramSessionUser } from "@sticker-smith/shared";
import { describeTelegramAuthStep } from "../utils/telegramUtils";
import { TelegramTdlibAuthController } from "./telegramTdlibAuth";
import { configureTdlibOnce, resolvePackagedTdjsonPath } from "./telegramTdlibRuntime";
import { getSessionUser } from "./telegramTdlibSession";
import { TelegramTdlibDownloadManager } from "./telegramTdlibDownloads";
import { TelegramTdlibStickerService } from "./telegramTdlibStickers";
import type {
  TdClient,
  TelegramAuthStep,
  TelegramTdlibCredentials,
  TelegramTdlibStateListener,
} from "./telegramTdlibTypes";

export { resolvePackagedTdjsonPath } from "./telegramTdlibRuntime";
export type {
  TelegramDownloadedFile,
  TelegramRemoteSticker,
  TelegramRemoteStickerSet,
  TelegramTdlibCredentials,
  TelegramTdlibStateListener,
} from "./telegramTdlibTypes";

export class TelegramTdlibService {
  private client: TdClient | null = null;
  private credentials: TelegramTdlibCredentials | null = null;
  private currentAuthStep: TelegramAuthStep = "logged_out";
  private sessionUser: TelegramSessionUser | null = null;
  private readonly listeners = new Set<TelegramTdlibStateListener>();
  private readonly auth = new TelegramTdlibAuthController(
    () => this.client,
    () => this.credentials,
    () => this.getSessionUser(),
    (authStep, options) => this.emitAuthStateChanged(authStep, options),
  );
  private readonly downloads = new TelegramTdlibDownloadManager(
    () => this.client,
    (update) => this.emitFileDownloadProgress(update),
  );
  private readonly stickers = new TelegramTdlibStickerService(
    () => this.client,
    () => this.getSessionUser(),
  );

  subscribe(listener: TelegramTdlibStateListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  isStarted() {
    return Boolean(this.client && !this.client.isClosed());
  }

  getCurrentAuthState() {
    return { authStep: this.currentAuthStep, sessionUser: this.sessionUser };
  }

  private emitAuthStateChanged(
    authStep: TelegramAuthStep,
    options: {
      message?: string;
      sessionUser?: TelegramSessionUser | null;
      lastError?: string | null;
    } = {},
  ) {
    this.currentAuthStep = authStep;
    if (options.sessionUser !== undefined) this.sessionUser = options.sessionUser;

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
    for (const listener of this.listeners) listener.onRuntimeError?.(error);
  }

  private emitFileDownloadProgress(update: {
    numericFileId: number;
    downloadedSize: number;
    totalSize: number;
  }) {
    for (const listener of this.listeners) listener.onFileDownloadProgress?.(update);
  }

  private async loadTdlibModules() {
    const tdl = await import("tdl");
    const prebuiltTdlib = await import("prebuilt-tdlib");
    const tdjson = await resolvePackagedTdjsonPath(prebuiltTdlib.getTdjson());
    return { createBareClient: tdl.createBareClient, configure: tdl.configure, tdjson };
  }

  private async attachClient(client: TdClient) {
    client.on("update", (update: any) => {
      void (async () => {
        try {
          if (update?._ === "updateAuthorizationState") {
            await this.auth.handleAuthorizationState(update.authorization_state);
            return;
          }
          if (update?._ === "updateFile") this.downloads.handleFileUpdate(update.file);
        } catch (error) {
          this.emitRuntimeError(error as Error);
        }
      })();
    });
    client.on("error", (error: Error) => this.emitRuntimeError(error));
    client.on("close", () => this.emitAuthStateChanged("logged_out", { sessionUser: null }));
  }

  private credentialsChanged(credentials: TelegramTdlibCredentials) {
    return Boolean(
      this.credentials &&
        (this.credentials.apiId !== credentials.apiId ||
          this.credentials.apiHash !== credentials.apiHash ||
          this.credentials.databaseDirectory !== credentials.databaseDirectory ||
          this.credentials.filesDirectory !== credentials.filesDirectory ||
          this.credentials.databaseEncryptionKey !== credentials.databaseEncryptionKey),
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
    await this.auth.handleAuthorizationState(await client.invoke({ _: "getAuthorizationState" }));
  }

  async ensureStarted(credentials: TelegramTdlibCredentials) {
    const shouldRestart = this.credentialsChanged(credentials);
    this.credentials = credentials;
    if (shouldRestart) await this.close();
    if (this.client && !this.client.isClosed()) return;

    await this.prepareTdlibDirectories(credentials);
    this.client = await this.createClient();
    this.auth.resetParametersSubmitted();
    try {
      await this.initializeClient(this.client);
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  async close() {
    this.downloads.rejectPendingDownloads(
      new Error("TDLib client closed while downloading a file."),
    );

    if (!this.client || this.client.isClosed()) {
      this.client = null;
      return;
    }

    try {
      await this.client.close();
    } finally {
      this.client = null;
      this.auth.resetParametersSubmitted();
      this.sessionUser = null;
      this.currentAuthStep = "logged_out";
    }
  }

  submitPhoneNumber(phoneNumber: string) {
    return this.auth.submitPhoneNumber(phoneNumber);
  }

  submitCode(code: string) {
    return this.auth.submitCode(code);
  }

  submitPassword(password: string) {
    return this.auth.submitPassword(password);
  }

  logout() {
    return this.auth.logout();
  }

  async getSessionUser() {
    return getSessionUser(this.client);
  }

  downloadFile(numericFileId: number) {
    return this.downloads.downloadFile(numericFileId);
  }

  getOwnedStickerSets() {
    return this.stickers.getOwnedStickerSets();
  }

  getStickerSet(stickerSetId: string) {
    return this.stickers.getStickerSet(stickerSetId);
  }

  getRawStickerSet(stickerSetId: string) {
    return this.stickers.getRawStickerSet(stickerSetId);
  }

  createNewStickerSet(input: Parameters<TelegramTdlibStickerService["createNewStickerSet"]>[0]) {
    return this.stickers.createNewStickerSet(input);
  }

  checkStickerSetName(shortName: string) {
    return this.stickers.checkStickerSetName(shortName);
  }

  replaceStickerInSet(input: Parameters<TelegramTdlibStickerService["replaceStickerInSet"]>[0]) {
    return this.stickers.replaceStickerInSet(input);
  }

  addStickerToSet(input: Parameters<TelegramTdlibStickerService["addStickerToSet"]>[0]) {
    return this.stickers.addStickerToSet(input);
  }

  setStickerEmojis(input: Parameters<TelegramTdlibStickerService["setStickerEmojis"]>[0]) {
    return this.stickers.setStickerEmojis(input);
  }

  setStickerPositionInSet(input: Parameters<TelegramTdlibStickerService["setStickerPositionInSet"]>[0]) {
    return this.stickers.setStickerPositionInSet(input);
  }

  removeStickerFromSet(input: Parameters<TelegramTdlibStickerService["removeStickerFromSet"]>[0]) {
    return this.stickers.removeStickerFromSet(input);
  }

  setStickerSetTitle(input: Parameters<TelegramTdlibStickerService["setStickerSetTitle"]>[0]) {
    return this.stickers.setStickerSetTitle(input);
  }

  setStickerSetThumbnail(input: Parameters<TelegramTdlibStickerService["setStickerSetThumbnail"]>[0]) {
    return this.stickers.setStickerSetThumbnail(input);
  }
}
