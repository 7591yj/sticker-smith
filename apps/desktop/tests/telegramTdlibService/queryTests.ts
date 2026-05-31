import { expect, it } from "vitest";
import { TelegramTdlibService } from "../../src/main/services/telegram/tdlib/service";
import { createServiceWithClient } from "./helpers";

export function registerQueryTests() {
  it("requests file downloads with a positive limit", async () => {
    const { requests, service } = createServiceWithClient(
      TelegramTdlibService,
      async () => ({
        id: 42,
        local: { is_downloading_completed: true, path: "/tmp/sticker.webp" },
        size: 128,
      }),
    );

    await service.downloadFile(42);

    expect(requests).toEqual([
      {
        _: "downloadFile",
        file_id: 42,
        priority: 32,
        offset: 0,
        limit: 1_000_000_000,
        synchronous: false,
      },
    ]);
  });

  it("requests owned sticker sets with a positive page limit", async () => {
    const { requests, service } = createServiceWithClient(
      TelegramTdlibService,
      async (request) => {
        if (request._ === "getOwnedStickerSets") return { sets: [{ id: 123 }] };
        if (request._ === "getStickerSet") {
          return {
            id: 123,
            name: "sample_pack_by_test",
            title: "Sample Pack",
            sticker_type: { _: "stickerTypeRegular" },
            sticker_format: { _: "stickerFormatWebm" },
            thumbnail: null,
            stickers: [],
          };
        }
        return null;
      },
    );

    await service.getOwnedStickerSets();

    expect(requests[0]).toEqual({
      _: "getOwnedStickerSets",
      offset_sticker_set_id: "0",
      limit: 100,
    });
  });

  it("preserves large sticker set ids without numeric coercion", async () => {
    const { requests, service } = createServiceWithClient(
      TelegramTdlibService,
      async () => ({
        id: "2706894883376857121",
        name: "sample_pack_by_test",
        title: "Sample Pack",
        sticker_type: { _: "stickerTypeRegular" },
        sticker_format: { _: "stickerFormatWebm" },
        thumbnail: null,
        stickers: [],
      }),
    );

    await service.getStickerSet("2706894883376857121");

    expect(requests).toEqual([
      { _: "getStickerSet", set_id: "2706894883376857121" },
    ]);
  });
}
