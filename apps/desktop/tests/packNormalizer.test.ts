import { describe, expect, it } from "vitest";
import type { StickerPackRecord } from "@sticker-smith/shared";

import {
  compactStickerOrders,
  enforcePackOutputRoleInvariants,
  normalizePackRecord,
} from "../src/main/services/packNormalizer";

const TIMESTAMP = "2026-03-12T00:00:00.000Z";

function createRecord(
  overrides: Partial<StickerPackRecord> = {},
): StickerPackRecord {
  return {
    schemaVersion: 3,
    id: "pack-1",
    source: "local",
    name: "Sample Pack",
    slug: "sample-pack",
    iconAssetId: null,
    telegramShortName: null,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    assets: [],
    outputs: [],
    ...overrides,
  };
}

describe("packNormalizer", () => {
  it("normalizes schema v2 records with stable ordering and original filenames", () => {
    const record = normalizePackRecord({
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
          id: "asset-2",
          packId: "legacy-pack",
          relativePath: "nested/cat.png",
          kind: "png",
          emojiList: [],
          importedAt: TIMESTAMP,
          originalImportPath: "/tmp/imports/funny-cat.png",
          downloadState: "ready",
        },
        {
          id: "asset-1",
          packId: "legacy-pack",
          relativePath: "dog.webp",
          kind: "webp",
          emojiList: [],
          importedAt: TIMESTAMP,
          downloadState: "ready",
        },
      ],
      outputs: [
        {
          packId: "legacy-pack",
          sourceAssetId: "asset-1",
          order: 99,
          mode: "sticker",
          relativePath: "asset-1.webm",
          sizeBytes: 10,
          sha256: null,
          updatedAt: TIMESTAMP,
        },
        {
          packId: "legacy-pack",
          sourceAssetId: "asset-2",
          order: 42,
          mode: "sticker",
          relativePath: "asset-2.webm",
          sizeBytes: 12,
          sha256: null,
          updatedAt: TIMESTAMP,
        },
      ],
    });

    expect(record.schemaVersion).toBe(3);
    expect(
      record.assets.map((asset) => ({
        id: asset.id,
        order: asset.order,
        originalFileName: asset.originalFileName,
      })),
    ).toEqual([
      {
        id: "asset-2",
        order: 0,
        originalFileName: "funny-cat.png",
      },
      {
        id: "asset-1",
        order: 1,
        originalFileName: "dog.webp",
      },
    ]);
    expect(
      record.outputs.map((output) => ({
        sourceAssetId: output.sourceAssetId,
        order: output.order,
      })),
    ).toEqual([
      { sourceAssetId: "asset-2", order: 0 },
      { sourceAssetId: "asset-1", order: 1 },
    ]);
  });

  it("removes sticker outputs for an explicit icon asset", () => {
    const record = createRecord({
      iconAssetId: "asset-icon",
      assets: [
        {
          id: "asset-main",
          packId: "pack-1",
          order: 0,
          relativePath: "main.png",
          originalFileName: "main.png",
          emojiList: [],
          kind: "png",
          importedAt: TIMESTAMP,
          originalImportPath: null,
          downloadState: "ready",
        },
        {
          id: "asset-icon",
          packId: "pack-1",
          order: 1,
          relativePath: "icon.png",
          originalFileName: "icon.png",
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
          sourceAssetId: "asset-main",
          order: 0,
          mode: "sticker",
          relativePath: "asset-main.webm",
          sizeBytes: 10,
          sha256: null,
          updatedAt: TIMESTAMP,
        },
        {
          packId: "pack-1",
          sourceAssetId: "asset-icon",
          order: 1,
          mode: "sticker",
          relativePath: "asset-icon.webm",
          sizeBytes: 10,
          sha256: null,
          updatedAt: TIMESTAMP,
        },
      ],
    });

    const removedOutputs = enforcePackOutputRoleInvariants(record);

    expect(removedOutputs.map((output) => output.relativePath)).toEqual([
      "asset-icon.webm",
    ]);
    expect(record.outputs.map((output) => output.relativePath)).toEqual([
      "asset-main.webm",
    ]);
  });

  it("drops legacy telegram icon outputs and clears iconAssetId for telegram assets", () => {
    const record = createRecord({
      source: "telegram",
      iconAssetId: "asset-remote",
      telegram: {
        stickerSetId: "set-1",
        shortName: "sample_set",
        title: "Sample Set",
        format: "video",
        thumbnailPath: null,
        syncState: "idle",
        lastSyncedAt: null,
        lastSyncError: null,
        publishedFromLocalPackId: null,
      },
      assets: [
        {
          id: "asset-remote",
          packId: "pack-1",
          order: 0,
          relativePath: "remote.webp",
          originalFileName: "remote.webp",
          emojiList: [],
          kind: "webp",
          importedAt: TIMESTAMP,
          originalImportPath: null,
          downloadState: "ready",
          telegram: {
            stickerId: "sticker-1",
            fileId: "file-1",
            fileUniqueId: "unique-1",
            position: 0,
            baselineOutputHash: null,
          },
        },
      ],
      outputs: [
        {
          packId: "pack-1",
          sourceAssetId: "asset-remote",
          order: 0,
          mode: "icon",
          relativePath: "icon.webm",
          sizeBytes: 20,
          sha256: null,
          updatedAt: TIMESTAMP,
        },
      ],
    });

    const removedOutputs = enforcePackOutputRoleInvariants(record);

    expect(record.iconAssetId).toBeNull();
    expect(removedOutputs.map((output) => output.relativePath)).toEqual([
      "icon.webm",
    ]);
    expect(record.outputs).toEqual([]);
  });

  it("compacts sticker orders and keeps output order aligned", () => {
    const record = createRecord({
      iconAssetId: "asset-icon",
      assets: [
        {
          id: "asset-icon",
          packId: "pack-1",
          order: 99,
          relativePath: "icon.png",
          originalFileName: "icon.png",
          emojiList: [],
          kind: "png",
          importedAt: TIMESTAMP,
          originalImportPath: null,
          downloadState: "ready",
        },
        {
          id: "asset-late",
          packId: "pack-1",
          order: 4,
          relativePath: "late.png",
          originalFileName: "late.png",
          emojiList: [],
          kind: "png",
          importedAt: "2026-03-12T00:00:01.000Z",
          originalImportPath: null,
          downloadState: "ready",
        },
        {
          id: "asset-early",
          packId: "pack-1",
          order: 2,
          relativePath: "early.png",
          originalFileName: "early.png",
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
          sourceAssetId: "asset-late",
          order: 10,
          mode: "sticker",
          relativePath: "asset-late.webm",
          sizeBytes: 10,
          sha256: null,
          updatedAt: TIMESTAMP,
        },
        {
          packId: "pack-1",
          sourceAssetId: "asset-early",
          order: 11,
          mode: "sticker",
          relativePath: "asset-early.webm",
          sizeBytes: 11,
          sha256: null,
          updatedAt: TIMESTAMP,
        },
      ],
    });

    compactStickerOrders(record);

    expect(
      record.assets
        .filter((asset) => asset.id !== "asset-icon")
        .sort((left, right) => left.order - right.order)
        .map((asset) => [asset.id, asset.order]),
    ).toEqual([
      ["asset-early", 0],
      ["asset-late", 1],
    ]);
    expect(
      record.outputs.map((output) => [output.sourceAssetId, output.order]),
    ).toEqual([
      ["asset-late", 1],
      ["asset-early", 0],
    ]);
  });
});
