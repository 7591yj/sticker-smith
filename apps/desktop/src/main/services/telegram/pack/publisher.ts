import type { PublishLocalPackInput, StickerPackDetails } from "@sticker-smith/shared";

import { describeTdlibError } from "../auth/service";
import type { TelegramPackMutationServiceOptions } from "./mutationTypes";
import {
  assertStickerHasEmojis,
  ensureStickerFileExists,
  getIconSticker,
  getStickerStickers,
  validateTelegramPackStickers,
} from "./mutationUtils";
import { findSticker } from "../../../utils/stickerQueries";

export class TelegramPackPublisher {
  constructor(private readonly options: TelegramPackMutationServiceOptions) {}

  async publishLocalPack(input: PublishLocalPackInput) {
    const details = await this.preflightPublishPack(input);
    let createdStickerSetId: string | null = null;
    this.emitPublishStarted(input.packId);

    try {
      createdStickerSetId = await this.createTelegramStickerSet(input, details);
      await this.publishTelegramPackIcon(input.shortName, details);
      this.emitPublishFinished(input.packId, input.packId, createdStickerSetId);
    } catch (error) {
      await this.handlePublishFailure({
        error,
        localPackId: input.packId,
        stickerSetId: createdStickerSetId,
      });
    }
  }

  private emitPublishStarted(localPackId: string) {
    this.options.emit({ type: "publish_started", localPackId });
  }

  private emitPublishFinished(
    localPackId: string,
    packId: string,
    stickerSetId: string,
  ) {
    this.options.emit({
      type: "publish_finished",
      localPackId,
      packId,
      stickerSetId,
    });
  }

  private async createTelegramStickerSet(
    input: PublishLocalPackInput,
    details: StickerPackDetails,
  ) {
    await this.options.auth.tdlibService.checkStickerSetName(input.shortName);
    return this.options.auth.tdlibService.createNewStickerSet({
      title: input.title,
      shortName: input.shortName,
      stickers: this.buildTelegramUploadStickers(details),
    });
  }

  private buildTelegramUploadStickers(details: StickerPackDetails) {
    return getStickerStickers(details).map((sticker) => {
      const output = findSticker(details.stickers, sticker.id);
      if (!output) {
        throw new Error(`Sticker file for ${sticker.relativePath} is missing.`);
      }

      return {
        stickerPath: output.absolutePath,
        emojis: sticker.emojiList,
        format: "video" as const,
      };
    });
  }

  private async publishTelegramPackIcon(
    shortName: string,
    details: StickerPackDetails,
  ) {
    const iconSticker = getIconSticker(details);
    if (!iconSticker) {
      return;
    }

    await ensureStickerFileExists(
      iconSticker.absolutePath,
      `Icon file for ${details.pack.name}`,
    );
    await this.options.auth.tdlibService.setStickerSetThumbnail({
      shortName,
      thumbnailPath: iconSticker.absolutePath,
      format: "video",
    });
  }

  private async preflightPublishPack(input: PublishLocalPackInput) {
    const details = await this.options.libraryService.getPack(input.packId);
    const stickerStickers = getStickerStickers(details);

    if (details.pack.source !== "local") {
      throw new Error("Only local packs can be uploaded to Telegram.");
    }
    if (stickerStickers.length === 0) {
      throw new Error("The pack needs at least one sticker before upload.");
    }

    await validateTelegramPackStickers(details, {
      operation: "upload",
      requireIconSticker: true,
    });

    for (const sticker of stickerStickers) {
      const output = findSticker(details.stickers, sticker.id);
      if (!output) {
        throw new Error(
          `Sticker file for ${sticker.relativePath} is missing. Add the sticker again before Telegram upload.`,
        );
      }
      await ensureStickerFileExists(
        output.absolutePath,
        `Sticker file for ${sticker.relativePath}`,
      );
      assertStickerHasEmojis(sticker, "upload");
    }

    return details;
  }

  private async handlePublishFailure(input: {
    error: unknown;
    localPackId: string;
    stickerSetId: string | null;
  }) {
    const errorMessage = describeTdlibError(input.error);
    const recoveredPackId = input.stickerSetId
      ? await this.recoverPublishedMirrorAfterFailure({
          localPackId: input.localPackId,
          stickerSetId: input.stickerSetId,
          errorMessage,
        })
      : null;

    if (recoveredPackId && input.stickerSetId) {
      this.emitPublishFinished(
        input.localPackId,
        recoveredPackId,
        input.stickerSetId,
      );
      return;
    }

    this.options.emit({
      type: "publish_failed",
      localPackId: input.localPackId,
      error: errorMessage,
    });
    throw input.error;
  }

  private async recoverPublishedMirrorAfterFailure(input: {
    localPackId: string;
    stickerSetId: string;
    errorMessage: string;
  }) {
    try {
      await this.options.syncService.syncOwnedPacks();
    } catch {}

    const mirror = await this.options.libraryService.findPackByTelegramStickerSetId(
      input.stickerSetId,
    );
    if (!mirror) {
      return null;
    }

    await this.options.libraryService.updateTelegramMirrorMetadata({
      packId: mirror.record.id,
      publishedFromLocalPackId: input.localPackId,
      syncState: "error",
      lastSyncError: input.errorMessage,
    });

    return mirror.record.id;
  }
}
