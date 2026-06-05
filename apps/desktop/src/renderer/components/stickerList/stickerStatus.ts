import type { StickerItem } from "@sticker-smith/shared";
import { isDraft, isFailed, isModified, isSynced } from "./stickerStatusPredicates";

export type StickerStatus = "draft" | "ready" | "synced" | "modified" | "failed";

export function getStickerStatus(sticker: StickerItem): StickerStatus {
  if (isFailed(sticker)) return "failed";
  if (isDraft(sticker)) return "draft";
  if (isModified(sticker)) return "modified";
  if (isSynced(sticker)) return "synced";
  return "ready";
}
