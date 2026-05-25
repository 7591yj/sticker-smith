import type { ConversionMode } from "@sticker-smith/shared";

interface StickerStickerLike {
  stickerId: string;
  mode: ConversionMode;
}

export function findSticker<T extends StickerStickerLike>(
  stickers: readonly T[],
  stickerId: string,
) {
  return stickers.find(
    (output) => output.stickerId === stickerId && output.mode === "sticker",
  );
}
