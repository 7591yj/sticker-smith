import { hashEmojiList, type StickerItem } from "@sticker-smith/shared";

export function isReady(sticker: StickerItem) {
  return !isFailed(sticker) && !isDraft(sticker) && !isModified(sticker);
}

export function isFailed(sticker: StickerItem) {
  return sticker.downloadState === "failed";
}

export function isDraft(sticker: StickerItem) {
  return !isFailed(sticker) && (!sticker.absolutePath || sticker.emojiList.length === 0);
}

function getBaselineEmojiHash(sticker: StickerItem) {
  return sticker.telegram?.baselineEmojiHash ?? hashEmojiList(sticker.emojiList);
}

export function isModified(sticker: StickerItem) {
  if (!sticker.telegram) return false;
  return (
    sticker.sha256 !== sticker.telegram.baselineStickerHash ||
    hashEmojiList(sticker.emojiList) !== getBaselineEmojiHash(sticker) ||
    sticker.order !== sticker.telegram.position
  );
}

export function isSynced(sticker: StickerItem) {
  if (!sticker.telegram) return false;
  return (
    sticker.sha256 === sticker.telegram.baselineStickerHash &&
    hashEmojiList(sticker.emojiList) === getBaselineEmojiHash(sticker) &&
    sticker.order === sticker.telegram.position
  );
}
