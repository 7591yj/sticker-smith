import type { StickerItem } from "@sticker-smith/shared";

import { nowIso } from "../../utils/timeUtils";

type StoredSticker = Omit<StickerItem, "absolutePath">;

export function markStickerFileReady(
  sticker: StoredSticker,
  input: { relativePath: string; sizeBytes: number; sha256: string | null },
) {
  sticker.relativePath = input.relativePath;
  sticker.sizeBytes = input.sizeBytes;
  sticker.sha256 = input.sha256;
  sticker.updatedAt = nowIso();
  sticker.downloadState = "ready";
}
