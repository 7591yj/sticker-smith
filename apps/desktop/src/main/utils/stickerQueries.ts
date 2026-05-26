interface StickerLike {
  id: string;
}

export function findSticker<T extends StickerLike>(
  stickers: readonly T[],
  stickerId: string,
) {
  return stickers.find((sticker) => sticker.id === stickerId);
}
