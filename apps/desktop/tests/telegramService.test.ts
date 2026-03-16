import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { LibraryService } from "../src/main/services/libraryService";
import { TelegramService } from "../src/main/services/telegramService";
import { TelegramMirrorService } from "../src/main/services/telegramMirrorService";
import { TelegramSecretsService } from "../src/main/services/telegramSecretsService";
import type {
  TelegramTdlibCredentials,
  TelegramTdlibStateListener,
} from "../src/main/services/telegramTdlibService";

const VALID_API_HASH = "0123456789abcdef0123456789abcdef";
const LEGACY_API_HASH = "fedcba9876543210fedcba9876543210";

class FakeSettingsService {
  constructor(private readonly root: string) {}

  async ensureLibrary() {
    await fs.mkdir(path.join(this.root, "packs"), { recursive: true });
  }

  getLibraryRoot() {
    return this.root;
  }

  getPackRoot(packDirectoryName: string) {
    return path.join(this.root, "packs", packDirectoryName);
  }
}

class FakeSecretsService {
  private readonly secrets = new Map<string, string>();

  async getSecret(accountKey: string, key: "api_hash" | "bot_token" | "database_encryption_key") {
    return this.secrets.get(`${accountKey}:${key}`) ?? null;
  }

  async setSecret(
    accountKey: string,
    key: "api_hash" | "bot_token" | "database_encryption_key",
    value: string,
  ) {
    this.secrets.set(`${accountKey}:${key}`, value);
  }

  async deleteSecret(
    accountKey: string,
    key: "api_hash" | "bot_token" | "database_encryption_key",
  ) {
    this.secrets.delete(`${accountKey}:${key}`);
  }

  async clearAccount(accountKey: string) {
    for (const key of [...this.secrets.keys()]) {
      if (key.startsWith(`${accountKey}:`)) {
        this.secrets.delete(key);
      }
    }
  }
}

class FakeTdlibService {
  private readonly listeners = new Set<TelegramTdlibStateListener>();
  private readonly downloadFilePath: string;
  private lastEnsureStartedCredentials: TelegramTdlibCredentials | null = null;
  private started = false;
  private currentAuthStep:
    | "wait_tdlib_parameters"
    | "wait_phone_number"
    | "wait_code"
    | "wait_password"
    | "ready"
    | "logged_out" = "logged_out";
  private currentSessionUser: {
    id: number;
    username: string | null;
    displayName: string;
  } | null = null;
  private submitPhoneNumberCalls: string[] = [];
  private setStickerSetTitleError: Error | null = null;
  private setStickerSetThumbnailError: Error | null = null;
  private ownedStickerSetRequestCount = 0;
  private clearedStickerSetThumbnails: string[] = [];
  private addedStickers: Array<{
    shortName: string;
    stickerPath: string;
    emojis: string[];
  }> = [];
  private stickerEmojiUpdates: Array<{ fileId: string; emojis: string[] }> = [];
  private ownedStickerSets: Array<{
    stickerSetId: string;
    shortName: string;
    title: string;
    format: "video" | "static" | "animated" | "mixed" | "unknown";
    thumbnailStickerId: string | null;
    thumbnailFile?: {
      numericFileId: number;
      fileId: string | null;
      fileUniqueId: string | null;
      localPath: string | null;
      size: number;
      downloadedSize: number;
      isDownloaded: boolean;
    } | null;
    stickers: Array<{
      stickerId: string;
      fileId: string | null;
      fileUniqueId: string | null;
      numericFileId: number;
      position: number;
      emojiList: string[];
      format: "video" | "static" | "animated" | "unknown";
    }>;
  }>;

  constructor(downloadFilePath: string) {
    this.downloadFilePath = downloadFilePath;
    this.ownedStickerSets = [
      {
        stickerSetId: "100",
        shortName: "sample_pack",
        title: "Sample Pack",
        format: "video",
        thumbnailStickerId: "sticker-1",
        thumbnailFile: {
          numericFileId: 201,
          fileId: "thumb-remote-1",
          fileUniqueId: "thumb-unique-1",
          localPath: this.downloadFilePath,
          size: 128,
          downloadedSize: 128,
          isDownloaded: true,
        },
        stickers: [
          {
            stickerId: "sticker-1",
            fileId: "remote-1",
            fileUniqueId: "unique-1",
            numericFileId: 101,
            position: 0,
            emojiList: ["🙂"],
            format: "video",
          },
        ],
      },
    ];
  }

  setSetStickerSetTitleError(error: Error | null) {
    this.setStickerSetTitleError = error;
  }

  setSetStickerSetThumbnailError(error: Error | null) {
    this.setStickerSetThumbnailError = error;
  }

  getClearedStickerSetThumbnails() {
    return [...this.clearedStickerSetThumbnails];
  }

  getAddedStickers() {
    return [...this.addedStickers];
  }

  getStickerEmojiUpdates() {
    return [...this.stickerEmojiUpdates];
  }

  getOwnedStickerSetRequestCount() {
    return this.ownedStickerSetRequestCount;
  }

  setOwnedStickerSets(ownedStickerSets: typeof this.ownedStickerSets) {
    this.ownedStickerSets = ownedStickerSets;
  }

  subscribe(listener: TelegramTdlibStateListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getLastEnsureStartedCredentials() {
    return this.lastEnsureStartedCredentials;
  }

  getSubmitPhoneNumberCalls() {
    return [...this.submitPhoneNumberCalls];
  }

  isStarted() {
    return this.started;
  }

  getCurrentAuthState() {
    return {
      authStep: this.currentAuthStep,
      sessionUser: this.currentSessionUser,
    };
  }

  setCurrentAuthState(
    authStep:
      | "wait_tdlib_parameters"
      | "wait_phone_number"
      | "wait_code"
      | "wait_password"
      | "ready"
      | "logged_out",
    sessionUser: { id: number; username: string | null; displayName: string } | null = null,
  ) {
    this.currentAuthStep = authStep;
    this.currentSessionUser = authStep === "ready" ? sessionUser : null;
  }

  async ensureStarted(credentials: TelegramTdlibCredentials) {
    this.lastEnsureStartedCredentials = credentials;
    this.started = true;
    if (this.currentAuthStep === "logged_out") {
      this.currentAuthStep = credentials.phoneNumber
        ? "wait_code"
        : "wait_phone_number";
      this.currentSessionUser = null;
    }
    return;
  }

  async close() {
    this.started = false;
    this.currentAuthStep = "logged_out";
    this.currentSessionUser = null;
    return;
  }

  async submitPhoneNumber(phoneNumber?: string) {
    if (phoneNumber) {
      this.submitPhoneNumberCalls.push(phoneNumber);
    }
    this.currentAuthStep = "wait_code";
    for (const listener of this.listeners) {
      listener.onAuthStateChanged({
        authStep: "wait_code",
        message: "Enter the login code Telegram sent to your account.",
      });
    }
  }

  async submitCode() {
    this.currentAuthStep = "ready";
    this.currentSessionUser = {
      id: 1,
      username: "stickersmith",
      displayName: "Sticker Smith",
    };
    for (const listener of this.listeners) {
      listener.onAuthStateChanged({
        authStep: "ready",
        message: "Telegram is connected.",
        sessionUser: this.currentSessionUser,
      });
    }
  }

  async submitPassword() {
    return;
  }

  async logout() {
    this.currentAuthStep = "logged_out";
    this.currentSessionUser = null;
    for (const listener of this.listeners) {
      listener.onAuthStateChanged({
        authStep: "logged_out",
        message: "Telegram is logged out.",
        sessionUser: null,
      });
    }
  }

  async getOwnedStickerSets() {
    this.ownedStickerSetRequestCount += 1;
    return this.ownedStickerSets;
  }

  async getStickerSet(stickerSetId: string) {
    return (await this.getOwnedStickerSets()).find(
      (set) => set.stickerSetId === stickerSetId,
    )!;
  }

  async downloadFile(numericFileId?: number) {
    for (const listener of this.listeners) {
      listener.onFileDownloadProgress?.({
        numericFileId: numericFileId ?? 101,
        downloadedSize: 128,
        totalSize: 128,
      });
    }

    return {
      numericFileId: numericFileId ?? 101,
      fileId: "remote-1",
      fileUniqueId: "unique-1",
      localPath: this.downloadFilePath,
      size: 128,
      downloadedSize: 128,
      isDownloaded: true,
    };
  }

  async checkStickerSetName() {
    return { _: "ok" };
  }

  async createNewStickerSet() {
    return "100";
  }

  async setStickerSetThumbnail(input?: {
    shortName: string;
    thumbnailPath: string | null;
    format: "video" | null;
  }) {
    if (this.setStickerSetThumbnailError) {
      throw this.setStickerSetThumbnailError;
    }
    if (input?.thumbnailPath === null) {
      this.clearedStickerSetThumbnails.push(input.shortName);
    }
    return;
  }

  async addStickerToSet(input?: {
    shortName: string;
    stickerPath: string;
    emojis: string[];
  }) {
    if (input) {
      this.addedStickers.push({
        shortName: input.shortName,
        stickerPath: input.stickerPath,
        emojis: [...input.emojis],
      });
    }
    return;
  }

  async replaceStickerInSet() {
    return;
  }

  async setStickerEmojis(input?: { fileId: string; emojis: string[] }) {
    if (input) {
      this.stickerEmojiUpdates.push({
        fileId: input.fileId,
        emojis: [...input.emojis],
      });
    }
    return;
  }

  async removeStickerFromSet() {
    return;
  }

  async setStickerSetTitle() {
    if (this.setStickerSetTitleError) {
      throw this.setStickerSetTitleError;
    }
    return;
  }
}

async function createTelegramService() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sticker-smith-telegram-"));
  const settingsService = new FakeSettingsService(root);
  const libraryService = new LibraryService(settingsService as never);
  const downloadRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "sticker-smith-telegram-download-"),
  );
  const downloadFilePath = path.join(downloadRoot, "sticker.webm");
  await fs.writeFile(downloadFilePath, "webm-data");
  const tdlibService = new FakeTdlibService(downloadFilePath);
  const secretsService = new FakeSecretsService();
  const telegramService = new TelegramService(settingsService as never, libraryService, {
    secretsService: secretsService as unknown as TelegramSecretsService,
    tdlibService: tdlibService as never,
    mirrorService: new TelegramMirrorService(libraryService),
  });
  return {
    root,
    downloadRoot,
    libraryService,
    telegramService,
    tdlibService,
    secretsService,
  };
}

