import type { StickerPackRecord, TelegramPackSummary } from "@sticker-smith/shared";
import { describe, expect, it } from "vitest";

import {
  findStickerOrThrow,
  markTelegramMirrorStale,
  normalizeStickerRelativePath,
  setPackIconSticker,
} from "../src/main/services/libraryServiceHelpers";

type RecordSticker = StickerPackRecord["stickers"][number];

function sticker(overrides: Partial<RecordSticker> = {}): RecordSticker {
  return {
    id: "sticker-1",
    packId: "pack-1",
    order: 0,
    relativePath: "nested/sticker-1.webm",
    originalFileName: "sticker-1.webm",
    emojiList: [],
    sizeBytes: 1,
    sha256: null,
    importedAt: "2026-03-12T00:00:00.000Z",
    updatedAt: "2026-03-12T00:00:00.000Z",
    downloadState: "ready",
    ...overrides,
  };
}

function telegram(overrides: Partial<TelegramPackSummary> = {}): TelegramPackSummary {
  return {
    stickerSetId: "100",
    shortName: "telegram_pack",
    title: "Telegram Pack",
    format: "video",
    syncState: "synced",
    lastSyncedAt: "2026-03-12T00:00:00.000Z",
    lastSyncError: "previous error",
    publishedFromLocalPackId: null,
    ...overrides,
  };
}

function record(overrides: Partial<StickerPackRecord> = {}): StickerPackRecord {
  return {
    schemaVersion: 4,
    id: "pack-1",
    source: "local",
    name: "Sample Pack",
    slug: "sample-pack",
    iconStickerId: null,
    telegramShortName: null,
    createdAt: "2026-03-12T00:00:00.000Z",
    updatedAt: "2026-03-12T00:00:00.000Z",
    stickers: [sticker()],
    ...overrides,
  };
}

describe("libraryServiceHelpers", () => {
  it("normalizes user-provided sticker relative paths", () => {
    expect(normalizeStickerRelativePath("\\\\nested\\sticker.webm")).toBe("nested/sticker.webm");
    expect(normalizeStickerRelativePath("///nested/sticker.webm")).toBe("nested/sticker.webm");
  });

  it("finds stickers with the existing service error message", () => {
    const pack = record();

    expect(findStickerOrThrow(pack, "sticker-1")).toBe(pack.stickers[0]);
    expect(() => findStickerOrThrow(pack, "missing")).toThrow("Sticker not found: missing");
  });

  it("marks Telegram mirrors stale without changing unsupported mirrors", () => {
    const pack = record({ telegram: telegram() });
    markTelegramMirrorStale(pack);
    expect(pack.telegram?.syncState).toBe("stale");
    expect(pack.telegram?.lastSyncError).toBeNull();

    const unsupported = record({ telegram: telegram({ syncState: "unsupported" }) });
    markTelegramMirrorStale(unsupported);
    expect(unsupported.telegram?.syncState).toBe("unsupported");
    expect(unsupported.telegram?.lastSyncError).toBe("previous error");
  });

  it("sets pack icon and Telegram thumbnail path", () => {
    const pack = record({ telegram: telegram() });

    setPackIconSticker(pack, "/library/packs/sample", "sticker-1");

    expect(pack.iconStickerId).toBe("sticker-1");
    expect(pack.telegram?.thumbnailPath).toBe("/library/packs/sample/webm/nested/sticker-1.webm");
    expect(pack.telegram?.syncState).toBe("stale");
  });
});
