import type { TelegramRemoteSticker, TelegramRemoteStickerSet } from "./telegramTdlibTypes";
import { mapFile } from "./telegramTdlibFiles";
import { asNumber, asPresentString, getObjectValue } from "./telegramTdlibValues";

function mapStickerFormat(format: any) {
  switch (format?._) {
    case "stickerFormatWebm":
      return "video" as const;
    case "stickerFormatTgs":
      return "animated" as const;
    case "stickerFormatWebp":
      return "static" as const;
    default:
      return "unknown" as const;
  }
}

function listStickers(set: any) {
  return Array.isArray(set?.stickers) ? set.stickers : [];
}

function getStickerSetFormat(
  stickerFormats: Array<TelegramRemoteSticker["format"]>,
): TelegramRemoteStickerSet["format"] {
  const uniqueFormats = new Set(stickerFormats);

  if (uniqueFormats.size === 1) {
    return stickerFormats[0] ?? "unknown";
  }

  return uniqueFormats.size > 1 ? "mixed" : "unknown";
}

function mapStickerEmojiList(emoji: unknown) {
  if (Array.isArray(emoji)) return emoji;
  if (typeof emoji !== "string" || emoji.length === 0) return [];
  return emoji.trim().split(/\s+/);
}

function mapSticker(sticker: any, index: number): TelegramRemoteSticker {
  const file = getObjectValue(sticker, "sticker");
  const remote = getObjectValue(file, "remote");

  return {
    stickerId: String(getObjectValue(sticker, "id") ?? index),
    fileId: getObjectValue(remote, "id") ?? null,
    fileUniqueId: getObjectValue(remote, "unique_id") ?? null,
    numericFileId: asNumber(getObjectValue(file, "id")),
    position: index,
    emojiList: mapStickerEmojiList(getObjectValue(sticker, "emoji")),
    format: mapStickerFormat(getObjectValue(sticker, "format")),
  };
}

function getStickerSetThumbnail(set: any) {
  const thumbnail = getObjectValue(set, "thumbnail");
  return {
    stickerId: asPresentString(getObjectValue(getObjectValue(thumbnail, "sticker"), "id")),
    file: getObjectValue(thumbnail, "file"),
  };
}

export function mapStickerSet(set: any): TelegramRemoteStickerSet {
  const stickers = listStickers(set);
  const stickerFormats = stickers.map((sticker: any) =>
    mapStickerFormat(sticker.format),
  );
  const thumbnail = getStickerSetThumbnail(set);

  return {
    stickerSetId: String(getObjectValue(set, "id") ?? ""),
    shortName: String(getObjectValue(set, "name") ?? ""),
    title: String(getObjectValue(set, "title") ?? ""),
    format: getStickerSetFormat(stickerFormats),
    thumbnailStickerId: thumbnail.stickerId,
    thumbnailFile: thumbnail.file ? mapFile(thumbnail.file) : null,
    stickers: stickers.map(mapSticker),
  };
}
