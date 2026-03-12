import path from "node:path";

import type { LibraryService } from "./libraryService";
import type {
  TelegramDownloadedFile,
  TelegramRemoteSticker,
  TelegramRemoteStickerSet,
} from "./telegramTdlibService";

function relativeStickerPath(position: number) {
  return path.posix.join(
    "stickers",
    `${String(position + 1).padStart(3, "0")}.webm`,
  );
}

export class TelegramMirrorService {
  constructor(private readonly libraryService: LibraryService) {}

  async upsertStickerSet(input: {
    stickerSet: TelegramRemoteStickerSet;
    publishedFromLocalPackId?: string | null;
    syncState?: "idle" | "syncing" | "stale" | "error";
    lastSyncError?: string | null;
  }) {
    const { stickerSet } = input;

    return this.libraryService.upsertTelegramMirror({
      stickerSetId: stickerSet.stickerSetId,
      title: stickerSet.title,
      shortName: stickerSet.shortName,
      syncState: input.syncState ?? "idle",
      lastSyncedAt: new Date().toISOString(),
      lastSyncError: input.lastSyncError ?? null,
      publishedFromLocalPackId: input.publishedFromLocalPackId ?? null,
      iconStickerId:
        stickerSet.thumbnailStickerId ?? stickerSet.stickers[0]?.stickerId ?? null,
      assets: stickerSet.stickers.map((sticker) => ({
        relativePath: relativeStickerPath(sticker.position),
        emojiList: sticker.emojiList,
        kind: "webm",
        downloadState: "missing",
        telegram: {
          stickerId: sticker.stickerId,
          fileId: sticker.fileId,
          fileUniqueId: sticker.fileUniqueId,
          position: sticker.position,
          baselineOutputHash: null,
        },
      })),
    });
  }

  async markPackSyncState(
    packId: string,
    syncState: "idle" | "syncing" | "stale" | "error",
    lastSyncError: string | null = null,
  ) {
    await this.libraryService.updateTelegramMirrorMetadata({
      packId,
      syncState,
      lastSyncedAt: syncState === "idle" ? new Date().toISOString() : undefined,
      lastSyncError,
    });
  }

  async markStickerQueued(packId: string, assetId: string) {
    await this.libraryService.setTelegramAssetDownloadState({
      packId,
      assetId,
      downloadState: "queued",
    });
  }

  async markStickerDownloading(packId: string, assetId: string) {
    await this.libraryService.setTelegramAssetDownloadState({
      packId,
      assetId,
      downloadState: "downloading",
    });
  }

  async markStickerFailed(packId: string, assetId: string) {
    await this.libraryService.setTelegramAssetDownloadState({
      packId,
      assetId,
      downloadState: "failed",
    });
  }

  async storeDownloadedSticker(input: {
    packId: string;
    assetId: string;
    sticker: TelegramRemoteSticker;
    file: TelegramDownloadedFile;
  }) {
    if (!input.file.localPath) {
      throw new Error("Downloaded Telegram sticker file has no local path.");
    }

    await this.libraryService.writeTelegramAssetFile({
      packId: input.packId,
      assetId: input.assetId,
      sourceFilePath: input.file.localPath,
      relativePath: relativeStickerPath(input.sticker.position),
    });
  }
}
