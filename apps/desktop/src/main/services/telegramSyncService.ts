import path from "node:path";

import type { TelegramEvent } from "@sticker-smith/shared";

import type { LibraryService } from "./libraryService";
import type { TelegramAuthService } from "./telegramAuthService";
import { describeTdlibError, describeUnsupportedStickerSet } from "./telegramAuthService";
import type { TelegramMirrorService } from "./telegramMirrorService";
import { supportsTelegramMirrorEditing } from "./telegramMirrorSupport";
import type {
  TelegramRemoteStickerSet,
  TelegramTdlibService,
} from "./telegramTdlibService";
import { pathExists } from "../utils/fsUtils";

interface TelegramSyncServiceOptions {
  auth: TelegramAuthService;
  libraryService: LibraryService;
  mirrorService: TelegramMirrorService;
  emit: (event: TelegramEvent) => void;
}

export class TelegramSyncService {
  private readonly activeDownloads = new Map<
    number,
    { packId: string; assetId: string; stickerSetId: string }
  >();
  private readonly activePackDownloads = new Map<string, Promise<void>>();
  private activeOwnedPackSync: Promise<void> | null = null;

  constructor(private readonly options: TelegramSyncServiceOptions) {}

  attachToTdlib(tdlibService: TelegramTdlibService) {
    tdlibService.subscribe({
      onAuthStateChanged: () => undefined,
      onFileDownloadProgress: (progress) => {
        const mapped = this.activeDownloads.get(progress.numericFileId);
        if (!mapped) {
          return;
        }

        this.options.emit({
          type: "file_download_progress",
          packId: mapped.packId,
          assetId: mapped.assetId,
          stickerSetId: mapped.stickerSetId,
          downloadedSize: progress.downloadedSize,
          totalSize: progress.totalSize,
        });
      },
      onRuntimeError: () => undefined,
    });
  }

  async getRemoteStickerSetOrThrow(stickerSetId: string) {
    const remoteSet = await this.options.auth.tdlibService.getStickerSet(stickerSetId);
    if (!remoteSet.stickerSetId) {
      throw new Error(`Unable to load Telegram sticker set ${stickerSetId}.`);
    }
    return remoteSet;
  }

  async syncRemoteStickerSet(
    stickerSet: TelegramRemoteStickerSet,
    options: { publishedFromLocalPackId?: string | null } = {},
  ) {
    const existingMirror =
      await this.options.libraryService.findPackByTelegramStickerSetId(
        stickerSet.stickerSetId,
      );
    const existingThumbnailPath = existingMirror?.record.telegram?.thumbnailPath ?? null;
    const publishedFromLocalPackId =
      options.publishedFromLocalPackId ??
      existingMirror?.record.telegram?.publishedFromLocalPackId ??
      null;

    if (!supportsTelegramMirrorEditing(stickerSet.format)) {
      const details = await this.options.mirrorService.upsertStickerSet({
        stickerSet,
        thumbnailPath: null,
        hasThumbnail: false,
        thumbnailExtension: null,
        publishedFromLocalPackId,
        syncState: "unsupported",
        lastSyncError: describeUnsupportedStickerSet(stickerSet),
        includeAssets: false,
      });
      await this.options.mirrorService.markPackSyncState(
        details.pack.id,
        "unsupported",
        describeUnsupportedStickerSet(stickerSet),
      );
      this.options.emit({
        type: "pack_sync_completed",
        packId: details.pack.id,
        stickerSetId: stickerSet.stickerSetId,
      });
      return details.pack.id;
    }

    const hasRemoteThumbnail =
      Boolean(stickerSet.thumbnailFile && stickerSet.thumbnailFile.numericFileId > 0) ||
      Boolean(stickerSet.thumbnailStickerId);
    const thumbnailPath = await this.resolveStickerSetThumbnailPath(stickerSet, {
      allowDownload: !(await this.hasAccessibleLocalFile(existingThumbnailPath)),
    });

    const details = await this.options.mirrorService.upsertStickerSet({
      stickerSet,
      thumbnailPath,
      hasThumbnail: hasRemoteThumbnail,
      thumbnailExtension: this.inferStickerSetThumbnailExtension(stickerSet),
      publishedFromLocalPackId,
      syncState: "syncing",
      lastSyncError: null,
    });
    this.options.emit({
      type: "pack_sync_started",
      packId: details.pack.id,
      stickerSetId: stickerSet.stickerSetId,
    });

    await this.downloadPackMedia({ packId: details.pack.id });
    await this.options.mirrorService.markPackSyncState(details.pack.id, "idle", null);
    this.options.emit({
      type: "pack_sync_completed",
      packId: details.pack.id,
      stickerSetId: stickerSet.stickerSetId,
    });

    return details.pack.id;
  }