async function createLocalPackWithStickerOutput(libraryService: LibraryService) {
  const pack = await libraryService.createPack({ name: "Upload Pack" });
  const fileRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "sticker-smith-telegram-local-"),
  );
  const filePath = path.join(fileRoot, "sticker.png");
  await fs.writeFile(filePath, "sticker");
  const importResult = await libraryService.importFiles(pack.id, [filePath]);
  const assetId = importResult.imported[0]!.id;
  const outputFileName = `${assetId}.webm`;
  await libraryService.setAssetEmojis({
    packId: pack.id,
    assetId,
    emojis: ["🙂"],
  });
  await libraryService.recordConversionResult(pack.id, {
    assetId,
    mode: "sticker",
    outputFileName,
    sizeBytes: 128,
  });
  await fs.writeFile(path.join(pack.outputRoot, outputFileName), "webm-data");
  return { pack, assetId, outputPath: path.join(pack.outputRoot, outputFileName), fileRoot };
}

async function addIconOutput(
  libraryService: LibraryService,
  input: {
    packId: string;
    assetId: string;
    outputRoot: string;
  },
) {
  await libraryService.setPackIcon({
    packId: input.packId,
    assetId: input.assetId,
  });
  await libraryService.recordConversionResult(input.packId, {
    assetId: input.assetId,
    mode: "icon",
    outputFileName: "icon.webm",
    sizeBytes: 64,
  });
  await fs.writeFile(path.join(input.outputRoot, "icon.webm"), "icon-data");
}

async function addLocalIconAsset(
  libraryService: LibraryService,
  input: {
    packId: string;
    outputRoot: string;
    fileRoot: string;
  },
) {
  const iconPath = path.join(input.fileRoot, "main_img.jpg");
  await fs.writeFile(iconPath, "icon");
  const importResult = await libraryService.importFiles(input.packId, [iconPath]);
  const iconAssetId = importResult.imported[0]!.id;
  await addIconOutput(libraryService, {
    packId: input.packId,
    assetId: iconAssetId,
    outputRoot: input.outputRoot,
  });
  return iconAssetId;
}

