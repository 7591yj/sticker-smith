import path from "node:path";

import type { LibraryService } from "../../library/service";
import { nowIso } from "../../../utils/timeUtils";
import type {
  TelegramDownloadedFile,
  TelegramRemoteSticker,
  TelegramRemoteStickerSet,
} from "../tdlib/service";

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
    includeStickers?: boolean;
  }) {
    const { stickerSet } = input;
    const includeStickers = input.includeStickers ?? true;

    return this.libraryService.upsertTelegramMirror({
      stickerSetId: stickerSet.stickerSetId,
      title: stickerSet.title,
      shortName: stickerSet.shortName,
      format: stickerSet.format,
      thumbnailPath: input.thumbnailPath,
      thumbnailStickerId: stickerSet.thumbnailStickerId,
      hasThumbnail: input.hasThumbnail,
      thumbnailExtension: input.thumbnailExtension,
      syncState: input.syncState ?? "idle",
      lastSyncedAt: nowIso(),
      lastSyncError: input.lastSyncError ?? null,
      publishedFromLocalPackId: input.publishedFromLocalPackId ?? null,
      stickers: includeStickers
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
              baselineStickerHash: null,
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

  async markStickerQueued(packId: string, stickerId: string) {
    await this.libraryService.setTelegramStickerDownloadState({
      packId,
      stickerId,
      downloadState: "queued",
    });
  }

  async markStickerDownloading(packId: string, stickerId: string) {
    await this.libraryService.setTelegramStickerDownloadState({
      packId,
      stickerId,
      downloadState: "downloading",
    });
  }

  async markStickerFailed(packId: string, stickerId: string) {
    await this.libraryService.setTelegramStickerDownloadState({
      packId,
      stickerId,
      downloadState: "failed",
    });
  }

  async storeDownloadedSticker(input: {
    packId: string;
    stickerId: string;
    sticker: TelegramRemoteSticker;
    file: TelegramDownloadedFile;
  }) {
    if (!input.file.localPath) {
      throw new Error("Downloaded Telegram sticker file has no local path.");
    }

    await this.libraryService.writeTelegramStickerFile({
      packId: input.packId,
      stickerId: input.stickerId,
      sourceFilePath: input.file.localPath,
      relativePath: relativeStickerPath(input.sticker.position),
    });
  }
}
