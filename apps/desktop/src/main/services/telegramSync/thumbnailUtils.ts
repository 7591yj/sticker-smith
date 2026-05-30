import path from "node:path";
import { pathExists } from "../../utils/fsUtils";
import type { TelegramRemoteStickerSet } from "../telegramTdlibService";
import type { TelegramSyncServiceOptions } from "./types";

async function resolveExistingLocalPath(localPath: string | null | undefined) {
  return localPath && (await pathExists(localPath)) ? localPath : null;
}

async function downloadFileLocalPath(
  options: TelegramSyncServiceOptions,
  numericFileId: number,
) {
  try {
    const downloaded =
      await options.auth.tdlibService.downloadFile(numericFileId);
    return resolveExistingLocalPath(downloaded.localPath);
  } catch {
    return null;
  }
}

async function resolveThumbnailFilePath(
  options: TelegramSyncServiceOptions,
  stickerSet: TelegramRemoteStickerSet,
  allowDownload: boolean,
) {
  const thumbnailFile = stickerSet.thumbnailFile;
  if (!thumbnailFile || thumbnailFile.numericFileId <= 0) return null;

  const existingLocalPath = thumbnailFile.isDownloaded
    ? await resolveExistingLocalPath(thumbnailFile.localPath)
    : null;
  if (existingLocalPath || !allowDownload) return existingLocalPath;

  return downloadFileLocalPath(options, thumbnailFile.numericFileId);
}

async function resolveThumbnailStickerPath(
  options: TelegramSyncServiceOptions,
  stickerSet: TelegramRemoteStickerSet,
  allowDownload: boolean,
) {
  if (!stickerSet.thumbnailStickerId || !allowDownload) return null;

  const thumbnailSticker = stickerSet.stickers.find(
    (sticker) => sticker.stickerId === stickerSet.thumbnailStickerId,
  );
  if (!thumbnailSticker || thumbnailSticker.numericFileId <= 0) return null;

  return downloadFileLocalPath(options, thumbnailSticker.numericFileId);
}

export async function resolveStickerSetThumbnailPath(
  options: TelegramSyncServiceOptions,
  stickerSet: TelegramRemoteStickerSet,
  input: { allowDownload?: boolean } = {},
) {
  const allowDownload = input.allowDownload ?? false;
  const thumbnailFilePath = await resolveThumbnailFilePath(
    options,
    stickerSet,
    allowDownload,
  );
  return (
    thumbnailFilePath ??
    resolveThumbnailStickerPath(options, stickerSet, allowDownload)
  );
}

export function hasRemoteThumbnail(stickerSet: TelegramRemoteStickerSet) {
  return (
    Boolean(
      stickerSet.thumbnailFile && stickerSet.thumbnailFile.numericFileId > 0,
    ) || Boolean(stickerSet.thumbnailStickerId)
  );
}

export function inferStickerSetThumbnailExtension(
  stickerSet: TelegramRemoteStickerSet,
) {
  const thumbnailFileExtension = path.extname(
    stickerSet.thumbnailFile?.localPath ?? "",
  );
  if (thumbnailFileExtension) return thumbnailFileExtension;

  if (
    stickerSet.format === "video" &&
    (stickerSet.thumbnailFile || stickerSet.thumbnailStickerId)
  ) {
    return ".webm";
  }

  return null;
}

export function hasAccessibleLocalFile(localPath: string | null | undefined) {
  return !!localPath && pathExists(localPath);
}