async function waitForCount(getCount: () => number, expected: number) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (getCount() === expected) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe("TelegramService", () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    await Promise.all(
      cleanup
        .splice(0)
        .map((root) => fs.rm(root, { recursive: true, force: true })),
    );
  });

  it("creates a default disconnected TDLib state", async () => {
    const { root, downloadRoot, telegramService } = await createTelegramService();
    cleanup.push(root, downloadRoot);

    const state = await telegramService.getState();

    expect(state.backend).toBe("tdlib");
    expect(state.status).toBe("disconnected");
    expect(state.authStep).toBe("wait_tdlib_parameters");
    expect(state.selectedMode).toBe("user");
    expect(state.recommendedMode).toBe("user");
    expect(state.tdlib.apiHashConfigured).toBe(false);
  });

  it("resets malformed stored tdlib credentials instead of throwing on startup", async () => {
    const { root, downloadRoot, telegramService, secretsService } =
      await createTelegramService();
    cleanup.push(root, downloadRoot);

    const telegramRoot = path.join(root, "telegram");
    await fs.mkdir(telegramRoot, { recursive: true });
    await fs.writeFile(
      path.join(telegramRoot, "state.json"),
      JSON.stringify(
        {
          schemaVersion: 1,
          backend: "tdlib",
          status: "awaiting_credentials",
          authStep: "wait_phone_number",
          selectedMode: "user",
          recommendedMode: "user",
          message: "Saved state.",
          tdlib: {
            apiId: "12345",
            apiHashConfigured: true,
          },
          user: {
            phoneNumber: null,
          },
          sessionUser: null,
          lastError: null,
          updatedAt: "2026-03-01T00:00:00.000Z",
        },
        null,
        2,
      ),
    );
    await secretsService.setSecret("default", "api_hash", "bad-hash");

    const state = await telegramService.getState();

    expect(state.authStep).toBe("wait_tdlib_parameters");
    expect(state.tdlib.apiId).toBe("12345");
    expect(state.tdlib.apiHashConfigured).toBe(false);
    expect(state.lastError).toContain("Stored Telegram TDLib credentials are invalid.");
    expect(await secretsService.getSecret("default", "api_hash")).toBeNull();
  });

  it("resets tdlib setup instead of throwing when tdlib rejects startup parameters", async () => {
    const { root, downloadRoot, telegramService, secretsService, tdlibService } =
      await createTelegramService();
    cleanup.push(root, downloadRoot);

    await telegramService.submitTdlibParameters({
      apiId: "12345",
      apiHash: VALID_API_HASH,
    });

    tdlibService.ensureStarted = async () => {
      throw new Error(
        "TDLibError: Failed to parse JSON object as TDLib request: Wrong character in the string",
      );
    };

    const state = await telegramService.getState();

    expect(state.authStep).toBe("wait_tdlib_parameters");
    expect(state.status).toBe("awaiting_credentials");
    expect(state.tdlib.apiId).toBeNull();
    expect(state.tdlib.apiHashConfigured).toBe(false);
    expect(state.user.phoneNumber).toBeNull();
    expect(state.lastError).toContain("Telegram rejected the saved TDLib parameters.");
    expect(state.lastError).toContain("Wrong character in the string");
    expect(await secretsService.getSecret("default", "api_hash")).toBeNull();
  });

  it("replaces legacy uuid database encryption keys with base64 before tdlib startup", async () => {
    const { root, downloadRoot, telegramService, secretsService, tdlibService } =
      await createTelegramService();
    cleanup.push(root, downloadRoot);

    await telegramService.submitTdlibParameters({
      apiId: "12345",
      apiHash: VALID_API_HASH,
    });
    await secretsService.setSecret(
      "default",
      "database_encryption_key",
      "e654aa91-a37d-4e55-b6fe-ff57ccc342b3",
    );

    const state = await telegramService.getState();
    const savedKey = await secretsService.getSecret(
      "default",
      "database_encryption_key",
    );
    const startedWith = tdlibService.getLastEnsureStartedCredentials();

    expect(state.authStep).toBe("wait_phone_number");
    expect(savedKey).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);
    expect(savedKey?.length).toBeGreaterThan(36);
    expect(startedWith?.databaseEncryptionKey).toBe(savedKey);
  });

  it("downgrades a stale persisted connected state when the runtime is not actually ready", async () => {
    const { root, downloadRoot, telegramService, secretsService, tdlibService } =
      await createTelegramService();
    cleanup.push(root, downloadRoot);

    const telegramRoot = path.join(root, "telegram");
    await fs.mkdir(telegramRoot, { recursive: true });
    await fs.writeFile(
      path.join(telegramRoot, "state.json"),
      JSON.stringify(
        {
          schemaVersion: 1,
          backend: "tdlib",
          status: "connected",
          authStep: "ready",
          selectedMode: "user",
          recommendedMode: "user",
          message: "Telegram is connected.",
          tdlib: {
            apiId: "12345",
            apiHashConfigured: true,
          },
          user: {
            phoneNumber: "+12025550123",
          },
          sessionUser: {
            id: 1,
            username: "stickersmith",
            displayName: "Sticker Smith",
          },
          lastError: null,
          updatedAt: "2026-03-12T00:00:00.000Z",
        },
        null,
        2,
      ),
    );
    await secretsService.setSecret("default", "api_hash", VALID_API_HASH);
    tdlibService.setCurrentAuthState("wait_code");

    const state = await telegramService.getState();

    expect(state.status).toBe("awaiting_credentials");
    expect(state.authStep).toBe("wait_code");
    expect(state.sessionUser).toBeNull();
    expect(state.message).toContain("login code");
  });

  it("migrates plaintext telegram secrets out of state.json", async () => {
    const { root, downloadRoot, telegramService, secretsService } =
      await createTelegramService();
    cleanup.push(root, downloadRoot);

    const telegramRoot = path.join(root, "telegram");
    await fs.mkdir(telegramRoot, { recursive: true });
    await fs.writeFile(
      path.join(telegramRoot, "state.json"),
      JSON.stringify(
        {
          schemaVersion: 1,
          backend: "tdlib",
          status: "configured",
          authStep: "runtime_pending",
          selectedMode: "bot",
          recommendedMode: "user",
          message: "Old scaffold state.",
          credentials: {
            apiId: "54321",
            apiHash: LEGACY_API_HASH,
            phoneNumber: "+12025550123",
            botToken: "12345:test-bot-token",
          },
          updatedAt: "2026-03-01T00:00:00.000Z",
        },
        null,
        2,
      ),
    );

    const state = await telegramService.getState();
    const rewritten = JSON.parse(
      await fs.readFile(path.join(telegramRoot, "state.json"), "utf8"),
    ) as Record<string, unknown>;

    expect(state.tdlib.apiId).toBe("54321");
    expect(state.tdlib.apiHashConfigured).toBe(true);
    expect(state.user.phoneNumber).toBe("+12025550123");
    expect(state.status).toBe("awaiting_credentials");
    expect(state.authStep).toBe("wait_code");
    expect(state.selectedMode).toBe("user");
    expect(await secretsService.getSecret("default", "api_hash")).toBe(LEGACY_API_HASH);
    expect(await secretsService.getSecret("default", "bot_token")).toBe(
      "12345:test-bot-token",
    );
    expect(rewritten).not.toHaveProperty("credentials");
  });

  it("normalizes deprecated auth state values from older telegram setup files", async () => {
    const { root, downloadRoot, telegramService } = await createTelegramService();
    cleanup.push(root, downloadRoot);

    const telegramRoot = path.join(root, "telegram");
    await fs.mkdir(telegramRoot, { recursive: true });
    await fs.writeFile(
      path.join(telegramRoot, "state.json"),
      JSON.stringify(
        {
          schemaVersion: 1,
          backend: "tdlib",
          status: "configured",
          authStep: "choose_mode",
          selectedMode: null,
          recommendedMode: "user",
          message: "Outdated setup state.",
          tdlib: {
            apiId: null,
            apiHashConfigured: false,
          },
          user: {
            phoneNumber: null,
          },
          updatedAt: "2026-03-01T00:00:00.000Z",
        },
        null,
        2,
      ),
    );

    const state = await telegramService.getState();

    expect(state.status).toBe("disconnected");
    expect(state.authStep).toBe("wait_tdlib_parameters");
    expect(state.selectedMode).toBe("user");
    expect(state.recommendedMode).toBe("user");
  });

  it("moves through the user setup steps and reaches a connected session", async () => {
    const { root, downloadRoot, telegramService } = await createTelegramService();
    cleanup.push(root, downloadRoot);

    const withParameters = await telegramService.submitTdlibParameters({
      apiId: "12345",
      apiHash: VALID_API_HASH,
    });
    const withPhoneNumber = await telegramService.submitPhoneNumber({
      phoneNumber: "+12025550123",
    });
    const ready = await telegramService.submitCode({
      code: "12345",
    });

    expect(withParameters.authStep).toBe("wait_phone_number");
    expect(withParameters.tdlib.apiId).toBe("12345");
    expect(withParameters.tdlib.apiHashConfigured).toBe(true);
    expect(withPhoneNumber.authStep).toBe("wait_code");
    expect(withPhoneNumber.user.phoneNumber).toBe("+12025550123");
    expect(ready.status).toBe("connected");
    expect(ready.authStep).toBe("ready");
    expect(ready.sessionUser?.username).toBe("stickersmith");
  });

  it("normalizes phone number formatting before submitting it to tdlib", async () => {
    const { root, downloadRoot, telegramService, tdlibService } =
      await createTelegramService();
    cleanup.push(root, downloadRoot);

    await telegramService.submitTdlibParameters({
      apiId: "12345",
      apiHash: VALID_API_HASH,
    });
    await telegramService.submitPhoneNumber({
      phoneNumber: "+81 70-1234-5678",
    });

    expect(tdlibService.getSubmitPhoneNumberCalls()).toContain("+817012345678");
  });

  it("does not submit the phone number twice when tdlib already sent it during startup", async () => {
    const { root, downloadRoot, telegramService, tdlibService } =
      await createTelegramService();
    cleanup.push(root, downloadRoot);

    await telegramService.submitTdlibParameters({
      apiId: "12345",
      apiHash: VALID_API_HASH,
    });
    await telegramService.submitPhoneNumber({
      phoneNumber: "+817012345678",
    });

    expect(tdlibService.getSubmitPhoneNumberCalls()).toEqual(["+817012345678"]);
  });

  it("normalizes pasted tdlib credentials before saving them", async () => {
    const { root, downloadRoot, telegramService, secretsService } =
      await createTelegramService();
    cleanup.push(root, downloadRoot);

    const state = await telegramService.submitTdlibParameters({
      apiId: ' "12345"\n',
      apiHash: " \u200b0123456789abcdef0123456789abcdef\r\n",
    });

    expect(state.tdlib.apiId).toBe("12345");
    expect(await secretsService.getSecret("default", "api_hash")).toBe(
      "0123456789abcdef0123456789abcdef",
    );
  });

  it("rejects malformed tdlib credentials before starting tdlib", async () => {
    const { root, downloadRoot, telegramService } = await createTelegramService();
    cleanup.push(root, downloadRoot);

    await expect(
      telegramService.submitTdlibParameters({
        apiId: "12 345",
        apiHash: "not-a-real-hash",
      }),
    ).rejects.toThrow(
      "Telegram api_hash should be the 32-character hash from my.telegram.org.",
    );
  });

  it("deduplicates concurrent owned telegram pack sync requests", async () => {
    const { root, downloadRoot, telegramService, tdlibService } =
      await createTelegramService();
    cleanup.push(root, downloadRoot);

    await telegramService.submitTdlibParameters({
      apiId: "12345",
      apiHash: VALID_API_HASH,
    });
    await telegramService.submitPhoneNumber({
      phoneNumber: "+12025550123",
    });
    await telegramService.submitCode({ code: "12345" });

    const originalGetOwnedStickerSets =
      tdlibService.getOwnedStickerSets.bind(tdlibService);
    let resolveOwnedStickerSets: (() => void) | null = null;
    let requestCount = 0;

    tdlibService.getOwnedStickerSets = async () => {
      requestCount += 1;
      await new Promise<void>((resolve) => {
        resolveOwnedStickerSets = resolve;
      });
      return originalGetOwnedStickerSets();
    };

    const firstSync = telegramService.syncOwnedPacks();
    const secondSync = telegramService.syncOwnedPacks();

    await waitForCount(() => requestCount, 1);
    expect(requestCount).toBe(1);

    resolveOwnedStickerSets?.();
    await Promise.all([firstSync, secondSync]);

    expect(requestCount).toBe(1);
  });

  it("deduplicates concurrent telegram pack media downloads", async () => {
    const { root, downloadRoot, telegramService, tdlibService, libraryService } =
      await createTelegramService();
    cleanup.push(root, downloadRoot);

    await telegramService.submitTdlibParameters({
      apiId: "12345",
      apiHash: VALID_API_HASH,
    });
    await telegramService.submitPhoneNumber({
      phoneNumber: "+12025550123",
    });
    await telegramService.submitCode({ code: "12345" });
    await telegramService.syncOwnedPacks();

    const mirrorPack = await libraryService.findPackByTelegramStickerSetId("100");
    expect(mirrorPack).toBeTruthy();
    const mirrorDetails = await libraryService.getPack(mirrorPack!.record.id);
    await libraryService.setTelegramAssetDownloadState({
      packId: mirrorPack!.record.id,
      assetId: mirrorDetails.assets[0]!.id,
      downloadState: "missing",
    });

    const originalDownloadFile = tdlibService.downloadFile.bind(tdlibService);
    let resolveDownload: (() => void) | null = null;
    let downloadCount = 0;

    tdlibService.downloadFile = async (...args: []) => {
      downloadCount += 1;
      await new Promise<void>((resolve) => {
        resolveDownload = resolve;
      });
      return originalDownloadFile(...args);
    };

    const firstDownload = telegramService.downloadPackMedia({
      packId: mirrorPack!.record.id,
    });
    const secondDownload = telegramService.downloadPackMedia({
      packId: mirrorPack!.record.id,
    });

    await waitForCount(() => downloadCount, 1);
    expect(downloadCount).toBe(1);

    resolveDownload?.();
    await Promise.all([firstDownload, secondDownload]);

    expect(downloadCount).toBe(1);
  });

  it("removes telegram mirrors but keeps local packs on logout", async () => {
    const { root, downloadRoot, libraryService, telegramService, secretsService } =
      await createTelegramService();
    cleanup.push(root, downloadRoot);

    await telegramService.submitTdlibParameters({
      apiId: "12345",
      apiHash: VALID_API_HASH,
    });
    await telegramService.submitPhoneNumber({
      phoneNumber: "+12025550123",
    });
    await telegramService.submitCode({ code: "12345" });

    await libraryService.createPack({ name: "Local Pack" });
    await telegramService.syncOwnedPacks();
    expect(await libraryService.listPacks()).toHaveLength(2);

    const loggedOut = await telegramService.logout();
    const remaining = await libraryService.listPacks();

    expect(loggedOut.status).toBe("disconnected");
    expect(loggedOut.authStep).toBe("wait_tdlib_parameters");
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.source).toBe("local");
    expect(await secretsService.getSecret("default", "api_hash")).toBeNull();
  });

  it("rejects telegram publish when a sticker output file is missing", async () => {
    const { root, downloadRoot, libraryService, telegramService } =
      await createTelegramService();
    cleanup.push(root, downloadRoot);

    await telegramService.submitTdlibParameters({
      apiId: "12345",
      apiHash: VALID_API_HASH,
    });
    await telegramService.submitPhoneNumber({
      phoneNumber: "+12025550123",
    });
    await telegramService.submitCode({ code: "12345" });

    const { pack, outputPath, fileRoot } =
      await createLocalPackWithStickerOutput(libraryService);
    cleanup.push(fileRoot);
    await fs.rm(outputPath, { force: true });

    await expect(
      telegramService.publishLocalPack({
        packId: pack.id,
        title: "Upload Pack",
        shortName: "upload_pack",
      }),
    ).rejects.toThrow("Sticker output for sticker.png is missing");
  });

  it("publishes a local pack when the icon asset has no sticker emoji metadata", async () => {
    const { root, downloadRoot, libraryService, telegramService } =
      await createTelegramService();
    cleanup.push(root, downloadRoot);

    await telegramService.submitTdlibParameters({
      apiId: "12345",
      apiHash: VALID_API_HASH,
    });
    await telegramService.submitPhoneNumber({
      phoneNumber: "+12025550123",
    });
    await telegramService.submitCode({ code: "12345" });

    const { pack, fileRoot } = await createLocalPackWithStickerOutput(libraryService);
    cleanup.push(fileRoot);
    await addLocalIconAsset(libraryService, {
      packId: pack.id,
      outputRoot: pack.outputRoot,
      fileRoot,
    });

    await telegramService.publishLocalPack({
      packId: pack.id,
      title: "Upload Pack",
      shortName: "upload_pack",
    });

    const packs = await libraryService.listPacks();
    expect(packs).toHaveLength(1);
    expect(packs[0]?.id).toBe(pack.id);
  });

  it("rejects telegram publish when the selected icon has no icon output", async () => {
    const { root, downloadRoot, libraryService, telegramService } =
      await createTelegramService();
    cleanup.push(root, downloadRoot);

    await telegramService.submitTdlibParameters({
      apiId: "12345",
      apiHash: VALID_API_HASH,
    });
    await telegramService.submitPhoneNumber({
      phoneNumber: "+12025550123",
    });
    await telegramService.submitCode({ code: "12345" });

    const { pack, fileRoot } = await createLocalPackWithStickerOutput(libraryService);
    cleanup.push(fileRoot);
    const iconPath = path.join(fileRoot, "icon.png");
    await fs.writeFile(iconPath, "icon-data");
    const imported = await libraryService.importFiles(pack.id, [iconPath]);
    const iconAssetId = imported.imported[0]!.id;
    await libraryService.setPackIcon({
      packId: pack.id,
      assetId: iconAssetId,
    });

    await expect(
      telegramService.publishLocalPack({
        packId: pack.id,
        title: "Upload Pack",
        shortName: "upload_pack",
      }),
    ).rejects.toThrow(
      "The selected icon asset must have a current icon output before Telegram upload.",
    );
  });

  it("does not resync owned packs immediately after a successful publish", async () => {
    const { root, downloadRoot, libraryService, telegramService, tdlibService } =
      await createTelegramService();
    cleanup.push(root, downloadRoot);

    await telegramService.submitTdlibParameters({
      apiId: "12345",
      apiHash: VALID_API_HASH,
    });
    await telegramService.submitPhoneNumber({
      phoneNumber: "+12025550123",
    });
    await telegramService.submitCode({ code: "12345" });

    const { pack, fileRoot } = await createLocalPackWithStickerOutput(libraryService);
    cleanup.push(fileRoot);
    const beforeCount = tdlibService.getOwnedStickerSetRequestCount();

    await telegramService.publishLocalPack({
      packId: pack.id,
      title: "Upload Pack",
      shortName: "upload_pack",
    });

    expect(tdlibService.getOwnedStickerSetRequestCount()).toBe(beforeCount);
    expect(await libraryService.findPackByTelegramStickerSetId("100")).toBeNull();
  });

  it("rejects telegram publish when the selected icon is the only asset", async () => {
    const { root, downloadRoot, libraryService, telegramService } =
      await createTelegramService();
    cleanup.push(root, downloadRoot);

    await telegramService.submitTdlibParameters({
      apiId: "12345",
      apiHash: VALID_API_HASH,
    });
    await telegramService.submitPhoneNumber({
      phoneNumber: "+12025550123",
    });
    await telegramService.submitCode({ code: "12345" });

    const { pack, fileRoot } = await createLocalPackWithStickerOutput(libraryService);
    cleanup.push(fileRoot);
    const details = await libraryService.getPack(pack.id);
    await libraryService.setPackIcon({
      packId: pack.id,
      assetId: details.assets[0]!.id,
    });
    await addIconOutput(libraryService, {
      packId: pack.id,
      assetId: details.assets[0]!.id,
      outputRoot: pack.outputRoot,
    });

    await expect(
      telegramService.publishLocalPack({
        packId: pack.id,
        title: "Upload Pack",
        shortName: "upload_pack",
      }),
    ).rejects.toThrow("The pack needs at least one sticker asset before upload.");
  });

  it("recovers a published telegram mirror when a later publish step fails", async () => {
    const { root, downloadRoot, libraryService, telegramService, tdlibService } =
      await createTelegramService();
    cleanup.push(root, downloadRoot);

    await telegramService.submitTdlibParameters({
      apiId: "12345",
      apiHash: VALID_API_HASH,
    });
    await telegramService.submitPhoneNumber({
      phoneNumber: "+12025550123",
    });
    await telegramService.submitCode({ code: "12345" });

    const { pack, fileRoot } = await createLocalPackWithStickerOutput(libraryService);
    cleanup.push(fileRoot);
    const details = await libraryService.getPack(pack.id);
    await addIconOutput(libraryService, {
      packId: pack.id,
      assetId: details.assets[0]!.id,
      outputRoot: pack.outputRoot,
    });

    tdlibService.setSetStickerSetThumbnailError(new Error("thumbnail failed"));

    await telegramService.publishLocalPack({
      packId: pack.id,
      title: "Upload Pack",
      shortName: "upload_pack",
    });

    const mirror = await libraryService.findPackByTelegramStickerSetId("100");
    expect(mirror).not.toBeNull();
    expect(mirror?.record.telegram?.publishedFromLocalPackId).toBe(pack.id);
    expect(mirror?.record.telegram?.syncState).toBe("error");
    expect(mirror?.record.telegram?.lastSyncError).toBe("thumbnail failed");
  });

  it("syncs owned telegram video sticker sets into mirror packs", async () => {
    const { root, downloadRoot, libraryService, telegramService } =
      await createTelegramService();
    cleanup.push(root, downloadRoot);

    await telegramService.submitTdlibParameters({
      apiId: "12345",
      apiHash: VALID_API_HASH,
    });
    await telegramService.submitPhoneNumber({
      phoneNumber: "+12025550123",
    });
    await telegramService.submitCode({ code: "12345" });

    await telegramService.syncOwnedPacks();

    const packs = await libraryService.listPacks();
    expect(packs).toHaveLength(1);
    expect(packs[0]?.source).toBe("telegram");
    expect(packs[0]?.telegram?.stickerSetId).toBe("100");
    expect(packs[0]?.iconAssetId).toBeNull();
    expect(packs[0]?.thumbnailPath).toContain("/source/telegram-pack-icon");

    const details = await libraryService.getPack(packs[0]!.id);
    expect(details.assets[0]?.emojiList).toEqual(["🙂"]);
    expect(details.assets[0]?.absolutePath).not.toBeNull();
    expect(details.assets[0]?.downloadState).toBe("ready");
    expect(details.outputs[0]?.relativePath).toBe(`${details.assets[0]?.id}.webm`);
    expect(details.outputs[0]?.sourceAssetId).toBe(details.assets[0]?.id);
    expect(details.assets[0]?.order).toBe(0);
    expect(details.outputs[0]?.order).toBe(0);
  });

  it("keeps non-video owned packs as unsupported telegram mirrors", async () => {
    const { root, downloadRoot, libraryService, telegramService, tdlibService } =
      await createTelegramService();
    cleanup.push(root, downloadRoot);

    await telegramService.submitTdlibParameters({
      apiId: "12345",
      apiHash: VALID_API_HASH,
    });
    await telegramService.submitPhoneNumber({
      phoneNumber: "+12025550123",
    });
    await telegramService.submitCode({ code: "12345" });

    tdlibService.setOwnedStickerSets([
      {
        stickerSetId: "200",
        shortName: "static_pack",
        title: "Static Pack",
        format: "static",
        thumbnailStickerId: "sticker-1",
        stickers: [
          {
            stickerId: "sticker-1",
            fileId: "remote-1",
            fileUniqueId: "unique-1",
            numericFileId: 101,
            position: 0,
            emojiList: ["🙂"],
            format: "static",
          },
        ],
      },
    ]);

    await telegramService.syncOwnedPacks();

    const packs = await libraryService.listPacks();
    expect(packs).toHaveLength(1);
    expect(packs[0]?.telegram?.stickerSetId).toBe("200");
    expect(packs[0]?.telegram?.format).toBe("static");
    expect(packs[0]?.telegram?.syncState).toBe("unsupported");
    expect(packs[0]?.telegram?.lastSyncError).toContain(
      "only video sticker packs are supported currently",
    );

    const details = await libraryService.getPack(packs[0]!.id);
    expect(details.assets).toHaveLength(0);
  });

  it("fetches the real telegram thumbnail sticker for supported packs", async () => {
    const { root, downloadRoot, telegramService, libraryService, tdlibService } =
      await createTelegramService();
    cleanup.push(root, downloadRoot);

    await telegramService.submitTdlibParameters({
      apiId: "12345",
      apiHash: VALID_API_HASH,
    });
    await telegramService.submitPhoneNumber({
      phoneNumber: "+12025550123",
    });
    await telegramService.submitCode({ code: "12345" });

    tdlibService.setOwnedStickerSets([
      {
        stickerSetId: "100",
        shortName: "sample_pack",
        title: "Sample Pack",
        format: "video",
        thumbnailStickerId: "sticker-1",
        thumbnailFile: null,
        stickers: [
          {
            stickerId: "sticker-1",
            fileId: "remote-1",
            fileUniqueId: "unique-1",
            numericFileId: 101,
            position: 0,
            emojiList: ["🙂"],
            format: "video",
          },
        ],
      },
    ]);

    await telegramService.syncOwnedPacks();

    const [pack] = await libraryService.listPacks();
    expect(pack?.thumbnailPath).toContain("/source/telegram-pack-icon");
  });

  it("clears the stored telegram thumbnail when the remote set has no thumbnail", async () => {
    const { root, downloadRoot, libraryService, telegramService, tdlibService } =
      await createTelegramService();
    cleanup.push(root, downloadRoot);

    await telegramService.submitTdlibParameters({
      apiId: "12345",
      apiHash: VALID_API_HASH,
    });
    await telegramService.submitPhoneNumber({
      phoneNumber: "+12025550123",
    });
    await telegramService.submitCode({ code: "12345" });

    await telegramService.syncOwnedPacks();
    let [mirrorPack] = await libraryService.listPacks();
    expect(mirrorPack?.thumbnailPath).toContain("/source/telegram-pack-icon");

    tdlibService.setOwnedStickerSets([
      {
        stickerSetId: "100",
        shortName: "sample_pack",
        title: "Sample Pack",
        format: "video",
        thumbnailStickerId: null,
        thumbnailFile: null,
        stickers: [
          {
            stickerId: "sticker-1",
            fileId: "remote-1",
            fileUniqueId: "unique-1",
            numericFileId: 101,
            position: 0,
            emojiList: ["🙂"],
            format: "video",
          },
        ],
      },
    ]);

    await telegramService.syncOwnedPacks();

    [mirrorPack] = await libraryService.listPacks();
    expect(mirrorPack?.iconAssetId).toBeNull();
    expect(mirrorPack?.thumbnailPath).toBeNull();
  });

  it("downloads missing sticker media during owned-pack sync", async () => {
    const { root, downloadRoot, telegramService, tdlibService } =
      await createTelegramService();
    cleanup.push(root, downloadRoot);

    await telegramService.submitTdlibParameters({
      apiId: "12345",
      apiHash: VALID_API_HASH,
    });
    await telegramService.submitPhoneNumber({
      phoneNumber: "+12025550123",
    });
    await telegramService.submitCode({ code: "12345" });

    const originalDownloadFile = tdlibService.downloadFile.bind(tdlibService);
    let downloadCount = 0;
    tdlibService.downloadFile = async (...args: [number?]) => {
      downloadCount += 1;
      return originalDownloadFile(...args);
    };

    await telegramService.syncOwnedPacks();

    expect(downloadCount).toBe(1);
  });

  it("does not fetch thumbnails for unsupported packs during sync", async () => {
    const { root, downloadRoot, telegramService, tdlibService } =
      await createTelegramService();
    cleanup.push(root, downloadRoot);

    await telegramService.submitTdlibParameters({
      apiId: "12345",
      apiHash: VALID_API_HASH,
    });
    await telegramService.submitPhoneNumber({
      phoneNumber: "+12025550123",
    });
    await telegramService.submitCode({ code: "12345" });

    tdlibService.setOwnedStickerSets([
      {
        stickerSetId: "200",
        shortName: "static_pack",
        title: "Static Pack",
        format: "static",
        thumbnailStickerId: "sticker-1",
        thumbnailFile: {
          numericFileId: 201,
          fileId: "thumb-remote-1",
          fileUniqueId: "thumb-unique-1",
          localPath: null,
          size: 128,
          downloadedSize: 0,
          isDownloaded: false,
        },
        stickers: [
          {
            stickerId: "sticker-1",
            fileId: "remote-1",
            fileUniqueId: "unique-1",
            numericFileId: 101,
            position: 0,
            emojiList: ["🙂"],
            format: "static",
          },
        ],
      },
    ]);

    const originalDownloadFile = tdlibService.downloadFile.bind(tdlibService);
    let downloadCount = 0;
    tdlibService.downloadFile = async (...args: [number?]) => {
      downloadCount += 1;
      return originalDownloadFile(...args);
    };

    await telegramService.syncOwnedPacks();

    expect(downloadCount).toBe(0);
  });

  it("preserves downloaded telegram media across resyncs", async () => {
    const { root, downloadRoot, telegramService, libraryService, tdlibService } =
      await createTelegramService();
    cleanup.push(root, downloadRoot);

    await telegramService.submitTdlibParameters({
      apiId: "12345",
      apiHash: VALID_API_HASH,
    });
    await telegramService.submitPhoneNumber({
      phoneNumber: "+12025550123",
    });
    await telegramService.submitCode({ code: "12345" });

    const originalDownloadFile = tdlibService.downloadFile.bind(tdlibService);
    let downloadCount = 0;
    tdlibService.downloadFile = async (...args: [number?]) => {
      downloadCount += 1;
      return originalDownloadFile(...args);
    };

    await telegramService.syncOwnedPacks();
    const mirror = await libraryService.findPackByTelegramStickerSetId("100");
    expect(mirror).not.toBeNull();
    let details = await libraryService.getPack(mirror!.record.id);
    expect(details.assets[0]?.downloadState).toBe("ready");
    expect(details.assets[0]?.absolutePath).not.toBeNull();
    expect(details.outputs[0]?.relativePath).toBe(`${details.assets[0]?.id}.webm`);
    await expect(fs.readFile(details.outputs[0]!.absolutePath, "utf8")).resolves.toBe(
      "webm-data",
    );

    await telegramService.syncOwnedPacks();

    details = await libraryService.getPack(mirror!.record.id);
    expect(details.assets[0]?.downloadState).toBe("ready");
    expect(details.assets[0]?.absolutePath).not.toBeNull();
    expect(details.assets[0]?.relativePath).toBe(`${details.assets[0]?.id}.webm`);
    expect(details.outputs[0]?.relativePath).toBe(`${details.assets[0]?.id}.webm`);
    expect(downloadCount).toBe(1);
  });

  it("migrates downloaded telegram media from nested sticker paths to flat source paths", async () => {
    const { root, downloadRoot, telegramService, libraryService } =
      await createTelegramService();
    cleanup.push(root, downloadRoot);

    await telegramService.submitTdlibParameters({
      apiId: "12345",
      apiHash: VALID_API_HASH,
    });
    await telegramService.submitPhoneNumber({
      phoneNumber: "+12025550123",
    });
    await telegramService.submitCode({ code: "12345" });

    await telegramService.syncOwnedPacks();
    const mirror = await libraryService.findPackByTelegramStickerSetId("100");
    expect(mirror).not.toBeNull();
    const assetId = mirror!.record.assets[0]!.id;
    const nestedPath = path.join(mirror!.rootPath, "source", "stickers/001.webm");
    const flatPath = path.join(mirror!.rootPath, "source", `${assetId}.webm`);
    await fs.mkdir(path.dirname(nestedPath), { recursive: true });
    await fs.rename(flatPath, nestedPath);
    const packRecordPath = path.join(mirror!.rootPath, "pack.json");
    const packRecord = JSON.parse(
      await fs.readFile(packRecordPath, "utf8"),
    ) as {
      assets: Array<{ relativePath: string }>;
    };
    packRecord.assets[0]!.relativePath = "stickers/001.webm";
    await fs.writeFile(packRecordPath, JSON.stringify(packRecord, null, 2));

    await telegramService.syncOwnedPacks();

    const details = await libraryService.getPack(mirror!.record.id);
    expect(details.assets[0]?.relativePath).toBe(`${details.assets[0]?.id}.webm`);
    expect(details.assets[0]?.absolutePath).toBe(flatPath);
  });

  it("removes telegram mirrors that are no longer owned after resync", async () => {
    const { root, downloadRoot, libraryService, telegramService, tdlibService } =
      await createTelegramService();
    cleanup.push(root, downloadRoot);

    await telegramService.submitTdlibParameters({
      apiId: "12345",
      apiHash: VALID_API_HASH,
    });
    await telegramService.submitPhoneNumber({
      phoneNumber: "+12025550123",
    });
    await telegramService.submitCode({ code: "12345" });

    await telegramService.syncOwnedPacks();
    expect(await libraryService.listPacks()).toHaveLength(1);

    tdlibService.setOwnedStickerSets([]);
    await telegramService.syncOwnedPacks();

    expect(await libraryService.listPacks()).toHaveLength(0);
  });

  it("stores the last telegram mirror sync error after update failures", async () => {
    const { root, downloadRoot, libraryService, telegramService, tdlibService } =
      await createTelegramService();
    cleanup.push(root, downloadRoot);

    await telegramService.submitTdlibParameters({
      apiId: "12345",
      apiHash: VALID_API_HASH,
    });
    await telegramService.submitPhoneNumber({
      phoneNumber: "+12025550123",
    });
    await telegramService.submitCode({ code: "12345" });

    await telegramService.syncOwnedPacks();
    const [mirrorPack] = await libraryService.listPacks();
    expect(mirrorPack).toBeDefined();

    await libraryService.renamePack({
      packId: mirrorPack!.id,
      name: "Renamed Pack",
    });

    tdlibService.setSetStickerSetTitleError(
      new Error("STICKERSET_INVALID"),
    );

    await expect(
      telegramService.updateTelegramPack({ packId: mirrorPack!.id }),
    ).rejects.toThrow("STICKERSET_INVALID");

    const updated = await libraryService.getPack(mirrorPack!.id);
    expect(updated.pack.telegram?.syncState).toBe("error");
    expect(updated.pack.telegram?.lastSyncError).toBe(
      "The selected Telegram sticker set is no longer owned by the current account.",
    );
  });

  it("rejects telegram mirror updates when a non-icon sticker has no emoji", async () => {
    const { root, downloadRoot, libraryService, telegramService } =
      await createTelegramService();
    cleanup.push(root, downloadRoot);

    await telegramService.submitTdlibParameters({
      apiId: "12345",
      apiHash: VALID_API_HASH,
    });
    await telegramService.submitPhoneNumber({
      phoneNumber: "+12025550123",
    });
    await telegramService.submitCode({ code: "12345" });

    await telegramService.syncOwnedPacks();
    const [mirrorPack] = await libraryService.listPacks();
    const details = await libraryService.getPack(mirrorPack!.id);

    await libraryService.setAssetEmojis({
      packId: mirrorPack!.id,
      assetId: details.assets[0]!.id,
      emojis: [],
    });

    await expect(
      telegramService.updateTelegramPack({ packId: mirrorPack!.id }),
    ).rejects.toThrow(
      "Every sticker asset must have at least one emoji before update.",
    );

    const updated = await libraryService.getPack(mirrorPack!.id);
    expect(updated.pack.telegram?.syncState).toBe("error");
    expect(updated.pack.telegram?.lastSyncError).toContain(
      "Every sticker asset must have at least one emoji before update.",
    );
  });

  it("rejects telegram mirror updates when all non-icon stickers are removed", async () => {
    const { root, downloadRoot, libraryService, telegramService } =
      await createTelegramService();
    cleanup.push(root, downloadRoot);

    await telegramService.submitTdlibParameters({
      apiId: "12345",
      apiHash: VALID_API_HASH,
    });
    await telegramService.submitPhoneNumber({
      phoneNumber: "+12025550123",
    });
    await telegramService.submitCode({ code: "12345" });

    await telegramService.syncOwnedPacks();
    const [mirrorPack] = await libraryService.listPacks();
    const details = await libraryService.getPack(mirrorPack!.id);
    await libraryService.deleteAsset({
      packId: mirrorPack!.id,
      assetId: details.assets[0]!.id,
    });

    await expect(
      telegramService.updateTelegramPack({ packId: mirrorPack!.id }),
    ).rejects.toThrow(
      "Telegram mirrors must keep at least one sticker.",
    );

    const updated = await libraryService.getPack(mirrorPack!.id);
    expect(updated.pack.telegram?.syncState).toBe("error");
    expect(updated.pack.telegram?.lastSyncError).toContain(
      "Telegram mirrors must keep at least one sticker.",
    );
  });

  it("rejects telegram mirror updates when a changed sticker output file is missing", async () => {
    const { root, downloadRoot, libraryService, telegramService } =
      await createTelegramService();
    cleanup.push(root, downloadRoot);

    await telegramService.submitTdlibParameters({
      apiId: "12345",
      apiHash: VALID_API_HASH,
    });
    await telegramService.submitPhoneNumber({
      phoneNumber: "+12025550123",
    });
    await telegramService.submitCode({ code: "12345" });

    await telegramService.syncOwnedPacks();
    const [mirrorPack] = await libraryService.listPacks();
    const details = await libraryService.getPack(mirrorPack!.id);
    const outputFileName = `${details.assets[0]!.id}.webm`;
    await libraryService.recordConversionResult(mirrorPack!.id, {
      assetId: details.assets[0]!.id,
      mode: "sticker",
      outputFileName,
      sizeBytes: 256,
    });
    const outputPath = path.join(mirrorPack!.outputRoot, outputFileName);
    await fs.rm(outputPath, { force: true });

    await expect(
      telegramService.updateTelegramPack({ packId: mirrorPack!.id }),
    ).rejects.toThrow(`Sticker output for ${details.assets[0]!.relativePath} is missing`);

    const updated = await libraryService.getPack(mirrorPack!.id);
    expect(updated.pack.telegram?.syncState).toBe("error");
    expect(updated.pack.telegram?.lastSyncError).toContain(
      `Sticker output for ${details.assets[0]!.relativePath} is missing`,
    );
  });

  it("does not re-add a stale local duplicate during telegram mirror update", async () => {
    const { root, downloadRoot, libraryService, telegramService, tdlibService } =
      await createTelegramService();
    cleanup.push(root, downloadRoot);

    await telegramService.submitTdlibParameters({
      apiId: "12345",
      apiHash: VALID_API_HASH,
    });
    await telegramService.submitPhoneNumber({
      phoneNumber: "+12025550123",
    });
    await telegramService.submitCode({ code: "12345" });

    await telegramService.syncOwnedPacks();
    const [mirrorPack] = await libraryService.listPacks();
    const details = await libraryService.getPack(mirrorPack!.id);
    const remoteAsset = details.assets[0]!;
    const duplicateSourcePath = path.join(
      os.tmpdir(),
      `sticker-smith-duplicate-${remoteAsset.id}.webm`,
    );
    cleanup.push(duplicateSourcePath);
    await fs.copyFile(remoteAsset.absolutePath!, duplicateSourcePath);

    const imported = await libraryService.importFiles(mirrorPack!.id, [
      duplicateSourcePath,
    ]);
    const duplicateAssetId = imported.imported[0]!.id;
    await libraryService.setAssetEmojis({
      packId: mirrorPack!.id,
      assetId: duplicateAssetId,
      emojis: [...remoteAsset.emojiList],
    });

    const duplicateOutputPath = path.join(
      mirrorPack!.outputRoot,
      `${duplicateAssetId}.webm`,
    );
    await fs.copyFile(remoteAsset.absolutePath!, duplicateOutputPath);
    await libraryService.recordConversionResult(mirrorPack!.id, {
      assetId: duplicateAssetId,
      mode: "sticker",
      outputFileName: `${duplicateAssetId}.webm`,
      sizeBytes: 128,
    });

    await telegramService.updateTelegramPack({ packId: mirrorPack!.id });

    expect(tdlibService.getAddedStickers()).toHaveLength(0);
    const updated = await libraryService.getPack(mirrorPack!.id);
    expect(updated.assets.filter((asset) => !asset.telegram)).toHaveLength(0);
  });

  it("updates a single-sticker telegram mirror while keeping its thumbnail sticker as a normal sticker", async () => {
    const { root, downloadRoot, libraryService, telegramService, tdlibService } =
      await createTelegramService();
    cleanup.push(root, downloadRoot);

    await telegramService.submitTdlibParameters({
      apiId: "12345",
      apiHash: VALID_API_HASH,
    });
    await telegramService.submitPhoneNumber({
      phoneNumber: "+12025550123",
    });
    await telegramService.submitCode({ code: "12345" });

    await telegramService.syncOwnedPacks();
    const [mirrorPack] = await libraryService.listPacks();
    expect(mirrorPack?.iconAssetId).toBeNull();

    const details = await libraryService.getPack(mirrorPack!.id);
    expect(details.assets).toHaveLength(1);
    expect(details.outputs[0]?.sourceAssetId).toBe(details.assets[0]?.id);

    await libraryService.setAssetEmojis({
      packId: mirrorPack!.id,
      assetId: details.assets[0]!.id,
      emojis: ["🔥"],
    });

    await telegramService.updateTelegramPack({ packId: mirrorPack!.id });

    expect(tdlibService.getStickerEmojiUpdates()).toContainEqual({
      fileId: "remote-1",
      emojis: ["🔥"],
    });
  });

  it("uses the remote sticker file id when a legacy mirror asset is missing one", async () => {
    const { root, downloadRoot, libraryService, telegramService, tdlibService } =
      await createTelegramService();
    cleanup.push(root, downloadRoot);

    await telegramService.submitTdlibParameters({
      apiId: "12345",
      apiHash: VALID_API_HASH,
    });
    await telegramService.submitPhoneNumber({
      phoneNumber: "+12025550123",
    });
    await telegramService.submitCode({ code: "12345" });

    await telegramService.syncOwnedPacks();
    const [mirrorPack] = await libraryService.listPacks();
    const packRecordPath = path.join(mirrorPack!.rootPath, "pack.json");
    const packRecord = JSON.parse(
      await fs.readFile(packRecordPath, "utf8"),
    ) as {
      assets: Array<{
        telegram?: {
          fileId: string | null;
        };
      }>;
    };
    packRecord.assets[0]!.telegram!.fileId = null;
    await fs.writeFile(packRecordPath, JSON.stringify(packRecord, null, 2));

    const details = await libraryService.getPack(mirrorPack!.id);
    await libraryService.setAssetEmojis({
      packId: mirrorPack!.id,
      assetId: details.assets[0]!.id,
      emojis: ["🔥"],
    });

    await telegramService.updateTelegramPack({ packId: mirrorPack!.id });

    expect(tdlibService.getStickerEmojiUpdates()).toContainEqual({
      fileId: "remote-1",
      emojis: ["🔥"],
    });
  });

  it("clears the remote telegram thumbnail when a mirror icon is removed", async () => {
    const { root, downloadRoot, libraryService, telegramService, tdlibService } =
      await createTelegramService();
    cleanup.push(root, downloadRoot);

    await telegramService.submitTdlibParameters({
      apiId: "12345",
      apiHash: VALID_API_HASH,
    });
    await telegramService.submitPhoneNumber({
      phoneNumber: "+12025550123",
    });
    await telegramService.submitCode({ code: "12345" });

    await telegramService.syncOwnedPacks();
    const [mirrorPack] = await libraryService.listPacks();
    expect(mirrorPack?.iconAssetId).toBeNull();

    const fileRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "sticker-smith-telegram-clear-icon-"),
    );
    cleanup.push(fileRoot);
    const iconPath = path.join(fileRoot, "icon.webm");
    await fs.writeFile(iconPath, "icon-data");
    const imported = await libraryService.importFiles(mirrorPack!.id, [iconPath]);
    const iconAssetId = imported.imported[0]!.id;

    await libraryService.setPackIcon({
      packId: mirrorPack!.id,
      assetId: iconAssetId,
    });
    await libraryService.recordConversionResult(mirrorPack!.id, {
      assetId: iconAssetId,
      mode: "icon",
      outputFileName: "icon.webm",
      sizeBytes: "icon-data".length,
    });
    await fs.writeFile(path.join(mirrorPack!.outputRoot, "icon.webm"), "icon-data");

    await libraryService.setPackIcon({
      packId: mirrorPack!.id,
      assetId: null,
    });
    await telegramService.updateTelegramPack({ packId: mirrorPack!.id });

    expect(tdlibService.getClearedStickerSetThumbnails()).toContain(
      "sample_pack",
    );
  });

  it("updates telegram mirrors after converting a local icon asset without excluding the remote thumbnail sticker", async () => {
    const { root, downloadRoot, libraryService, telegramService, tdlibService } =
      await createTelegramService();
    cleanup.push(root, downloadRoot);

    await telegramService.submitTdlibParameters({
      apiId: "12345",
      apiHash: VALID_API_HASH,
    });
    await telegramService.submitPhoneNumber({
      phoneNumber: "+12025550123",
    });
    await telegramService.submitCode({ code: "12345" });

    await telegramService.syncOwnedPacks();
    const [mirrorPack] = await libraryService.listPacks();
    const initialDetails = await libraryService.getPack(mirrorPack!.id);
    const remoteStickerAsset = initialDetails.assets[0]!;

    await libraryService.setAssetEmojis({
      packId: mirrorPack!.id,
      assetId: remoteStickerAsset.id,
      emojis: ["🔥"],
    });

    const fileRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "sticker-smith-telegram-icon-"),
    );
    cleanup.push(fileRoot);

    const iconPath = path.join(fileRoot, "icon.webm");
    await fs.writeFile(iconPath, "icon-data");
    const imported = await libraryService.importFiles(mirrorPack!.id, [iconPath]);
    const iconAssetId = imported.imported[0]!.id;

    await fs.writeFile(
      path.join(mirrorPack!.outputRoot, `${iconAssetId}.webm`),
      "icon-sticker-data",
    );
    await libraryService.recordConversionResult(mirrorPack!.id, {
      assetId: iconAssetId,
      mode: "sticker",
      outputFileName: `${iconAssetId}.webm`,
      sizeBytes: "icon-sticker-data".length,
    });

    await libraryService.setPackIcon({
      packId: mirrorPack!.id,
      assetId: iconAssetId,
    });
    await libraryService.recordConversionResult(mirrorPack!.id, {
      assetId: iconAssetId,
      mode: "icon",
      outputFileName: "icon.webm",
      sizeBytes: 64,
    });
    await fs.writeFile(path.join(mirrorPack!.outputRoot, "icon.webm"), "icon-data");

    await expect(
      telegramService.updateTelegramPack({ packId: mirrorPack!.id }),
    ).resolves.toBeUndefined();

    const updated = await libraryService.getPack(mirrorPack!.id);
    expect(updated.pack.telegram?.syncState).toBe("idle");
    expect(
      updated.outputs.some(
        (output) =>
          output.sourceAssetId === iconAssetId && output.mode === "sticker",
      ),
    ).toBe(false);
    expect(tdlibService.getStickerEmojiUpdates()).toContainEqual({
      fileId: "remote-1",
      emojis: ["🔥"],
    });
  });

  it("preserves the explicit local icon thumbnail after a later telegram resync", async () => {
    const { root, downloadRoot, libraryService, telegramService } =
      await createTelegramService();
    cleanup.push(root, downloadRoot);

    await telegramService.submitTdlibParameters({
      apiId: "12345",
      apiHash: VALID_API_HASH,
    });
    await telegramService.submitPhoneNumber({
      phoneNumber: "+12025550123",
    });
    await telegramService.submitCode({ code: "12345" });

    await telegramService.syncOwnedPacks();
    const [mirrorPack] = await libraryService.listPacks();

    const fileRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "sticker-smith-telegram-local-icon-resync-"),
    );
    cleanup.push(fileRoot);

    const iconPath = path.join(fileRoot, "icon.webm");
    await fs.writeFile(iconPath, "icon-data");
    const imported = await libraryService.importFiles(mirrorPack!.id, [iconPath]);
    const iconAssetId = imported.imported[0]!.id;

    await libraryService.setPackIcon({
      packId: mirrorPack!.id,
      assetId: iconAssetId,
    });
    await libraryService.recordConversionResult(mirrorPack!.id, {
      assetId: iconAssetId,
      mode: "icon",
      outputFileName: "icon.webm",
      sizeBytes: 64,
    });
    await fs.writeFile(path.join(mirrorPack!.outputRoot, "icon.webm"), "icon-data");

    await telegramService.updateTelegramPack({ packId: mirrorPack!.id });
    await telegramService.syncOwnedPacks();

    const updated = await libraryService.getPack(mirrorPack!.id);
    expect(updated.pack.iconAssetId).toBe(iconAssetId);
    expect(updated.pack.thumbnailPath).toBe(
      path.join(mirrorPack!.outputRoot, "icon.webm"),
    );
    expect(
      updated.outputs.find((output) => output.mode === "icon")?.sourceAssetId,
    ).toBe(iconAssetId);
  });

  it("repairs an empty telegram mirror short name from remote metadata during update", async () => {
    const { root, downloadRoot, libraryService, telegramService } =
      await createTelegramService();
    cleanup.push(root, downloadRoot);

    await telegramService.submitTdlibParameters({
      apiId: "12345",
      apiHash: VALID_API_HASH,
    });
    await telegramService.submitPhoneNumber({
      phoneNumber: "+12025550123",
    });
    await telegramService.submitCode({ code: "12345" });

    await telegramService.syncOwnedPacks();
    const [mirrorPack] = await libraryService.listPacks();
    const packRecordPath = path.join(mirrorPack!.rootPath, "pack.json");
    const packRecord = JSON.parse(
      await fs.readFile(packRecordPath, "utf8"),
    ) as {
      telegram: {
        shortName: string;
      };
    };
    packRecord.telegram.shortName = "";
    await fs.writeFile(packRecordPath, JSON.stringify(packRecord, null, 2));

    const fileRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "sticker-smith-telegram-short-name-"),
    );
    cleanup.push(fileRoot);
    const iconPath = path.join(fileRoot, "icon.webm");
    await fs.writeFile(iconPath, "icon-data");
    const imported = await libraryService.importFiles(mirrorPack!.id, [iconPath]);
    const iconAssetId = imported.imported[0]!.id;

    await libraryService.setPackIcon({
      packId: mirrorPack!.id,
      assetId: iconAssetId,
    });
    await libraryService.recordConversionResult(mirrorPack!.id, {
      assetId: iconAssetId,
      mode: "icon",
      outputFileName: "icon.webm",
      sizeBytes: 64,
    });
    await fs.writeFile(path.join(mirrorPack!.outputRoot, "icon.webm"), "icon-data");

    await expect(
      telegramService.updateTelegramPack({ packId: mirrorPack!.id }),
    ).resolves.toBeUndefined();

    const updated = await libraryService.getPack(mirrorPack!.id);
    expect(updated.pack.telegram?.shortName).toBe("sample_pack");
  });

  it("resyncs telegram mirrors after a late update failure", async () => {
    const { root, downloadRoot, libraryService, telegramService, tdlibService } =
      await createTelegramService();
    cleanup.push(root, downloadRoot);

    await telegramService.submitTdlibParameters({
      apiId: "12345",
      apiHash: VALID_API_HASH,
    });
    await telegramService.submitPhoneNumber({
      phoneNumber: "+12025550123",
    });
    await telegramService.submitCode({ code: "12345" });

    await telegramService.syncOwnedPacks();
    const [mirrorPack] = await libraryService.listPacks();
    const details = await libraryService.getPack(mirrorPack!.id);
    await addIconOutput(libraryService, {
      packId: mirrorPack!.id,
      assetId: details.assets[0]!.id,
      outputRoot: mirrorPack!.outputRoot,
    });

    const beforeCount = tdlibService.getOwnedStickerSetRequestCount();
    tdlibService.setSetStickerSetThumbnailError(new Error("thumbnail failed"));

    await expect(
      telegramService.updateTelegramPack({ packId: mirrorPack!.id }),
    ).rejects.toThrow("thumbnail failed");

    expect(tdlibService.getOwnedStickerSetRequestCount()).toBeGreaterThan(
      beforeCount,
    );

    const updated = await libraryService.getPack(mirrorPack!.id);
    expect(updated.pack.telegram?.syncState).toBe("error");
    expect(updated.pack.telegram?.lastSyncError).toBe("thumbnail failed");
  });
});
