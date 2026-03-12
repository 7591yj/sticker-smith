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
});
