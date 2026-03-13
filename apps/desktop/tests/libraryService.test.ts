import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { LibraryService } from "../src/main/services/libraryService";

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

async function createLibraryService() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sticker-smith-"));
  const libraryService = new LibraryService(
    new FakeSettingsService(root) as never,
  );
  return { root, libraryService };
}

describe("LibraryService", () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    await Promise.all(
      cleanup
        .splice(0)
        .map((root) => fs.rm(root, { recursive: true, force: true })),
    );
  });

  it("creates packs and writes the manifest", async () => {
    const { root, libraryService } = await createLibraryService();
    cleanup.push(root);

    const pack = await libraryService.createPack({ name: "Cats" });
    const details = await libraryService.getPack(pack.id);
    const manifest = await fs.readFile(path.join(pack.rootPath, "pack.json"), "utf8");

    expect(pack.source).toBe("local");
    expect(details.pack.name).toBe("Cats");
    expect(manifest).toContain('"name": "Cats"');
    expect(manifest).toContain('"source": "local"');
  });

  it("treats legacy manifests without a source as local packs", async () => {
    const { root, libraryService } = await createLibraryService();
    cleanup.push(root);

    const packRoot = path.join(root, "packs", "legacy-pack");
    await fs.mkdir(path.join(packRoot, "source"), { recursive: true });
    await fs.mkdir(path.join(packRoot, "webm"), { recursive: true });
    await fs.writeFile(
      path.join(packRoot, "pack.json"),
      JSON.stringify(
        {
          id: "legacy-pack",
          name: "Legacy Pack",
          slug: "legacy-pack",
          iconAssetId: null,
          createdAt: "2026-03-11T00:00:00.000Z",
          updatedAt: "2026-03-11T00:00:00.000Z",
          assets: [
            {
              id: "legacy-asset",
              packId: "legacy-pack",
              relativePath: "legacy.png",
              kind: "png",
              importedAt: "2026-03-11T00:00:00.000Z",
              originalImportPath: null,
            },
          ],
          outputs: [],
        },
        null,
        2,
      ),
    );

    const [pack] = await libraryService.listPacks();
    const details = await libraryService.getPack("legacy-pack");

    expect(pack?.source).toBe("local");
    expect(details.pack.source).toBe("local");
    expect(details.assets[0]?.emojiList).toEqual([]);
  });

  it("imports colliding files with deterministic suffixes", async () => {
    const { root, libraryService } = await createLibraryService();
    cleanup.push(root);

    const pack = await libraryService.createPack({ name: "Dogs" });
    const importRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "sticker-smith-import-"),
    );
    cleanup.push(importRoot);

    await fs.writeFile(path.join(importRoot, "a.png"), "one");
    await fs.writeFile(path.join(importRoot, "a.jpeg"), "two");
    await fs.mkdir(path.join(importRoot, "nested"));
    await fs.writeFile(path.join(importRoot, "nested", "a.png"), "three");

    const result = await libraryService.importDirectory(pack.id, importRoot);
    const relativePaths = result.imported
      .map((asset) => asset.relativePath)
      .sort();

    expect(relativePaths).toEqual(["a.jpeg", "a.png", "nested/a.png"]);
  });

  it("clears old icon outputs when changing the icon asset", async () => {
    const { root, libraryService } = await createLibraryService();
    cleanup.push(root);

    const pack = await libraryService.createPack({ name: "Birds" });
    const fileRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "sticker-smith-file-"),
    );
    cleanup.push(fileRoot);

    const filePath = path.join(fileRoot, "bird.png");
    await fs.writeFile(filePath, "bird");

    const importResult = await libraryService.importFiles(pack.id, [filePath]);
    await libraryService.recordConversionResult(pack.id, {
      assetId: importResult.imported[0].id,
      mode: "icon",
      outputFileName: "icon.webm",
      sizeBytes: 64,
    });
    await fs.writeFile(path.join(pack.outputRoot, "icon.webm"), "icon");

    const updatedPack = await libraryService.setPackIcon({
      packId: pack.id,
      assetId: importResult.imported[0].id,
    });

    expect(updatedPack.iconAssetId).toBe(importResult.imported[0].id);
    expect(updatedPack.thumbnailPath).toBeNull();
  });

  it("preserves telegram thumbnails across metadata syncs and normalizes video thumbnails to .webm", async () => {
    const { root, libraryService } = await createLibraryService();
    cleanup.push(root);

    const thumbnailSourcePath = path.join(root, "telegram-thumbnail-cache");
    await fs.writeFile(thumbnailSourcePath, "thumb-data");

    let details = await libraryService.upsertTelegramMirror({
      stickerSetId: "100",
      title: "Remote Pack",
      shortName: "remote_pack",
      format: "video",
      thumbnailPath: thumbnailSourcePath,
      hasThumbnail: true,
      thumbnailExtension: ".webm",
      syncState: "idle",
      publishedFromLocalPackId: null,
      lastSyncedAt: null,
      assets: [],
    });

    expect(details.pack.thumbnailPath).toContain("/source/telegram-pack-icon.webm");
    await expect(fs.readFile(details.pack.thumbnailPath!, "utf8")).resolves.toBe(
      "thumb-data",
    );

    details = await libraryService.upsertTelegramMirror({
      stickerSetId: "100",
      title: "Remote Pack",
      shortName: "remote_pack",
      format: "video",
      thumbnailPath: null,
      hasThumbnail: true,
      thumbnailExtension: ".webm",
      syncState: "idle",
      publishedFromLocalPackId: null,
      lastSyncedAt: null,
      assets: [],
    });

    expect(details.pack.thumbnailPath).toContain("/source/telegram-pack-icon.webm");
    await expect(fs.readFile(details.pack.thumbnailPath!, "utf8")).resolves.toBe(
      "thumb-data",
    );
  });

  it("persists emoji lists per asset", async () => {
    const { root, libraryService } = await createLibraryService();
    cleanup.push(root);

    const pack = await libraryService.createPack({ name: "Emoji Pack" });
    const fileRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "sticker-smith-emoji-file-"),
    );
    cleanup.push(fileRoot);

    const filePath = path.join(fileRoot, "wave.png");
    await fs.writeFile(filePath, "wave");

    const importResult = await libraryService.importFiles(pack.id, [filePath]);
    const updated = await libraryService.setAssetEmojis({
      packId: pack.id,
      assetId: importResult.imported[0].id,
      emojis: ["👋", "✨"],
    });

    expect(updated.assets[0]?.emojiList).toEqual(["👋", "✨"]);
  });

  it("renaming an asset clears sticker outputs and updates the manifest path", async () => {
    const { root, libraryService } = await createLibraryService();
    cleanup.push(root);

    const pack = await libraryService.createPack({ name: "Rename Pack" });
    const fileRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "sticker-smith-rename-file-"),
    );
    cleanup.push(fileRoot);

    const filePath = path.join(fileRoot, "cat.png");
    await fs.writeFile(filePath, "cat");

    const imported = await libraryService.importFiles(pack.id, [filePath]);
    await libraryService.recordConversionResult(pack.id, {
      assetId: imported.imported[0]!.id,
      mode: "sticker",
      outputFileName: "cat.webm",
      sizeBytes: 32,
    });
    await fs.writeFile(path.join(pack.outputRoot, "cat.webm"), "converted");

    const renamed = await libraryService.renameAsset({
      packId: pack.id,
      assetId: imported.imported[0]!.id,
      nextRelativePath: "renamed/cat.png",
    });
    const manifest = await fs.readFile(path.join(pack.rootPath, "pack.json"), "utf8");

    expect(renamed.assets[0]?.relativePath).toBe("renamed/cat.png");
    expect(renamed.outputs).toEqual([]);
    expect(manifest).toContain('"relativePath": "renamed/cat.png"');
    await expect(fs.access(path.join(pack.outputRoot, "cat.webm"))).rejects.toThrow();
  });

  it("moving an asset clears sticker outputs and preserves the base filename", async () => {
    const { root, libraryService } = await createLibraryService();
    cleanup.push(root);

    const pack = await libraryService.createPack({ name: "Move Pack" });
    const fileRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "sticker-smith-move-file-"),
    );
    cleanup.push(fileRoot);

    const filePath = path.join(fileRoot, "cat.png");
    await fs.writeFile(filePath, "cat");

    const imported = await libraryService.importFiles(pack.id, [filePath]);
    await libraryService.recordConversionResult(pack.id, {
      assetId: imported.imported[0]!.id,
      mode: "sticker",
      outputFileName: "cat.webm",
      sizeBytes: 32,
    });
    await fs.writeFile(path.join(pack.outputRoot, "cat.webm"), "converted");

    const moved = await libraryService.moveAsset({
      packId: pack.id,
      assetId: imported.imported[0]!.id,
      nextDirectory: "nested",
    });

    expect(moved.assets[0]?.relativePath).toBe("nested/cat.png");
    expect(moved.outputs).toEqual([]);
    await expect(fs.access(path.join(pack.outputRoot, "cat.webm"))).rejects.toThrow();
  });

  it("deleting an icon asset clears iconAssetId and icon.webm", async () => {
    const { root, libraryService } = await createLibraryService();
    cleanup.push(root);

    const pack = await libraryService.createPack({ name: "Icon Pack" });
    const fileRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "sticker-smith-icon-file-"),
    );
    cleanup.push(fileRoot);

    const filePath = path.join(fileRoot, "icon.png");
    await fs.writeFile(filePath, "icon");

    const imported = await libraryService.importFiles(pack.id, [filePath]);
    await libraryService.setPackIcon({
      packId: pack.id,
      assetId: imported.imported[0]!.id,
    });
    await libraryService.recordConversionResult(pack.id, {
      assetId: imported.imported[0]!.id,
      mode: "icon",
      outputFileName: "icon.webm",
      sizeBytes: 16,
    });
    await fs.writeFile(path.join(pack.outputRoot, "icon.webm"), "icon-output");

    const updated = await libraryService.deleteAsset({
      packId: pack.id,
      assetId: imported.imported[0]!.id,
    });

    expect(updated.pack.iconAssetId).toBeNull();
    expect(updated.outputs).toEqual([]);
    await expect(fs.access(path.join(pack.outputRoot, "icon.webm"))).rejects.toThrow();
  });

  it("stores a local pack telegram short name for reuse", async () => {
    const { root, libraryService } = await createLibraryService();
    cleanup.push(root);

    const pack = await libraryService.createPack({ name: "Short Name Pack" });
    const updated = await libraryService.setPackTelegramShortName({
      packId: pack.id,
      shortName: "short_name_pack",
    });

    expect(updated.telegramShortName).toBe("short_name_pack");

    const details = await libraryService.getPack(pack.id);
    expect(details.pack.telegramShortName).toBe("short_name_pack");
  });

  it("renames many assets in order while preserving each extension", async () => {
    const { root, libraryService } = await createLibraryService();
    cleanup.push(root);

    const pack = await libraryService.createPack({ name: "Batch Rename Pack" });
    const fileRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "sticker-smith-batch-rename-"),
    );
    cleanup.push(fileRoot);

    const alphaPath = path.join(fileRoot, "alpha.png");
    const betaPath = path.join(fileRoot, "beta.webp");
    await fs.writeFile(alphaPath, "alpha");
    await fs.writeFile(betaPath, "beta");

    const imported = await libraryService.importFiles(pack.id, [alphaPath, betaPath]);
    const renamed = await libraryService.renameManyAssets({
      packId: pack.id,
      assetIds: imported.imported
        .map((asset) => asset.id)
        .sort((left, right) => {
          const leftAsset = imported.imported.find((asset) => asset.id === left)!;
          const rightAsset = imported.imported.find((asset) => asset.id === right)!;
          return leftAsset.relativePath.localeCompare(rightAsset.relativePath);
        }),
      baseName: "sticker",
    });

    expect(renamed.assets.map((asset) => asset.relativePath).sort()).toEqual([
      "sticker-001.png",
      "sticker-002.webp",
    ]);
  });

  it("mirrors downloaded telegram webm assets into sticker outputs and updates baseline-synced outputs", async () => {
    const { root, libraryService } = await createLibraryService();
    cleanup.push(root);

    const details = await libraryService.upsertTelegramMirror({
      stickerSetId: "500",
      title: "Telegram Pack",
      shortName: "telegram_pack",
      format: "video",
      thumbnailPath: null,
      syncState: "idle",
      lastSyncedAt: "2026-03-12T00:00:00.000Z",
      lastSyncError: null,
      publishedFromLocalPackId: null,
      iconStickerId: null,
      assets: [
        {
          relativePath: "sticker-001.webm",
          emojiList: ["🙂"],
          kind: "webm",
          downloadState: "missing",
          telegram: {
            stickerId: "sticker-1",
            fileId: "remote-1",
            fileUniqueId: "unique-1",
            position: 0,
            baselineOutputHash: null,
          },
        },
      ],
    });

    expect(details.outputs).toEqual([]);

    const downloadRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "sticker-smith-telegram-output-"),
    );
    cleanup.push(downloadRoot);
    const sourceA = path.join(downloadRoot, "source-a.webm");
    const sourceB = path.join(downloadRoot, "source-b.webm");
    await fs.writeFile(sourceA, "webm-a");
    await fs.writeFile(sourceB, "webm-b");

    let updated = await libraryService.writeTelegramAssetFile({
      packId: details.pack.id,
      assetId: details.assets[0]!.id,
      sourceFilePath: sourceA,
      relativePath: "sticker-001.webm",
    });
    expect(updated.outputs).toHaveLength(1);
    await expect(fs.readFile(updated.outputs[0]!.absolutePath, "utf8")).resolves.toBe(
      "webm-a",
    );

    updated = await libraryService.writeTelegramAssetFile({
      packId: details.pack.id,
      assetId: details.assets[0]!.id,
      sourceFilePath: sourceB,
      relativePath: "sticker-001.webm",
    });
    await expect(fs.readFile(updated.outputs[0]!.absolutePath, "utf8")).resolves.toBe(
      "webm-b",
    );
  });

  it("does not overwrite divergent telegram sticker outputs during mirror reconciliation", async () => {
    const { root, libraryService } = await createLibraryService();
    cleanup.push(root);

    const details = await libraryService.upsertTelegramMirror({
      stickerSetId: "600",
      title: "Telegram Pack",
      shortName: "telegram_pack",
      format: "video",
      thumbnailPath: null,
      syncState: "idle",
      lastSyncedAt: "2026-03-12T00:00:00.000Z",
      lastSyncError: null,
      publishedFromLocalPackId: null,
      iconStickerId: null,
      assets: [
        {
          relativePath: "sticker-001.webm",
          emojiList: ["🙂"],
          kind: "webm",
          downloadState: "missing",
          telegram: {
            stickerId: "sticker-1",
            fileId: "remote-1",
            fileUniqueId: "unique-1",
            position: 0,
            baselineOutputHash: null,
          },
        },
      ],
    });

    const downloadRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "sticker-smith-telegram-divergent-"),
    );
    cleanup.push(downloadRoot);
    const sourcePath = path.join(downloadRoot, "source.webm");
    const customOutputPath = path.join(details.pack.outputRoot, "custom.webm");
    await fs.writeFile(sourcePath, "baseline-webm");

    await libraryService.writeTelegramAssetFile({
      packId: details.pack.id,
      assetId: details.assets[0]!.id,
      sourceFilePath: sourcePath,
      relativePath: "sticker-001.webm",
    });

    await fs.writeFile(customOutputPath, "custom-webm");
    await libraryService.recordConversionResult(details.pack.id, {
      assetId: details.assets[0]!.id,
      mode: "sticker",
      outputFileName: "custom.webm",
      sizeBytes: "custom-webm".length,
    });

    const reconciled = await libraryService.upsertTelegramMirror({
      stickerSetId: "600",
      title: "Telegram Pack",
      shortName: "telegram_pack",
      format: "video",
      thumbnailPath: null,
      syncState: "idle",
      lastSyncedAt: "2026-03-12T00:00:00.000Z",
      lastSyncError: null,
      publishedFromLocalPackId: null,
      iconStickerId: null,
      assets: [
        {
          id: details.assets[0]!.id,
          relativePath: "sticker-001.webm",
          emojiList: ["🙂"],
          kind: "webm",
          downloadState: "missing",
          telegram: {
            stickerId: "sticker-1",
            fileId: "remote-1",
            fileUniqueId: "unique-1",
            position: 0,
            baselineOutputHash: null,
          },
        },
      ],
    });

    expect(reconciled.outputs[0]?.relativePath).toBe("custom.webm");
    await expect(fs.readFile(customOutputPath, "utf8")).resolves.toBe("custom-webm");
  });

  it("recovers a pack manifest from a backup when the primary JSON is truncated", async () => {
    const { root, libraryService } = await createLibraryService();
    cleanup.push(root);

    const pack = await libraryService.createPack({ name: "Recovered Pack" });
    const packFilePath = path.join(pack.rootPath, "pack.json");
    const backupPath = `${packFilePath}.bak`;
    const manifest = await fs.readFile(packFilePath, "utf8");

    await fs.writeFile(backupPath, manifest);
    await fs.writeFile(packFilePath, '{"id":"broken"');

    const recovered = await libraryService.getPack(pack.id);
    const repairedManifest = await fs.readFile(packFilePath, "utf8");

    expect(recovered.pack.name).toBe("Recovered Pack");
    expect(repairedManifest).toContain('"name": "Recovered Pack"');
  });

  it("skips and cleans broken telegram mirror directories while listing packs", async () => {
    const { root, libraryService } = await createLibraryService();
    cleanup.push(root);

    const pack = await libraryService.createPack({ name: "Healthy Pack" });
    const missingRoot = path.join(root, "packs", "telegram-100");
    const corruptRoot = path.join(root, "packs", "telegram-200");

    await fs.mkdir(missingRoot, { recursive: true });
    await fs.mkdir(corruptRoot, { recursive: true });
    await fs.writeFile(path.join(corruptRoot, "pack.json"), '{"id":"broken"}}');

    const packs = await libraryService.listPacks();

    expect(packs.map((item) => item.id)).toEqual([pack.id]);
    await expect(fs.access(missingRoot)).rejects.toThrow();
    await expect(fs.access(corruptRoot)).rejects.toThrow();
  });

  it("ignores broken telegram mirror directories during telegram sticker set lookup", async () => {
    const { root, libraryService } = await createLibraryService();
    cleanup.push(root);

    const validRoot = path.join(root, "packs", "telegram-300");
    const brokenRoot = path.join(root, "packs", "telegram-400");
    await fs.mkdir(path.join(validRoot, "source"), { recursive: true });
    await fs.mkdir(path.join(validRoot, "webm"), { recursive: true });
    await fs.writeFile(
      path.join(validRoot, "pack.json"),
      JSON.stringify(
        {
          schemaVersion: 2,
          id: "telegram-300",
          source: "telegram",
          name: "Valid Telegram Pack",
          slug: "valid-telegram-pack",
          iconAssetId: null,
          telegram: {
            stickerSetId: "300",
            shortName: "valid_pack",
            title: "Valid Telegram Pack",
            format: "video",
            syncState: "idle",
            lastSyncedAt: null,
            lastSyncError: null,
            publishedFromLocalPackId: null,
          },
          createdAt: "2026-03-11T00:00:00.000Z",
          updatedAt: "2026-03-11T00:00:00.000Z",
          assets: [],
          outputs: [],
        },
        null,
        2,
      ),
    );
    await fs.mkdir(brokenRoot, { recursive: true });
    await fs.writeFile(path.join(brokenRoot, "pack.json"), '{"id":"broken"');

    const missing = await libraryService.findPackByTelegramStickerSetId("999");
    const found = await libraryService.findPackByTelegramStickerSetId("300");

    expect(missing).toBeNull();
    expect(found?.record.id).toBe("telegram-300");
    await expect(fs.access(brokenRoot)).rejects.toThrow();
  });

  it("copies telegram pack thumbnails into the pack source directory", async () => {
    const { root, libraryService } = await createLibraryService();
    cleanup.push(root);

    const thumbnailRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "sticker-smith-thumb-"),
    );
    cleanup.push(thumbnailRoot);
    const thumbnailPath = path.join(thumbnailRoot, "icon.webp");
    await fs.writeFile(thumbnailPath, "thumbnail");

    const details = await libraryService.upsertTelegramMirror({
      stickerSetId: "500",
      title: "Telegram Pack",
      shortName: "telegram_pack",
      format: "video",
      thumbnailPath,
      syncState: "idle",
      lastSyncedAt: "2026-03-12T00:00:00.000Z",
      lastSyncError: null,
      publishedFromLocalPackId: null,
      iconStickerId: null,
      assets: [],
    });

    expect(details.pack.thumbnailPath).toContain("/source/telegram-pack-icon.webp");
    await expect(fs.readFile(details.pack.thumbnailPath!, "utf8")).resolves.toBe(
      "thumbnail",
    );
  });
});