  async syncOwnedPacks(): Promise<void> {
    if (this.activeOwnedPackSync) {
      return this.activeOwnedPackSync;
    }

    const syncPromise = (async () => {
      await this.options.auth.requireConnectedState();
      this.options.emit({ type: "sync_started" });

      const stickerSets = await this.options.auth.tdlibService.getOwnedStickerSets();
      const stickerSetIds = new Set(stickerSets.map((set) => set.stickerSetId));
      const packIds: string[] = [];

      for (const stickerSet of stickerSets) {
        try {
          packIds.push(await this.syncRemoteStickerSet(stickerSet));
        } catch (error) {
          const existing =
            await this.options.libraryService.findPackByTelegramStickerSetId(
              stickerSet.stickerSetId,
            );
          if (existing) {
            await this.options.mirrorService.markPackSyncState(
              existing.record.id,
              "error",
              describeTdlibError(error),
            );
          }
          this.options.emit({
            type: "pack_sync_failed",
            packId: existing?.record.id ?? null,
            stickerSetId: stickerSet.stickerSetId,
            error: describeTdlibError(error),
          });
        }
      }

      const existingTelegramPacks = (await this.options.libraryService.listPacks()).filter(
        (pack) => pack.source === "telegram",
      );
      await Promise.all(
        existingTelegramPacks
          .filter((pack) => {
            const stickerSetId = pack.telegram?.stickerSetId;
            return stickerSetId ? !stickerSetIds.has(stickerSetId) : false;
          })
          .map((pack) => this.options.libraryService.deletePack({ packId: pack.id })),
      );

      this.options.emit({
        type: "sync_finished",
        packIds,
      });
    })();

    this.activeOwnedPackSync = syncPromise;

    try {
      await syncPromise;
    } finally {
      if (this.activeOwnedPackSync === syncPromise) {
        this.activeOwnedPackSync = null;
      }
    }
  }

