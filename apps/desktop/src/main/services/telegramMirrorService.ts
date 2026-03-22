import path from "node:path";

import type { LibraryService } from "./libraryService";
import { nowIso } from "../utils/timeUtils";
import type {
  TelegramDownloadedFile,
  TelegramRemoteSticker,
  TelegramRemoteStickerSet,
} from "./telegramTdlibService";

function relativeStickerPath(position: number) {
  return `sticker-${String(position + 1).padStart(3, "0")}.webm`;
}

export class TelegramMirrorService {
  constructor(private readonly libraryService: LibraryService) {}

  async upsertStickerSet(input: {
    stickerSet: TelegramRemoteStickerSet;
    thumbnailPath: string | null;
    hasThumbnail?: boolean;
    thumbnailExtension?: string | null;
    publishedFromLocalPackId?: string | null;
    syncState?: "idle" | "syncing" | "stale" | "error" | "unsupported";
    lastSyncError?: string | null;
    includeAssets?: boolean;
  }) {
    const { stickerSet } = input;
    const includeAssets = input.includeAssets ?? true;

    return this.libraryService.upsertTelegramMirror({
      stickerSetId: stickerSet.stickerSetId,
      title: stickerSet.title,
      shortName: stickerSet.shortName,
      format: stickerSet.format,
      thumbnailPath: input.thumbnailPath,
      hasThumbnail: input.hasThumbnail,
      thumbnailExtension: input.thumbnailExtension,
      syncState: input.syncState ?? "idle",
      lastSyncedAt: nowIso(),
      lastSyncError: input.lastSyncError ?? null,
      publishedFromLocalPackId: input.publishedFromLocalPackId ?? null,
      assets: includeAssets
        ? stickerSet.stickers.map((sticker) => ({
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
          }))
        : [],
    });
  }

  async markPackSyncState(
    packId: string,
    syncState: "idle" | "syncing" | "stale" | "error" | "unsupported",
    lastSyncError: string | null = null,
  ) {
    await this.libraryService.updateTelegramMirrorMetadata({
      packId,
      syncState,
      lastSyncedAt: syncState === "idle" ? nowIso() : undefined,
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
