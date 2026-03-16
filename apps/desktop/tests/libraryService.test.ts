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

async function readManifest(packRoot: string) {
  return JSON.parse(await fs.readFile(path.join(packRoot, "pack.json"), "utf8")) as {
    schemaVersion: number;
    assets: Array<{
      id: string;
      order: number;
      relativePath: string;
      originalFileName: string | null;
    }>;
    outputs: Array<{
      sourceAssetId: string;
      order: number;
      relativePath: string;
      mode: "icon" | "sticker";
    }>;
  };
}

async function createImportedPack(
  libraryService: LibraryService,
  name = "Sample Pack",
) {
  const pack = await libraryService.createPack({ name });
  const fileRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sticker-smith-files-"));
  const alphaPath = path.join(fileRoot, "zeta.png");
  const betaPath = path.join(fileRoot, "alpha.webp");
  const gammaPath = path.join(fileRoot, "middle.gif");
  await fs.writeFile(alphaPath, "alpha");
  await fs.writeFile(betaPath, "beta");
  await fs.writeFile(gammaPath, "gamma");

  const imported = await libraryService.importFiles(pack.id, [
    alphaPath,
    betaPath,
    gammaPath,
  ]);

  return { pack, fileRoot, imported };
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

  it("creates packs with schema version 3 manifests", async () => {
    const { root, libraryService } = await createLibraryService();
    cleanup.push(root);

    const pack = await libraryService.createPack({ name: "Cats" });
    const manifest = await readManifest(pack.rootPath);

    expect(manifest.schemaVersion).toBe(3);
    expect(manifest.assets).toEqual([]);
    expect(manifest.outputs).toEqual([]);
  });

  it("migrates schema v2 manifests to explicit order and original filenames", async () => {
    const { root, libraryService } = await createLibraryService();
    cleanup.push(root);

    const packRoot = path.join(root, "packs", "legacy-pack");
    await fs.mkdir(path.join(packRoot, "source"), { recursive: true });
    await fs.mkdir(path.join(packRoot, "webm"), { recursive: true });
    await fs.writeFile(
      path.join(packRoot, "pack.json"),
      JSON.stringify(
        {
          schemaVersion: 2,
          id: "legacy-pack",
          source: "local",
          name: "Legacy Pack",
          slug: "legacy-pack",
          iconAssetId: null,
          createdAt: "2026-03-11T00:00:00.000Z",
          updatedAt: "2026-03-11T00:00:00.000Z",
          assets: [
            {
              id: "asset-1",
              packId: "legacy-pack",
              relativePath: "legacy.png",
              kind: "png",
              emojiList: [],
              importedAt: "2026-03-11T00:00:00.000Z",
              originalImportPath: "/tmp/imports/original-name.png",
              downloadState: "ready",
            },
          ],
          outputs: [],
        },
        null,
        2,
      ),
    );

    const details = await libraryService.getPack("legacy-pack");
    const manifest = await readManifest(packRoot);

    expect(details.assets[0]).toMatchObject({
      order: 0,
      originalFileName: "original-name.png",
    });
    expect(manifest.schemaVersion).toBe(3);
    expect(manifest.assets[0]).toMatchObject({
      order: 0,
      originalFileName: "original-name.png",
    });
  });

  it("imports files in the provided order and stores asset-id internal source paths", async () => {
    const { root, libraryService } = await createLibraryService();
    cleanup.push(root);

    const { pack, fileRoot, imported } = await createImportedPack(libraryService);
    cleanup.push(fileRoot);

    expect(imported.imported.map((asset) => asset.originalFileName)).toEqual([
      "zeta.png",
      "alpha.webp",
      "middle.gif",
    ]);
    expect(imported.imported.map((asset) => asset.order)).toEqual([0, 1, 2]);
    expect(imported.imported.map((asset) => asset.relativePath)).toEqual([
      `${imported.imported[0]!.id}.png`,
      `${imported.imported[1]!.id}.webp`,
      `${imported.imported[2]!.id}.gif`,
    ]);
    await expect(
      fs.readFile(path.join(pack.sourceRoot, imported.imported[0]!.relativePath), "utf8"),
    ).resolves.toBe("alpha");
  });

  it("imports directories using sorted path order", async () => {
    const { root, libraryService } = await createLibraryService();
    cleanup.push(root);

    const pack = await libraryService.createPack({ name: "Directory Pack" });
    const directoryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sticker-smith-dir-"));
    cleanup.push(directoryRoot);
    await fs.writeFile(path.join(directoryRoot, "zeta.png"), "zeta");
    await fs.writeFile(path.join(directoryRoot, "alpha.png"), "alpha");

    const result = await libraryService.importDirectory(pack.id, directoryRoot);

    expect(result.imported.map((asset) => asset.originalFileName)).toEqual([
      "alpha.png",
      "zeta.png",
    ]);
    expect(result.imported.map((asset) => asset.order)).toEqual([0, 1]);
  });

  it("records sticker outputs with asset-id filenames and icon output as icon.webm", async () => {
    const { root, libraryService } = await createLibraryService();
    cleanup.push(root);

    const { pack, fileRoot, imported } = await createImportedPack(libraryService, "Outputs");
    cleanup.push(fileRoot);
    const asset = imported.imported[0]!;

    await fs.writeFile(path.join(pack.outputRoot, `${asset.id}.webm`), "sticker-output");
    await libraryService.recordConversionResult(pack.id, {
      assetId: asset.id,
      mode: "sticker",
      outputFileName: "ignored-name.webm",
      sizeBytes: "sticker-output".length,
    });

    await libraryService.setPackIcon({ packId: pack.id, assetId: asset.id });
    await fs.writeFile(path.join(pack.outputRoot, "icon.webm"), "icon-output");
    await libraryService.recordConversionResult(pack.id, {
      assetId: asset.id,
      mode: "icon",
      outputFileName: "ignored-icon-name.webm",
      sizeBytes: "icon-output".length,
    });

    const details = await libraryService.getPack(pack.id);

    expect(details.outputs).toEqual([
      expect.objectContaining({
        mode: "icon",
        relativePath: "icon.webm",
        sourceAssetId: asset.id,
      }),
    ]);
  });

  it("reorders sticker assets by explicit order without renaming output files", async () => {
    const { root, libraryService } = await createLibraryService();
    cleanup.push(root);

    const { pack, fileRoot, imported } = await createImportedPack(libraryService, "Reorder");
    cleanup.push(fileRoot);

    for (const asset of imported.imported) {
      await fs.writeFile(path.join(pack.outputRoot, `${asset.id}.webm`), asset.id);
      await libraryService.recordConversionResult(pack.id, {
        assetId: asset.id,
        mode: "sticker",
        outputFileName: `${asset.id}.webm`,
        sizeBytes: asset.id.length,
      });
    }

    const movedAsset = imported.imported[2]!;
    const updated = await libraryService.reorderAsset({
      packId: pack.id,
      assetId: movedAsset.id,
      beforeAssetId: imported.imported[0]!.id,
    });

    expect(updated.assets.map((asset) => [asset.id, asset.order])).toEqual([
      [movedAsset.id, 0],
      [imported.imported[0]!.id, 1],
      [imported.imported[1]!.id, 2],
    ]);
    expect(updated.outputs.map((output) => [output.sourceAssetId, output.order])).toEqual([
      [movedAsset.id, 0],
      [imported.imported[0]!.id, 1],
      [imported.imported[1]!.id, 2],
    ]);
    expect(updated.outputs.map((output) => output.relativePath)).toEqual([
      `${movedAsset.id}.webm`,
      `${imported.imported[0]!.id}.webm`,
      `${imported.imported[1]!.id}.webm`,
    ]);
  });

  it("compacts remaining sticker orders after delete", async () => {
    const { root, libraryService } = await createLibraryService();
    cleanup.push(root);

    const { pack, fileRoot, imported } = await createImportedPack(libraryService, "Delete");
    cleanup.push(fileRoot);

    const updated = await libraryService.deleteAsset({
      packId: pack.id,
      assetId: imported.imported[1]!.id,
    });

    expect(updated.assets.map((asset) => [asset.id, asset.order])).toEqual([
      [imported.imported[0]!.id, 0],
      [imported.imported[2]!.id, 1],
    ]);
  });

  it("uses telegram remote positions as canonical order and mirrors output filenames by asset id", async () => {
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
      assets: [
        {
          relativePath: "remote-b.webm",
          emojiList: ["😎"],
          kind: "webm",
          downloadState: "missing",
          telegram: {
            stickerId: "sticker-2",
            fileId: "remote-2",
            fileUniqueId: "unique-2",
            position: 1,
            baselineOutputHash: null,
          },
        },
        {
          relativePath: "remote-a.webm",
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

    expect(details.assets.map((asset) => [asset.telegram?.position, asset.order])).toEqual([
      [0, 0],
      [1, 1],
    ]);
    expect(details.assets[0]?.relativePath).toBe(`${details.assets[0]!.id}.webm`);
    expect(details.assets[1]?.relativePath).toBe(`${details.assets[1]!.id}.webm`);
  });

  it("writes downloaded telegram media to asset-id source and output paths", async () => {
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
      assets: [
        {
          relativePath: "legacy-name.webm",
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

    const downloadRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sticker-smith-telegram-"));
    cleanup.push(downloadRoot);
    const downloadedPath = path.join(downloadRoot, "downloaded.webm");
    await fs.writeFile(downloadedPath, "webm-data");

    const updated = await libraryService.writeTelegramAssetFile({
      packId: details.pack.id,
      assetId: details.assets[0]!.id,
      sourceFilePath: downloadedPath,
    });

    expect(updated.assets[0]?.relativePath).toBe(`${updated.assets[0]!.id}.webm`);
    expect(updated.outputs[0]).toMatchObject({
      relativePath: `${updated.assets[0]!.id}.webm`,
      sourceAssetId: updated.assets[0]!.id,
      order: 0,
    });
    await expect(fs.readFile(updated.outputs[0]!.absolutePath, "utf8")).resolves.toBe(
      "webm-data",
    );
  });

  it("preserves local-only telegram outputs when emoji metadata changes", async () => {
    const { root, libraryService } = await createLibraryService();
    cleanup.push(root);

    const remoteDetails = await libraryService.upsertTelegramMirror({
      stickerSetId: "700",
      title: "Telegram Pack",
      shortName: "telegram_pack",
      format: "video",
      thumbnailPath: null,
      syncState: "idle",
      lastSyncedAt: "2026-03-12T00:00:00.000Z",
      lastSyncError: null,
      publishedFromLocalPackId: null,
      assets: [
        {
          relativePath: "remote.webm",
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

    const fileRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sticker-smith-local-telegram-"));
    cleanup.push(fileRoot);
    const localSourcePath = path.join(fileRoot, "local.webm");
    await fs.writeFile(localSourcePath, "local-webm");

    const imported = await libraryService.importFiles(remoteDetails.pack.id, [
      localSourcePath,
    ]);
    const localAsset = imported.imported[0]!;
    const localOutputPath = path.join(remoteDetails.pack.outputRoot, `${localAsset.id}.webm`);
    await fs.writeFile(localOutputPath, "local-output");
    await libraryService.recordConversionResult(remoteDetails.pack.id, {
      assetId: localAsset.id,
      mode: "sticker",
      outputFileName: `${localAsset.id}.webm`,
      sizeBytes: "local-output".length,
    });

    const updated = await libraryService.setAssetEmojis({
      packId: remoteDetails.pack.id,
      assetId: localAsset.id,
      emojis: ["🔥"],
    });

    expect(updated.assets.find((asset) => asset.id === localAsset.id)?.emojiList).toEqual([
      "🔥",
    ]);
    expect(
      updated.outputs.find((output) => output.sourceAssetId === localAsset.id),
    ).toMatchObject({
      relativePath: `${localAsset.id}.webm`,
    });
    await expect(fs.readFile(localOutputPath, "utf8")).resolves.toBe("local-output");
  });
});