  async downloadPackMedia(input: { packId: string; force?: boolean }) {
    const existingDownload = this.activePackDownloads.get(input.packId);
    if (existingDownload) {
      return existingDownload;
    }

    const downloadPromise = (async () => {
      await this.options.auth.requireConnectedState();
      const details = await this.options.libraryService.getPack(input.packId);
      const stickerSetId = details.pack.telegram?.stickerSetId;
      if (!stickerSetId) {
        throw new Error(`Pack ${input.packId} is not a Telegram mirror.`);
      }
      if (
        details.pack.telegram &&
        !supportsTelegramMirrorEditing(details.pack.telegram.format)
      ) {
        throw new Error(describeUnsupportedStickerSet(details.pack.telegram));
      }

      const remoteSet = await this.getRemoteStickerSetOrThrow(stickerSetId);
      const shouldBackfillThumbnail =
        details.pack.iconAssetId === null &&
        !(await this.hasAccessibleLocalFile(details.pack.thumbnailPath));
      if (shouldBackfillThumbnail) {
        const thumbnailPath = await this.resolveStickerSetThumbnailPath(remoteSet, {
          allowDownload: true,
        });
        const hasRemoteThumbnail =
          Boolean(
            remoteSet.thumbnailFile && remoteSet.thumbnailFile.numericFileId > 0,
          ) || Boolean(remoteSet.thumbnailStickerId);

        if (thumbnailPath || hasRemoteThumbnail) {
          await this.options.libraryService.syncTelegramThumbnail({
            packId: details.pack.id,
            thumbnailPath,
            hasThumbnail: hasRemoteThumbnail,
            thumbnailExtension: this.inferStickerSetThumbnailExtension(remoteSet),
          });
        }
      }

      const remoteByStickerId = new Map(
        remoteSet.stickers.map((sticker) => [sticker.stickerId, sticker]),
      );

      for (const asset of details.assets) {
        if (!asset.telegram) {
          continue;
        }
        if (!input.force && asset.downloadState === "ready") {
          continue;
        }

        const remoteSticker = remoteByStickerId.get(asset.telegram.stickerId);
        if (!remoteSticker || remoteSticker.numericFileId <= 0) {
          await this.options.mirrorService.markStickerFailed(details.pack.id, asset.id);
          continue;
        }

        this.activeDownloads.set(remoteSticker.numericFileId, {
          packId: details.pack.id,
          assetId: asset.id,
          stickerSetId,
        });

        try {
          await this.options.mirrorService.markStickerQueued(details.pack.id, asset.id);
          await this.options.mirrorService.markStickerDownloading(
            details.pack.id,
            asset.id,
          );
          const downloaded = await this.options.auth.tdlibService.downloadFile(
            remoteSticker.numericFileId,
          );
          await this.options.mirrorService.storeDownloadedSticker({
            packId: details.pack.id,
            assetId: asset.id,
            sticker: remoteSticker,
            file: downloaded,
          });
        } catch {
          await this.options.mirrorService.markStickerFailed(details.pack.id, asset.id);
        } finally {
          this.activeDownloads.delete(remoteSticker.numericFileId);
        }
      }
    })();

    this.activePackDownloads.set(input.packId, downloadPromise);

    try {
      await downloadPromise;
    } finally {
      if (this.activePackDownloads.get(input.packId) === downloadPromise) {
        this.activePackDownloads.delete(input.packId);
      }
    }
  }

  private async resolveStickerSetThumbnailPath(
    stickerSet: TelegramRemoteStickerSet,
    options: { allowDownload?: boolean } = {},
  ) {
    const resolveExistingLocalPath = async (localPath: string | null | undefined) =>
      localPath && (await pathExists(localPath)) ? localPath : null;

    const thumbnailFile = stickerSet.thumbnailFile;
    if (thumbnailFile && thumbnailFile.numericFileId > 0) {
      const existingLocalPath = thumbnailFile.isDownloaded
        ? await resolveExistingLocalPath(thumbnailFile.localPath)
        : null;
      if (existingLocalPath) {
        return existingLocalPath;
      }

      if (!options.allowDownload) {
        return null;
      }

      try {
        const downloaded = await this.options.auth.tdlibService.downloadFile(
          thumbnailFile.numericFileId,
        );
        const downloadedLocalPath = await resolveExistingLocalPath(
          downloaded.localPath,
        );
        if (downloadedLocalPath) {
          return downloadedLocalPath;
        }
      } catch {}
    }

    if (!stickerSet.thumbnailStickerId || !options.allowDownload) {
      return null;
    }

    const thumbnailSticker = stickerSet.stickers.find(
      (sticker) => sticker.stickerId === stickerSet.thumbnailStickerId,
    );
    if (!thumbnailSticker || thumbnailSticker.numericFileId <= 0) {
      return null;
    }

    try {
      const downloaded = await this.options.auth.tdlibService.downloadFile(
        thumbnailSticker.numericFileId,
      );
      const downloadedLocalPath = await resolveExistingLocalPath(downloaded.localPath);
      if (downloadedLocalPath) {
        return downloadedLocalPath;
      }
    } catch {
      return null;
    }

    return null;
  }

  private hasAccessibleLocalFile(localPath: string | null | undefined) {
    return !!localPath && pathExists(localPath);
  }

  private inferStickerSetThumbnailExtension(stickerSet: TelegramRemoteStickerSet) {
    const thumbnailFileExtension = path.extname(
      stickerSet.thumbnailFile?.localPath ?? "",
    );
    if (thumbnailFileExtension) {
      return thumbnailFileExtension;
    }

    if (
      stickerSet.format === "video" &&
      (stickerSet.thumbnailFile || stickerSet.thumbnailStickerId)
    ) {
      return ".webm";
    }

    return null;
  }
}
