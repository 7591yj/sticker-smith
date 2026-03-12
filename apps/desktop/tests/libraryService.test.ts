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
