import type { StickerItem, StickerPackRecord } from "@sticker-smith/shared";
import { describe, expect, it } from "vitest";

import {
  compactStickerOrders,
  createDefaultTelegramSummary,
  sortPackRecord,
} from "../src/main/services/packNormalizer";

type RecordSticker = Omit<StickerItem, "absolutePath">;

function buildSticker(
  id: string,
  order: number,
  importedAt: string,
): RecordSticker {
  return {
    id,
    packId: "pack-1",
    order,
    relativePath: `${id}.webm`,
    originalFileName: `${id}.webm`,
    emojiList: [],
    sizeBytes: 1,
    sha256: null,
    importedAt,
    updatedAt: importedAt,
  };
}

function buildRecord(stickers: RecordSticker[]): StickerPackRecord {
  return {
    schemaVersion: 4,
    id: "pack-1",
    source: "local",
    name: "Pack",
    slug: "pack",
    iconStickerId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    stickers,
  };
}

describe("packNormalizer", () => {
  it("sorts stickers by order, importedAt, then id", () => {
    const record = buildRecord([
      buildSticker("z", 1, "2026-01-02T00:00:00.000Z"),
      buildSticker("b", 0, "2026-01-01T00:00:00.000Z"),
      buildSticker("a", 0, "2026-01-01T00:00:00.000Z"),
      buildSticker("c", 0, "2026-01-03T00:00:00.000Z"),
    ]);

    sortPackRecord(record);

    expect(record.stickers.map((sticker) => sticker.id)).toEqual([
      "a",
      "b",
      "c",
      "z",
    ]);
  });

  it("compacts orders after applying the same stable ordering rules", () => {
    const record = buildRecord([
      buildSticker("later", 20, "2026-01-02T00:00:00.000Z"),
      buildSticker("first-b", 10, "2026-01-01T00:00:00.000Z"),
      buildSticker("first-a", 10, "2026-01-01T00:00:00.000Z"),
    ]);

    compactStickerOrders(record);

    expect(
      record.stickers.map((sticker) => [sticker.id, sticker.order]),
    ).toEqual([
      ["later", 2],
      ["first-b", 1],
      ["first-a", 0],
    ]);
  });

  it("creates Telegram summaries with defaults and preserves explicit overrides", () => {
    expect(createDefaultTelegramSummary({ stickerSetId: "set-1" })).toEqual({
      stickerSetId: "set-1",
      shortName: "",
      title: "",
      format: "video",
      thumbnailPath: null,
      syncState: "idle",
      lastSyncedAt: null,
      lastSyncError: null,
      publishedFromLocalPackId: null,
    });

    expect(
      createDefaultTelegramSummary({
        stickerSetId: "set-2",
        shortName: "short",
        title: "Title",
        format: "static",
        thumbnailPath: "thumb.webp",
        syncState: "stale",
        lastSyncedAt: "2026-01-02T00:00:00.000Z",
        lastSyncError: "failed",
        publishedFromLocalPackId: "local-1",
      }),
    ).toEqual({
      stickerSetId: "set-2",
      shortName: "short",
      title: "Title",
      format: "static",
      thumbnailPath: "thumb.webp",
      syncState: "stale",
      lastSyncedAt: "2026-01-02T00:00:00.000Z",
      lastSyncError: "failed",
      publishedFromLocalPackId: "local-1",
    });
  });
});
