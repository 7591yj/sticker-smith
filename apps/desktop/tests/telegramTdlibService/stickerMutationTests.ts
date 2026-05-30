import { expect, it } from "vitest";
import { TelegramTdlibService } from "../../src/main/services/telegramTdlibService";
import { createOkServiceWithClient, createServiceWithClient } from "./helpers";

export function registerStickerMutationTests() {
  it("rejects occupied Telegram sticker set names", async () => {
    const { service } = createServiceWithClient(
      TelegramTdlibService,
      async () => ({ _: "checkStickerSetNameResultNameOccupied" }),
    );
    await expect(service.checkStickerSetName("sample_pack")).rejects.toThrow(
      "A Telegram sticker set with that short name already exists.",
    );
  });

  it("rejects invalid Telegram sticker set names", async () => {
    const { service } = createServiceWithClient(
      TelegramTdlibService,
      async () => ({ _: "checkStickerSetNameResultNameInvalid" }),
    );
    await expect(service.checkStickerSetName("bad")).rejects.toThrow(
      "The Telegram sticker short name is invalid.",
    );
  });

  it("updates sticker set titles by short name", async () => {
    const { requests, service } =
      createOkServiceWithClient(TelegramTdlibService);
    await service.setStickerSetTitle({
      shortName: "sample_pack",
      title: "Renamed Pack",
    });
    expect(requests).toEqual([
      { _: "setStickerSetTitle", name: "sample_pack", title: "Renamed Pack" },
    ]);
  });

  it("replaces stickers in a set by short name", async () => {
    const { requests, service } =
      createOkServiceWithClient(TelegramTdlibService);
    service.getSessionUser = async () => ({ id: 123 });

    await service.replaceStickerInSet({
      shortName: "sample_pack",
      oldFileId: "remote-file-id",
      newStickerPath: "/tmp/sticker.webm",
      emojis: ["🙂"],
    });

    expect(requests).toEqual([
      {
        _: "replaceStickerInSet",
        user_id: 123,
        name: "sample_pack",
        old_sticker: { _: "inputFileRemote", id: "remote-file-id" },
        new_sticker: {
          _: "inputSticker",
          sticker: { _: "inputFileLocal", path: "/tmp/sticker.webm" },
          format: { _: "stickerFormatWebm" },
          emojis: "🙂",
        },
      },
    ]);
  });

  it("moves stickers within a set by remote file id", async () => {
    const { requests, service } =
      createOkServiceWithClient(TelegramTdlibService);
    await service.setStickerPositionInSet({
      fileId: "remote-file-id",
      position: 0,
    });
    expect(requests).toEqual([
      {
        _: "setStickerPositionInSet",
        sticker: { _: "inputFileRemote", id: "remote-file-id" },
        position: 0,
      },
    ]);
  });

  it("sends sticker set thumbnails as input files", async () => {
    const { requests, service } =
      createOkServiceWithClient(TelegramTdlibService);
    service.getSessionUser = async () => ({ id: 123 });

    await service.setStickerSetThumbnail({
      shortName: "sample_pack",
      thumbnailPath: "/tmp/icon.webm",
      format: "video",
    });

    expect(requests).toEqual([
      {
        _: "setStickerSetThumbnail",
        user_id: 123,
        name: "sample_pack",
        thumbnail: { _: "inputFileLocal", path: "/tmp/icon.webm" },
        format: { _: "stickerFormatWebm" },
      },
    ]);
  });

  it("rejects empty sticker set thumbnail names before invoking TDLib", async () => {
    const { service } = createOkServiceWithClient(TelegramTdlibService);
    service.getSessionUser = async () => ({ id: 123 });

    await expect(
      service.setStickerSetThumbnail({
        shortName: "   ",
        thumbnailPath: "/tmp/icon.webm",
        format: "video",
      }),
    ).rejects.toThrow("Telegram sticker set short name must be non-empty.");
  });
}
