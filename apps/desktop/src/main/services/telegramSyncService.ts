import path from "node:path";

import type {
  StickerItem,
  StickerPackDetails,
  TelegramEvent,
} from "@sticker-smith/shared";

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
    { packId: string; stickerId: string; stickerSetId: string }
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
    if (this.activeOwnedPackSync) {
      return this.activeOwnedPackSync;
    }

    const syncPromise = this.runOwnedPackSync();
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

    const downloadPromise = this.downloadPackMediaInternal(input);
    this.activePackDownloads.set(input.packId, downloadPromise);

    try {
      await downloadPromise;
    } finally {
      if (this.activePackDownloads.get(input.packId) === downloadPromise) {
        this.activePackDownloads.delete(input.packId);
      }
    }
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
      existingThumbnailPath: existingMirror?.record.telegram?.thumbnailPath ?? null,
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
    const thumbnailPath = await this.resolveStickerSetThumbnailPath(stickerSet, {
      allowDownload: !(await this.hasAccessibleLocalFile(context.existingThumbnailPath)),
    });
    const details = await this.options.mirrorService.upsertStickerSet({
      stickerSet,
      thumbnailPath,
      hasThumbnail: this.hasRemoteThumbnail(stickerSet),
      thumbnailExtension: this.inferStickerSetThumbnailExtension(stickerSet),
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
    await this.options.mirrorService.markPackSyncState(details.record.id, "idle", null);
    this.emitPackSyncCompleted(details.record.id, stickerSet.stickerSetId);

    return details.record.id;
  }

  private async runOwnedPackSync(): Promise<void> {
    await this.options.auth.requireConnectedState();
    this.options.emit({ type: "sync_started" });

    const stickerSets = await this.options.auth.tdlibService.getOwnedStickerSets();
    const packIds = await this.syncOwnedStickerSets(stickerSets);
    await this.deleteUnownedTelegramPacks(
      new Set(stickerSets.map((set) => set.stickerSetId)),
    );

    this.options.emit({ type: "sync_finished", packIds });
  }

  private async syncOwnedStickerSets(stickerSets: TelegramRemoteStickerSet[]) {
    const packIds: string[] = [];

    for (const stickerSet of stickerSets) {
      try {
        packIds.push(await this.syncRemoteStickerSet(stickerSet));
      } catch (error) {
        await this.markOwnedPackSyncFailed(stickerSet, error);
      }
    }

    return packIds;
  }

  private async markOwnedPackSyncFailed(
    stickerSet: TelegramRemoteStickerSet,
    error: unknown,
  ) {
    const existing = await this.options.libraryService.findPackByTelegramStickerSetId(
      stickerSet.stickerSetId,
    );
    const message = describeTdlibError(error);

    if (existing) {
      await this.options.mirrorService.markPackSyncState(
        existing.record.id,
        "error",
        message,
      );
    }
    this.options.emit({
      type: "pack_sync_failed",
      packId: existing?.record.id ?? null,
      stickerSetId: stickerSet.stickerSetId,
      error: message,
    });
  }

  private async deleteUnownedTelegramPacks(stickerSetIds: Set<string>) {
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
  }

  private async downloadPackMediaInternal(input: { packId: string; force?: boolean }) {
    await this.options.auth.requireConnectedState();
    const details = await this.options.libraryService.getPack(input.packId);
    const stickerSetId = this.requireDownloadableStickerSetId(details);
    const remoteSet = await this.getRemoteStickerSetOrThrow(stickerSetId);

    await this.backfillTelegramThumbnail(details, remoteSet);
    await this.downloadStickerAssets({
      details,
      stickerSetId,
      remoteSet,
      force: input.force ?? false,
    });
  }

  private requireDownloadableStickerSetId(details: StickerPackDetails) {
    const stickerSetId = details.pack.telegram?.stickerSetId;
    if (!stickerSetId) {
      throw new Error(`Pack ${details.pack.id} is not a Telegram mirror.`);
    }
    if (
      details.pack.telegram &&
      !supportsTelegramMirrorEditing(details.pack.telegram.format)
    ) {
      throw new Error(describeUnsupportedStickerSet(details.pack.telegram));
    }
    return stickerSetId;
  }

  private async backfillTelegramThumbnail(
    details: StickerPackDetails,
    remoteSet: TelegramRemoteStickerSet,
  ) {
    const shouldBackfill =
      details.pack.iconStickerId === null &&
      !(await this.hasAccessibleLocalFile(details.pack.thumbnailPath));
    if (!shouldBackfill) {
      return;
    }

    const thumbnailPath = await this.resolveStickerSetThumbnailPath(remoteSet, {
      allowDownload: true,
    });
    const hasRemoteThumbnail = this.hasRemoteThumbnail(remoteSet);
    if (!thumbnailPath && !hasRemoteThumbnail) {
      return;
    }

    await this.options.libraryService.syncTelegramThumbnail({
      packId: details.pack.id,
      thumbnailPath,
      hasThumbnail: hasRemoteThumbnail,
      thumbnailExtension: this.inferStickerSetThumbnailExtension(remoteSet),
    });
  }

  private async downloadStickerAssets(input: {
    details: StickerPackDetails;
    stickerSetId: string;
    remoteSet: TelegramRemoteStickerSet;
    force: boolean;
  }) {
    const remoteByStickerId = new Map(
      input.remoteSet.stickers.map((sticker) => [sticker.stickerId, sticker]),
    );

    for (const asset of input.details.stickers) {
      if (!asset.telegram || (!input.force && asset.downloadState === "ready")) {
        continue;
      }
      await this.downloadStickerAsset({
        packId: input.details.pack.id,
        stickerSetId: input.stickerSetId,
        asset,
        remoteSticker: remoteByStickerId.get(asset.telegram.stickerId),
      });
    }
  }

  private async downloadStickerAsset(input: {
    packId: string;
    stickerSetId: string;
    asset: StickerItem;
    remoteSticker?: TelegramRemoteStickerSet["stickers"][number];
  }) {
    if (!input.remoteSticker || input.remoteSticker.numericFileId <= 0) {
      await this.options.mirrorService.markStickerFailed(input.packId, input.asset.id);
      return;
    }

    this.activeDownloads.set(input.remoteSticker.numericFileId, {
      packId: input.packId,
      stickerId: input.asset.id,
      stickerSetId: input.stickerSetId,
    });

    try {
      await this.options.mirrorService.markStickerQueued(input.packId, input.asset.id);
      await this.options.mirrorService.markStickerDownloading(
        input.packId,
        input.asset.id,
      );
      const file = await this.options.auth.tdlibService.downloadFile(
        input.remoteSticker.numericFileId,
      );
      await this.options.mirrorService.storeDownloadedSticker({
        packId: input.packId,
        stickerId: input.asset.id,
        sticker: input.remoteSticker,
        file,
      });
    } catch {
      await this.options.mirrorService.markStickerFailed(input.packId, input.asset.id);
    } finally {
      this.activeDownloads.delete(input.remoteSticker.numericFileId);
    }
  }

  private async resolveStickerSetThumbnailPath(
    stickerSet: TelegramRemoteStickerSet,
    options: { allowDownload?: boolean } = {},
  ) {
    const thumbnailFilePath = await this.resolveThumbnailFilePath(
      stickerSet,
      options.allowDownload ?? false,
    );
    if (thumbnailFilePath) {
      return thumbnailFilePath;
    }

    return this.resolveThumbnailStickerPath(
      stickerSet,
      options.allowDownload ?? false,
    );
  }

  private async resolveThumbnailFilePath(
    stickerSet: TelegramRemoteStickerSet,
    allowDownload: boolean,
  ) {
    const thumbnailFile = stickerSet.thumbnailFile;
    if (!thumbnailFile || thumbnailFile.numericFileId <= 0) {
      return null;
    }

    const existingLocalPath = thumbnailFile.isDownloaded
      ? await this.resolveExistingLocalPath(thumbnailFile.localPath)
      : null;
    if (existingLocalPath || !allowDownload) {
      return existingLocalPath;
    }

    return this.downloadFileLocalPath(thumbnailFile.numericFileId);
  }

  private async resolveThumbnailStickerPath(
    stickerSet: TelegramRemoteStickerSet,
    allowDownload: boolean,
  ) {
    if (!stickerSet.thumbnailStickerId || !allowDownload) {
      return null;
    }

    const thumbnailSticker = stickerSet.stickers.find(
      (sticker) => sticker.stickerId === stickerSet.thumbnailStickerId,
    );
    if (!thumbnailSticker || thumbnailSticker.numericFileId <= 0) {
      return null;
    }

    return this.downloadFileLocalPath(thumbnailSticker.numericFileId);
  }

  private async downloadFileLocalPath(numericFileId: number) {
    try {
      const downloaded = await this.options.auth.tdlibService.downloadFile(
        numericFileId,
      );
      return this.resolveExistingLocalPath(downloaded.localPath);
    } catch {
      return null;
    }
  }

  private async resolveExistingLocalPath(localPath: string | null | undefined) {
    return localPath && (await pathExists(localPath)) ? localPath : null;
  }

  private hasRemoteThumbnail(stickerSet: TelegramRemoteStickerSet) {
    return (
      Boolean(stickerSet.thumbnailFile && stickerSet.thumbnailFile.numericFileId > 0) ||
      Boolean(stickerSet.thumbnailStickerId)
    );
  }

  private emitPackSyncCompleted(packId: string, stickerSetId: string) {
    this.options.emit({
      type: "pack_sync_completed",
      packId,
      stickerSetId,
    });
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
