import type {
  TelegramRemoteStickerSet,
  TelegramTdlibService,
} from "../tdlib/service";
import { describeUnsupportedStickerSet } from "../auth/service";
import { supportsTelegramMirrorEditing } from "../mirror/support";
import { TelegramPackMediaDownloader } from "./mediaDownloader";
import { runOwnedPackSync } from "./ownedPackSync";
import type {
  ActiveDownloadMap,
  TelegramSyncServiceOptions,
} from "./types";
import {
  hasAccessibleLocalFile,
  hasRemoteThumbnail,
  inferStickerSetThumbnailExtension,
  resolveStickerSetThumbnailPath,
} from "./thumbnailUtils";

export type { TelegramSyncServiceOptions } from "./types";

export class TelegramSyncService {
  private readonly activeDownloads: ActiveDownloadMap = new Map();
  private readonly mediaDownloader: TelegramPackMediaDownloader;
  private activeOwnedPackSync: Promise<void> | null = null;

  constructor(private readonly options: TelegramSyncServiceOptions) {
    this.mediaDownloader = new TelegramPackMediaDownloader(
      options,
      this.activeDownloads,
      this.getRemoteStickerSetOrThrow.bind(this),
    );
  }

  attachToTdlib(tdlibService: TelegramTdlibService) {
    tdlibService.subscribe({
      onAuthStateChanged: () => undefined,
      onFileDownloadProgress: (progress) => {
        const mapped = this.activeDownloads.get(progress.numericFileId);
        if (!mapped) return;

        this.options.emit({
          type: "file_download_progress",
          packId: mapped.packId,
          stickerId: mapped.stickerId,
          stickerSetId: mapped.stickerSetId,
          downloadedSize: progress.downloadedSize,
          totalSize: progress.totalSize,
        });
      },
      onRuntimeError: () => undefined,
    });
  }

  async getRemoteStickerSetOrThrow(stickerSetId: string) {
    const remoteSet =
      await this.options.auth.tdlibService.getStickerSet(stickerSetId);
    if (!remoteSet.stickerSetId) {
      throw new Error(`Unable to load Telegram sticker set ${stickerSetId}.`);
    }
    return remoteSet;
  }

  async syncRemoteStickerSet(
    stickerSet: TelegramRemoteStickerSet,
    options: { publishedFromLocalPackId?: string | null } = {},
  ) {
    const mirrorContext = await this.resolveMirrorContext(stickerSet, options);

    if (!supportsTelegramMirrorEditing(stickerSet.format)) {
      return this.syncUnsupportedStickerSet(
        stickerSet,
        mirrorContext.publishedFromLocalPackId,
      );
    }

    return this.syncEditableStickerSet(stickerSet, mirrorContext);
  }

  async syncOwnedPacks(): Promise<void> {
    if (this.activeOwnedPackSync) return this.activeOwnedPackSync;

    const syncPromise = runOwnedPackSync(
      this.options,
      this.syncRemoteStickerSet.bind(this),
    );
    this.activeOwnedPackSync = syncPromise;

    try {
      await syncPromise;
    } finally {
      if (this.activeOwnedPackSync === syncPromise)
        this.activeOwnedPackSync = null;
    }
  }

  async downloadPackMedia(input: { packId: string; force?: boolean }) {
    return this.mediaDownloader.downloadPackMedia(input);
  }

  private async resolveMirrorContext(
    stickerSet: TelegramRemoteStickerSet,
    options: { publishedFromLocalPackId?: string | null },
  ) {
    const existingMirror =
      await this.options.libraryService.findPackByTelegramStickerSetId(
        stickerSet.stickerSetId,
      );

    return {
      existingThumbnailPath:
        existingMirror?.record.telegram?.thumbnailPath ?? null,
      publishedFromLocalPackId:
        options.publishedFromLocalPackId ??
        existingMirror?.record.telegram?.publishedFromLocalPackId ??
        null,
    };
  }

  private async syncUnsupportedStickerSet(
    stickerSet: TelegramRemoteStickerSet,
    publishedFromLocalPackId: string | null,
  ) {
    const error = describeUnsupportedStickerSet(stickerSet);
    const details = await this.options.mirrorService.upsertStickerSet({
      stickerSet,
      thumbnailPath: null,
      hasThumbnail: false,
      thumbnailExtension: null,
      publishedFromLocalPackId,
      syncState: "unsupported",
      lastSyncError: error,
      includeStickers: false,
    });
    await this.options.mirrorService.markPackSyncState(
      details.record.id,
      "unsupported",
      error,
    );
    this.emitPackSyncCompleted(details.record.id, stickerSet.stickerSetId);
    return details.record.id;
  }

  private async syncEditableStickerSet(
    stickerSet: TelegramRemoteStickerSet,
    context: {
      existingThumbnailPath: string | null;
      publishedFromLocalPackId: string | null;
    },
  ) {
    const thumbnailPath = await resolveStickerSetThumbnailPath(
      this.options,
      stickerSet,
      {
        allowDownload: !(await hasAccessibleLocalFile(
          context.existingThumbnailPath,
        )),
      },
    );
    const details = await this.options.mirrorService.upsertStickerSet({
      stickerSet,
      thumbnailPath,
      hasThumbnail: hasRemoteThumbnail(stickerSet),
      thumbnailExtension: inferStickerSetThumbnailExtension(stickerSet),
      publishedFromLocalPackId: context.publishedFromLocalPackId,
      syncState: "syncing",
      lastSyncError: null,
    });

    this.options.emit({
      type: "pack_sync_started",
      packId: details.record.id,
      stickerSetId: stickerSet.stickerSetId,
    });
    await this.downloadPackMedia({ packId: details.record.id });
    await this.options.mirrorService.markPackSyncState(
      details.record.id,
      "idle",
      null,
    );
    this.emitPackSyncCompleted(details.record.id, stickerSet.stickerSetId);

    return details.record.id;
  }

  private emitPackSyncCompleted(packId: string, stickerSetId: string) {
    this.options.emit({
      type: "pack_sync_completed",
      packId,
      stickerSetId,
    });
  }
}
