import type { TelegramPackSummary } from "@sticker-smith/shared";

export function supportsTelegramMirrorEditing(
  format: TelegramPackSummary["format"],
) {
  return format === "video";
}
