import fs from "node:fs/promises";
import path from "node:path";
import { resolvePackPaths } from "../packRepository";

export async function syncTelegramThumbnailFile(
  rootPath: string,
  thumbnailPath: string | null,
  options: { hasThumbnail?: boolean; preferredExtension?: string | null } = {},
) {
  const { outputRoot } = resolvePackPaths(rootPath);
  await fs.mkdir(outputRoot, { recursive: true });
  const entries = await fs.readdir(outputRoot, { withFileTypes: true });
  const existing = entries
    .filter(
      (entry) => entry.isFile() && entry.name.startsWith("telegram-pack-icon."),
    )
    .map((entry) => path.join(outputRoot, entry.name));
  const removeExisting = async (excluded?: string) =>
    Promise.all(
      existing
        .filter((item) => item !== excluded)
        .map((item) => fs.rm(item, { force: true })),
    );

  if (!thumbnailPath) {
    if (options.hasThumbnail && existing[0]) {
      await removeExisting(existing[0]);
      return existing[0];
    }
    await removeExisting();
    return null;
  }

  const extension =
    path.extname(thumbnailPath) || options.preferredExtension || ".bin";
  const destination = path.join(outputRoot, `telegram-pack-icon${extension}`);
  if (thumbnailPath !== destination)
    await fs.copyFile(thumbnailPath, destination);
  await removeExisting(destination);
  return destination;
}
