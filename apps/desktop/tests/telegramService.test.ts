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
  private setStickerSetTitleError: Error | null = null;
  private setStickerSetThumbnailError: Error | null = null;
  private ownedStickerSetRequestCount = 0;
  private clearedStickerSetThumbnails: string[] = [];
  private stickerEmojiUpdates: Array<{ fileId: string; emojis: string[] }> = [];
  private ownedStickerSets = [
    {
      stickerSetId: "100",
      shortName: "sample_pack",
      title: "Sample Pack",
      format: "video" as const,
      thumbnailStickerId: "sticker-1",
      stickers: [
        {
          stickerId: "sticker-1",
          fileId: "remote-1",
          fileUniqueId: "unique-1",
          numericFileId: 101,
          position: 0,
          emojiList: ["🙂"],
          format: "video" as const,
        },
      ],
    },
  ];

  constructor(downloadFilePath: string) {
    this.downloadFilePath = downloadFilePath;
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

  getStickerEmojiUpdates() {
    return [...this.stickerEmojiUpdates];
  }

  getOwnedStickerSetRequestCount() {
    return this.ownedStickerSetRequestCount;
  }

  setOwnedStickerSets(
    ownedStickerSets: Array<{
      stickerSetId: string;
      shortName: string;
      title: string;
      format: "video";
      thumbnailStickerId: string | null;
      stickers: Array<{
        stickerId: string;
        fileId: string | null;
        fileUniqueId: string | null;
        numericFileId: number;
        position: number;
        emojiList: string[];
        format: "video";
      }>;
    }>,
  ) {
    this.ownedStickerSets = ownedStickerSets;
  }

  subscribe(listener: TelegramTdlibStateListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async ensureStarted(_credentials: TelegramTdlibCredentials) {
    return;
  }

  async close() {
    return;
  }

  async submitPhoneNumber() {
    for (const listener of this.listeners) {
      listener.onAuthStateChanged({
        authStep: "wait_code",
        message: "Enter the login code Telegram sent to your account.",
      });
    }
  }

  async submitCode() {
    for (const listener of this.listeners) {
      listener.onAuthStateChanged({
        authStep: "ready",
        message: "Telegram is connected.",
        sessionUser: {
          id: 1,
          username: "stickersmith",
          displayName: "Sticker Smith",
        },
      });
    }
  }

  async submitPassword() {
    return;
  }

  async logout() {
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

  async downloadFile() {
    for (const listener of this.listeners) {
      listener.onFileDownloadProgress?.({
        numericFileId: 101,
        downloadedSize: 128,
        totalSize: 128,
      });
    }

    return {
      numericFileId: 101,
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

  async addStickerToSet() {
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
  await libraryService.setAssetEmojis({
    packId: pack.id,
    assetId,
    emojis: ["🙂"],
  });
  await libraryService.recordConversionResult(pack.id, {
    assetId,
    mode: "sticker",
    outputFileName: "sticker-1.webm",
    sizeBytes: 128,
  });
  await fs.writeFile(path.join(pack.outputRoot, "sticker-1.webm"), "webm-data");
  return { pack, outputPath: path.join(pack.outputRoot, "sticker-1.webm"), fileRoot };
}

async function addIconOutput(
  libraryService: LibraryService,
  input: {
    packId: string;
    assetId: string;
    outputRoot: string;
  },
) {
  await libraryService.recordConversionResult(input.packId, {
    assetId: input.assetId,
    mode: "icon",
    outputFileName: "icon.webm",
    sizeBytes: 64,
  });
  await fs.writeFile(path.join(input.outputRoot, "icon.webm"), "icon-data");
  await libraryService.setPackIcon({
    packId: input.packId,
    assetId: input.assetId,
  });
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
            apiHash: "plaintext-api-hash",
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
    expect(await secretsService.getSecret("default", "api_hash")).toBe(
      "plaintext-api-hash",
    );
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
      apiHash: "secret-hash",
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

  it("deduplicates concurrent owned telegram pack sync requests", async () => {
    const { root, downloadRoot, telegramService, tdlibService } =
      await createTelegramService();
    cleanup.push(root, downloadRoot);

    await telegramService.submitTdlibParameters({
      apiId: "12345",
      apiHash: "secret-hash",
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
      apiHash: "secret-hash",
    });
    await telegramService.submitPhoneNumber({
      phoneNumber: "+12025550123",
    });
    await telegramService.submitCode({ code: "12345" });
    await telegramService.syncOwnedPacks();

    const mirrorPack = await libraryService.findPackByTelegramStickerSetId("100");
    expect(mirrorPack).toBeTruthy();

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
      packId: mirrorPack!.id,
    });
    const secondDownload = telegramService.downloadPackMedia({
      packId: mirrorPack!.id,
    });

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
      apiHash: "secret-hash",
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
      apiHash: "secret-hash",
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

  it("recovers a published telegram mirror when a later publish step fails", async () => {
    const { root, downloadRoot, libraryService, telegramService, tdlibService } =
      await createTelegramService();
    cleanup.push(root, downloadRoot);

    await telegramService.submitTdlibParameters({
      apiId: "12345",
      apiHash: "secret-hash",
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
      apiHash: "secret-hash",
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

    const details = await libraryService.getPack(packs[0]!.id);
    expect(details.assets[0]?.emojiList).toEqual(["🙂"]);
    expect(details.assets[0]?.absolutePath).toContain("stickers/001.webm");
  });

  it("removes telegram mirrors that are no longer owned after resync", async () => {
    const { root, downloadRoot, libraryService, telegramService, tdlibService } =
      await createTelegramService();
    cleanup.push(root, downloadRoot);

    await telegramService.submitTdlibParameters({
      apiId: "12345",
      apiHash: "secret-hash",
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
      apiHash: "secret-hash",
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
      apiHash: "secret-hash",
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
      "Every non-icon asset must have at least one emoji before update.",
    );

    const updated = await libraryService.getPack(mirrorPack!.id);
    expect(updated.pack.telegram?.syncState).toBe("error");
    expect(updated.pack.telegram?.lastSyncError).toContain(
      "Every non-icon asset must have at least one emoji before update.",
    );
  });

  it("rejects telegram mirror updates when all non-icon stickers are removed", async () => {
    const { root, downloadRoot, libraryService, telegramService } =
      await createTelegramService();
    cleanup.push(root, downloadRoot);

    await telegramService.submitTdlibParameters({
      apiId: "12345",
      apiHash: "secret-hash",
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
      "Telegram mirrors must keep at least one non-icon sticker.",
    );

    const updated = await libraryService.getPack(mirrorPack!.id);
    expect(updated.pack.telegram?.syncState).toBe("error");
    expect(updated.pack.telegram?.lastSyncError).toContain(
      "Telegram mirrors must keep at least one non-icon sticker.",
    );
  });

  it("rejects telegram mirror updates when a changed sticker output file is missing", async () => {
    const { root, downloadRoot, libraryService, telegramService } =
      await createTelegramService();
    cleanup.push(root, downloadRoot);

    await telegramService.submitTdlibParameters({
      apiId: "12345",
      apiHash: "secret-hash",
    });
    await telegramService.submitPhoneNumber({
      phoneNumber: "+12025550123",
    });
    await telegramService.submitCode({ code: "12345" });

    await telegramService.syncOwnedPacks();
    const [mirrorPack] = await libraryService.listPacks();
    const details = await libraryService.getPack(mirrorPack!.id);
    await libraryService.recordConversionResult(mirrorPack!.id, {
      assetId: details.assets[0]!.id,
      mode: "sticker",
      outputFileName: "sticker-1.webm",
      sizeBytes: 256,
    });
    const outputPath = path.join(mirrorPack!.outputRoot, "sticker-1.webm");
    await fs.rm(outputPath, { force: true });

    await expect(
      telegramService.updateTelegramPack({ packId: mirrorPack!.id }),
    ).rejects.toThrow("Sticker output for stickers/001.webm is missing");

    const updated = await libraryService.getPack(mirrorPack!.id);
    expect(updated.pack.telegram?.syncState).toBe("error");
    expect(updated.pack.telegram?.lastSyncError).toContain(
      "Sticker output for stickers/001.webm is missing",
    );
  });

  it("uses the remote sticker file id when a legacy mirror asset is missing one", async () => {
    const { root, downloadRoot, libraryService, telegramService, tdlibService } =
      await createTelegramService();
    cleanup.push(root, downloadRoot);

    await telegramService.submitTdlibParameters({
      apiId: "12345",
      apiHash: "secret-hash",
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
      apiHash: "secret-hash",
    });
    await telegramService.submitPhoneNumber({
      phoneNumber: "+12025550123",
    });
    await telegramService.submitCode({ code: "12345" });

    await telegramService.syncOwnedPacks();
    const [mirrorPack] = await libraryService.listPacks();
    expect(mirrorPack?.iconAssetId).not.toBeNull();

    await libraryService.setPackIcon({
      packId: mirrorPack!.id,
      assetId: null,
    });
    await telegramService.updateTelegramPack({ packId: mirrorPack!.id });

    expect(tdlibService.getClearedStickerSetThumbnails()).toContain(
      "sample_pack",
    );
  });

  it("resyncs telegram mirrors after a late update failure", async () => {
    const { root, downloadRoot, libraryService, telegramService, tdlibService } =
      await createTelegramService();
    cleanup.push(root, downloadRoot);

    await telegramService.submitTdlibParameters({
      apiId: "12345",
      apiHash: "secret-hash",
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
