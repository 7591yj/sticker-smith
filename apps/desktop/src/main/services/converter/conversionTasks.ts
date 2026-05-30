import path from "node:path";
import type { ConversionTask, StickerPackDetails } from "@sticker-smith/shared";

export function buildConversionTasks(
  details: StickerPackDetails,
  stickerIds?: string[],
): ConversionTask[] {
  const selectedStickerIds = stickerIds ? new Set(stickerIds) : null;
  const sortedStickers = [...details.stickers].sort(
    (left, right) =>
      left.order - right.order || left.id.localeCompare(right.id),
  );
  const outputRoot = path.join(details.pack.rootPath, "webm");
  const tasks: ConversionTask[] = [];
  let iconTask: ConversionTask | null = null;

  for (const sticker of sortedStickers) {
    if (selectedStickerIds && !selectedStickerIds.has(sticker.id)) continue;
    if (!sticker.absolutePath) continue;

    if (sticker.id === details.pack.iconStickerId) {
      iconTask = {
        stickerId: sticker.id,
        sourcePath: sticker.absolutePath,
        mode: "icon",
        outputPath: path.join(outputRoot, "icon.webm"),
      };
      continue;
    }

    tasks.push({
      stickerId: sticker.id,
      sourcePath: sticker.absolutePath,
      mode: "sticker",
      outputPath: path.join(outputRoot, `${sticker.id}.webm`),
    });
  }

  if (iconTask) tasks.push(iconTask);
  return tasks;
}
