import type { StickerItem, StickerPackDetails } from "@sticker-smith/shared";
import { describeUnsupportedStickerSet } from "../telegramAuthService";
import { supportsTelegramMirrorEditing } from "../telegramMirrorSupport";
import type { TelegramRemoteStickerSet } from "../telegramTdlibService";
import type { ActiveDownloadMap, TelegramSyncServiceOptions } from "./types";
import {
  hasAccessibleLocalFile,
  hasRemoteThumbnail,
  inferStickerSetThumbnailExtension,
  resolveStickerSetThumbnailPath,
} from "./thumbnailUtils";

export class TelegramPackMediaDownloader {
  private readonly activePackDownloads = new Map<string, Promise<void>>();

  constructor(
    private readonly options: TelegramSyncServiceOptions,
    private readonly activeDownloads: ActiveDownloadMap,
    private readonly getRemoteStickerSetOrThrow: (
      stickerSetId: string,
    ) => Promise<TelegramRemoteStickerSet>,
  ) {}

  async downloadPackMedia(input: { packId: string; force?: boolean }) {
    const existingDownload = this.activePackDownloads.get(input.packId);
    if (existingDownload) return existingDownload;

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

  private async downloadPackMediaInternal(input: {
    packId: string;
    force?: boolean;
  }) {
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
    if (!stickerSetId)
      throw new Error(`Pack ${details.pack.id} is not a Telegram mirror.`);
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
      !(await hasAccessibleLocalFile(details.pack.thumbnailPath));
    if (!shouldBackfill) return;

    const thumbnailPath = await resolveStickerSetThumbnailPath(
      this.options,
      remoteSet,
      {
        allowDownload: true,
      },
    );
    const hasThumbnail = hasRemoteThumbnail(remoteSet);
    if (!thumbnailPath && !hasThumbnail) return;

    await this.options.libraryService.syncTelegramThumbnail({
      packId: details.pack.id,
      thumbnailPath,
      hasThumbnail,
      thumbnailExtension: inferStickerSetThumbnailExtension(remoteSet),
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
      if (!asset.telegram || (!input.force && asset.downloadState === "ready"))
        continue;
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
      await this.options.mirrorService.markStickerFailed(
        input.packId,
        input.asset.id,
      );
      return;
    }

    this.activeDownloads.set(input.remoteSticker.numericFileId, {
      packId: input.packId,
      stickerId: input.asset.id,
      stickerSetId: input.stickerSetId,
    });

    try {
      await this.options.mirrorService.markStickerQueued(
        input.packId,
        input.asset.id,
      );
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
      await this.options.mirrorService.markStickerFailed(
        input.packId,
        input.asset.id,
      );
    } finally {
      this.activeDownloads.delete(input.remoteSticker.numericFileId);
    }
  }
}
