import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import type { StickerPackRecord } from "@sticker-smith/shared";

import { normalizePackRecord } from "../src/main/services/packNormalizer";
import {
  PackRepository,
  resolvePackPaths,
} from "../src/main/services/packRepository";

const TIMESTAMP = "2026-03-12T00:00:00.000Z";

class FakeSettingsService {
  constructor(private readonly root: string) {}

  async ensureLibrary() {
    await fs.mkdir(path.join(this.root, "packs"), { recursive: true });
  }

  getLibraryRoot() {
    return this.root;
  }
}

function createPackRecord(overrides: Partial<StickerPackRecord> = {}) {
  return normalizePackRecord({
    schemaVersion: 3,
    id: "pack-1",
    source: "local",
    name: "Sample Pack",
    slug: "sample-pack",
    iconAssetId: null,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    assets: [
      {
        id: "asset-1",
        packId: "pack-1",
        order: 0,
        relativePath: "asset-1.png",
        originalFileName: "asset-1.png",
        emojiList: [],
        kind: "png",
        importedAt: TIMESTAMP,
        originalImportPath: null,
        downloadState: "ready",
      },
    ],
    outputs: [
      {
        packId: "pack-1",
        sourceAssetId: "asset-1",
        order: 0,
        mode: "sticker",
        relativePath: "asset-1.webm",
        sizeBytes: 10,
        sha256: null,
        updatedAt: TIMESTAMP,
      },
    ],
    ...overrides,
  });
}

async function writeJson(filePath: string, value: unknown) {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2));
}

describe("PackRepository", () => {
  const cleanupRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      cleanupRoots.splice(0).map((root) =>
        fs.rm(root, { recursive: true, force: true }),
      ),
    );
  });

  it("falls back to pack.json.bak when pack.json is malformed", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sticker-smith-pack-repo-"));
    cleanupRoots.push(root);
    const repository = new PackRepository(new FakeSettingsService(root) as never);
    const packRoot = path.join(root, "packs", "legacy-pack");
    const { packFilePath, sourceRoot, outputRoot } = resolvePackPaths(packRoot);

    await fs.mkdir(sourceRoot, { recursive: true });
    await fs.mkdir(outputRoot, { recursive: true });
    await fs.writeFile(packFilePath, "{ invalid json");
    await writeJson(
      `${packFilePath}.bak`,
      {
        schemaVersion: 2,
        id: "legacy-pack",
        source: "local",
        name: "Legacy Pack",
        slug: "legacy-pack",
        iconAssetId: null,
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
        assets: [
          {
            id: "asset-1",
            packId: "legacy-pack",
            relativePath: "legacy.png",
            kind: "png",
            emojiList: [],
            importedAt: TIMESTAMP,
            originalImportPath: "/tmp/imports/original-name.png",
            downloadState: "ready",
          },
        ],
        outputs: [],
      },
    );

    const record = await repository.readPackRecordFromRoot(packRoot);
    const rewritten = JSON.parse(await fs.readFile(packFilePath, "utf8")) as {
      schemaVersion: number;
      assets: Array<{ originalFileName: string | null; order: number }>;
    };

    expect(record.schemaVersion).toBe(3);
    expect(record.assets[0]?.originalFileName).toBe("original-name.png");
    expect(rewritten.schemaVersion).toBe(3);
    expect(rewritten.assets[0]).toMatchObject({
      originalFileName: "original-name.png",
      order: 0,
    });
  });

  it("writes pack records atomically and removes unreferenced outputs", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sticker-smith-pack-repo-"));
    cleanupRoots.push(root);
    const repository = new PackRepository(new FakeSettingsService(root) as never);
    const packRoot = path.join(root, "packs", "sample-pack");
    const { packFilePath, outputRoot } = resolvePackPaths(packRoot);
    const currentRecord: StickerPackRecord = {
      schemaVersion: 3,
      id: "pack-1",
      source: "local",
      name: "Sample Pack",
      slug: "sample-pack",
      iconAssetId: "asset-remove",
      telegramShortName: null,
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
      assets: [
        {
          id: "asset-keep",
          packId: "pack-1",
          order: 0,
          relativePath: "asset-keep.png",
          originalFileName: "asset-keep.png",
          emojiList: [],
          kind: "png",
          importedAt: TIMESTAMP,
          originalImportPath: null,
          downloadState: "ready",
        },
        {
          id: "asset-remove",
          packId: "pack-1",
          order: 1,
          relativePath: "asset-remove.png",
          originalFileName: "asset-remove.png",
          emojiList: [],
          kind: "png",
          importedAt: TIMESTAMP,
          originalImportPath: null,
          downloadState: "ready",
        },
      ],
      outputs: [
        {
          packId: "pack-1",
          sourceAssetId: "asset-keep",
          order: 0,
          mode: "sticker",
          relativePath: "keep.webm",
          sizeBytes: 10,
          sha256: null,
          updatedAt: TIMESTAMP,
        },
        {
          packId: "pack-1",
          sourceAssetId: "asset-remove",
          order: 1,
          mode: "sticker",
          relativePath: "remove.webm",
          sizeBytes: 11,
          sha256: null,
          updatedAt: TIMESTAMP,
        },
      ],
    };

    await repository.ensurePackDirectories(packRoot);
    await writeJson(packFilePath, currentRecord);
    await fs.writeFile(path.join(outputRoot, "keep.webm"), "keep");
    await fs.writeFile(path.join(outputRoot, "remove.webm"), "remove");

    await repository.writePackRecord(packRoot, { ...currentRecord });

    await expect(fs.access(path.join(outputRoot, "keep.webm"))).resolves.toBeUndefined();
    await expect(fs.access(path.join(outputRoot, "remove.webm"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(fs.access(`${packFilePath}.bak`)).resolves.toBeUndefined();
    await expect(fs.access(`${packFilePath}.tmp`)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("serializes mutations for the same pack key", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sticker-smith-pack-repo-"));
    cleanupRoots.push(root);
    const repository = new PackRepository(new FakeSettingsService(root) as never);
    const steps: string[] = [];
    let releaseFirst: (() => void) | null = null;

    const first = repository.withPackMutationLock("pack-1", async () => {
      steps.push("first:start");
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      steps.push("first:end");
      return "first";
    });

    const second = repository.withPackMutationLock("pack-1", async () => {
      steps.push("second:start");
      steps.push("second:end");
      return "second";
    });

    await Promise.resolve();
    expect(steps).toEqual(["first:start"]);

    releaseFirst?.();
    await expect(Promise.all([first, second])).resolves.toEqual([
      "first",
      "second",
    ]);
    expect(steps).toEqual([
      "first:start",
      "first:end",
      "second:start",
      "second:end",
    ]);
  });
});
