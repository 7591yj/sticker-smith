import { hashEmojiList, type StickerItem } from "@sticker-smith/shared";

export type StickerStatus = "draft" | "ready" | "synced" | "modified" | "failed";

export function getStickerStatus(sticker: StickerItem): StickerStatus {
  if (isFailed(sticker)) return "failed";
  if (isDraft(sticker)) return "draft";
  if (isModified(sticker)) return "modified";
  if (isSynced(sticker)) return "synced";
  return "ready";
}

export function isReady(sticker: StickerItem) {
  return getStickerStatus(sticker) === "ready";
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

function isModified(sticker: StickerItem) {
  if (!sticker.telegram) return false;
  return (
    sticker.sha256 !== sticker.telegram.baselineStickerHash ||
    hashEmojiList(sticker.emojiList) !== getBaselineEmojiHash(sticker) ||
    sticker.order !== sticker.telegram.position
  );
}

function isSynced(sticker: StickerItem) {
  if (!sticker.telegram) return false;
  return (
    sticker.sha256 === sticker.telegram.baselineStickerHash &&
    hashEmojiList(sticker.emojiList) === getBaselineEmojiHash(sticker) &&
    sticker.order === sticker.telegram.position
  );
}
