import type {
  PublishLocalPackInput,
  StickerPackDetails,
  TelegramEvent,
  UpdateTelegramPackInput,
} from "@sticker-smith/shared";

import type { LibraryService } from "./libraryService";
import type { TelegramAuthService } from "./telegramAuthService";
import { describeTdlibError, describeUnsupportedStickerSet } from "./telegramAuthService";
import type { TelegramMirrorService } from "./telegramMirrorService";
import { supportsTelegramMirrorEditing } from "./telegramMirrorSupport";
import type {
  TelegramRemoteSticker,
  TelegramRemoteStickerSet,
} from "./telegramTdlibService";
import type { TelegramSyncService } from "./telegramSyncService";
import { collectTelegramStickerSignatures } from "./telegramStickerSignatures";
import { findSticker } from "../utils/stickerQueries";
import { pathExists } from "../utils/fsUtils";

interface TelegramPackMutationServiceOptions {
  auth: TelegramAuthService;
  syncService: TelegramSyncService;
  libraryService: LibraryService;
  mirrorService: TelegramMirrorService;
  emit: (event: TelegramEvent) => void;
}

export class TelegramPackMutationService {
  constructor(private readonly options: TelegramPackMutationServiceOptions) {}

  async publishLocalPack(input: PublishLocalPackInput) {
    await this.options.auth.requireConnectedState();
    const details = await this.preflightPublishPack(input);
    let createdStickerSetId: string | null = null;
    this.options.emit({
      type: "publish_started",
      localPackId: input.packId,
    });

    try {
      await this.options.auth.tdlibService.checkStickerSetName(input.shortName);
      createdStickerSetId =
        await this.options.auth.tdlibService.createNewStickerSet({
          title: input.title,
          shortName: input.shortName,
          stickers: this.getStickerStickers(details).map((sticker) => {
            const output = findSticker(details.stickers, sticker.id);
            if (!output) {
              throw new Error(`Sticker file for ${sticker.relativePath} is missing.`);
            }

            return {
              stickerPath: output.absolutePath,
              emojis: sticker.emojiList,
              format: "video" as const,
            };
          }),
        });

      const iconSticker = this.getIconSticker(details);
      if (iconSticker) {
        await this.ensureStickerFileExists(
          iconSticker.absolutePath,
          `Icon file for ${details.pack.name}`,
        );
        await this.options.auth.tdlibService.setStickerSetThumbnail({
          shortName: input.shortName,
          thumbnailPath: iconSticker.absolutePath,
          format: "video",
        });
      }

      this.options.emit({
        type: "publish_finished",
        localPackId: input.packId,
        packId: input.packId,
        stickerSetId: createdStickerSetId,
      });
      return;
    } catch (error) {
      const errorMessage = describeTdlibError(error);
      if (createdStickerSetId) {
        const recoveredPackId = await this.recoverPublishedMirrorAfterFailure({
          localPackId: input.packId,
          stickerSetId: createdStickerSetId,
          errorMessage,
        });
        if (recoveredPackId) {
          this.options.emit({
            type: "publish_finished",
            localPackId: input.packId,
            packId: recoveredPackId,
            stickerSetId: createdStickerSetId,
          });
          return;
        }
      }

      this.options.emit({
        type: "publish_failed",
        localPackId: input.packId,
        error: errorMessage,
      });
      throw error;
    }
  }

  async updateTelegramPack(input: UpdateTelegramPackInput) {
    await this.options.auth.requireConnectedState();
    const details = await this.options.libraryService.getPack(input.packId);
    const telegram = details.pack.telegram;
    const stickerStickers = this.getStickerStickers(details);
    if (details.pack.source !== "telegram" || !telegram) {
      throw new Error(`Pack ${input.packId} is not a Telegram mirror.`);
    }
    if (!supportsTelegramMirrorEditing(telegram.format)) {
      throw new Error(describeUnsupportedStickerSet(telegram));
    }

    this.options.emit({
      type: "update_started",
      packId: input.packId,
      stickerSetId: telegram.stickerSetId,
    });
    await this.options.mirrorService.markPackSyncState(input.packId, "syncing", null);

    try {
      if (stickerStickers.length === 0) {
        throw new Error(
          "Telegram mirrors must keep at least one sticker. Deleting the entire remote sticker set is not supported by Update.",
        );
      }

      await this.validateTelegramPackStickers(details, {
        operation: "update",
        requireIconSticker: false,
      });

      const remoteSet = await this.options.syncService.getRemoteStickerSetOrThrow(
        telegram.stickerSetId,
      );
      const telegramShortName = await this.resolveTelegramMirrorShortName({
        packId: input.packId,
        telegram,
        remoteSet,
      });
      const remoteByStickerId = new Map(
        remoteSet.stickers.map((sticker) => [sticker.stickerId, sticker]),
      );
      const duplicateLocalStickerStickerIds =
        this.getDuplicateLocalStickerStickerIds(details);
      const localByStickerId = new Map(
        details.stickers
          .filter((sticker) => sticker.telegram)
          .map((sticker) => [sticker.telegram!.stickerId, sticker]),
      );

      await this.syncTelegramMirrorTitle({
        details,
        remoteSet,
        telegramShortName,
      });
      await this.reorderExistingRemoteStickerStickers(remoteSet, stickerStickers);
      const remotelyAddedStickerIds = await this.applyTelegramStickerStickerChanges({
        details,
        stickerStickers,
        telegramShortName,
        remoteByStickerId,
        duplicateLocalStickerStickerIds,
      });
      await this.removeDeletedRemoteStickers({
        telegram,
        remoteSet,
        localByStickerId,
      });
      await this.syncTelegramMirrorThumbnail({
        details,
        telegramShortName,
      });
      await this.resyncUpdatedTelegramMirror({
        stickerSetId: telegram.stickerSetId,
        stickerStickers,
        remotelyAddedStickerIds,
      });
      await this.options.mirrorService.markPackSyncState(input.packId, "idle", null);
      this.options.emit({
        type: "update_finished",
        packId: input.packId,
        stickerSetId: telegram.stickerSetId,
      });
    } catch (error) {
      const errorMessage = describeTdlibError(error);
      await this.recoverMirrorAfterFailedUpdate({
        packId: input.packId,
        stickerSetId: telegram.stickerSetId,
        errorMessage,
      });
      this.options.emit({
        type: "update_failed",
        packId: input.packId,
        stickerSetId: telegram.stickerSetId,
        error: errorMessage,
      });
      throw error;
    }
  }

  private getStickerStickers(details: StickerPackDetails) {
    return details.stickers
      .filter((sticker) => {
        if (sticker.id === details.pack.iconStickerId) {
          return false;
        }

        if (sticker.telegram) {
          return true;
        }

        return (
          sticker.emojiList.length > 0 ||
          findSticker(details.stickers, sticker.id) !== undefined
        );
      })
      .sort(
        (left, right) => left.order - right.order || left.id.localeCompare(right.id),
      );
  }

  private getIconSticker(details: StickerPackDetails) {
    return details.pack.iconStickerId
      ? findSticker(details.stickers, details.pack.iconStickerId) ?? null
      : null;
  }

  private async moveRemoteStickerToPosition(
    remoteStickers: TelegramRemoteSticker[],
    stickerId: string,
    targetIndex: number,
  ) {
    const currentIndex = remoteStickers.findIndex(
      (sticker) => sticker.stickerId === stickerId,
    );
    if (currentIndex === -1 || currentIndex === targetIndex) {
      return;
    }

    const movedSticker = remoteStickers[currentIndex];
    if (!movedSticker?.fileId) {
      throw new Error(
        `Telegram sticker ${stickerId} cannot be reordered because its remote file id is missing.`,
      );
    }

    await this.options.auth.tdlibService.setStickerPositionInSet({
      fileId: movedSticker.fileId,
      position: targetIndex,
    });

    remoteStickers.splice(currentIndex, 1);
    remoteStickers.splice(targetIndex, 0, movedSticker);
  }

  private async reorderExistingRemoteStickerStickers(
    remoteSet: TelegramRemoteStickerSet,
    stickerStickers: ReturnType<TelegramPackMutationService["getStickerStickers"]>,
  ) {
    const remoteStickers = remoteSet.stickers.slice();
    const desiredRemoteStickerIds = stickerStickers
      .filter((sticker) => sticker.telegram)
      .map((sticker) => sticker.telegram!.stickerId);

    let nextPosition = 0;
    for (const stickerId of desiredRemoteStickerIds) {
      const currentIndex = remoteStickers.findIndex(
        (sticker) => sticker.stickerId === stickerId,
      );
      if (currentIndex === -1) {
        continue;
      }

      await this.moveRemoteStickerToPosition(
        remoteStickers,
        stickerId,
        nextPosition,
      );
      nextPosition += 1;
    }
  }

  private async reorderAddedRemoteStickerStickers(
    remoteSet: TelegramRemoteStickerSet,
    stickerStickers: ReturnType<TelegramPackMutationService["getStickerStickers"]>,
    addedStickerIds: ReadonlySet<string>,
  ) {
    const addedStickers = stickerStickers.filter((sticker) => addedStickerIds.has(sticker.id));
    if (addedStickers.length === 0) {
      return;
    }

    const refreshedRemoteStickers = remoteSet.stickers.slice();
    const existingRemoteStickerIds = new Set(
      stickerStickers
        .filter((sticker) => sticker.telegram)
        .map((sticker) => sticker.telegram!.stickerId),
    );
    const unmatchedRemoteStickers = refreshedRemoteStickers.filter(
      (sticker) => !existingRemoteStickerIds.has(sticker.stickerId),
    );
    const addedRemoteStickers = unmatchedRemoteStickers.slice(-addedStickers.length);

    if (addedRemoteStickers.length < addedStickers.length) {
      return;
    }

    const addedStickerByStickerId = new Map(
      addedStickers.map((sticker, index) => [sticker.id, addedRemoteStickers[index]!]),
    );

    for (const [targetIndex, sticker] of stickerStickers.entries()) {
      const addedRemoteSticker = addedStickerByStickerId.get(sticker.id);
      if (!addedRemoteSticker) {
        continue;
      }

      await this.moveRemoteStickerToPosition(
        refreshedRemoteStickers,
        addedRemoteSticker.stickerId,
        targetIndex,
      );
    }
  }

  private getDuplicateLocalStickerStickerIds(details: StickerPackDetails) {
    const remoteSignatures = new Set<string>();
    const duplicateStickerIds = new Set<string>();

    for (const sticker of this.getStickerStickers(details)) {
      if (!sticker.telegram) {
        continue;
      }

      const output = findSticker(details.stickers, sticker.id);
      for (const signature of collectTelegramStickerSignatures({
        emojis: sticker.emojiList,
        sha256Values: [
          sticker.telegram.baselineStickerHash ?? null,
          output?.sha256 ?? null,
        ],
      })) {
        if (signature) {
          remoteSignatures.add(signature);
        }
      }
    }

    for (const sticker of this.getStickerStickers(details)) {
      if (sticker.telegram) {
        continue;
      }

      const output = findSticker(details.stickers, sticker.id);
      const signatures = collectTelegramStickerSignatures({
        emojis: sticker.emojiList,
        sha256Values: [output?.sha256 ?? null],
      });
      if (!signatures.some((signature) => remoteSignatures.has(signature))) {
        continue;
      }

      duplicateStickerIds.add(sticker.id);
    }

    return duplicateStickerIds;
  }

  private async validateTelegramPackStickers(
    details: StickerPackDetails,
    options: { operation: "upload" | "update"; requireIconSticker: boolean },
  ) {
    const stickerStickers = this.getStickerStickers(details);
    const mismatchMessage = `Pack stickers are out of sync. Refresh the pack or add the missing stickers again before Telegram ${options.operation}.`;

    for (const sticker of stickerStickers) {
      const matchingSticker = findSticker(details.stickers, sticker.id);
      if (!matchingSticker) {
        if (options.operation === "upload") {
          throw new Error(
            `Sticker file for ${sticker.relativePath} is missing. Add the sticker again before Telegram upload.`,
          );
        }

        throw new Error(
          `Sticker file for ${sticker.relativePath} is missing. Add the sticker again before Telegram update.`,
        );
      }
    }

    const iconSticker = this.getIconSticker(details);
    if (iconSticker) {
      if (details.pack.iconStickerId === null || iconSticker.id !== details.pack.iconStickerId) {
        throw new Error(mismatchMessage);
      }
    } else if (options.requireIconSticker && details.pack.iconStickerId !== null) {
      throw new Error(
        `The selected icon file is missing. Choose the icon again before Telegram ${options.operation}.`,
      );
    }
  }

  private async ensureStickerFileExists(absolutePath: string, description: string) {
    if (!(await pathExists(absolutePath))) {
      throw new Error(`${description} is missing at ${absolutePath}.`);
    }
  }

  private assertStickerHasEmojis(
    sticker: { emojiList: readonly string[]; relativePath: string },
    context: string,
  ) {
    if (sticker.emojiList.length === 0) {
      throw new Error(
        `Every sticker must have at least one emoji before ${context}. Missing emoji for ${sticker.relativePath}.`,
      );
    }
  }

  private async preflightPublishPack(input: PublishLocalPackInput) {
    const details = await this.options.libraryService.getPack(input.packId);
    const stickerStickers = this.getStickerStickers(details);

    if (details.pack.source !== "local") {
      throw new Error("Only local packs can be uploaded to Telegram.");
    }
    if (stickerStickers.length === 0) {
      throw new Error("The pack needs at least one sticker before upload.");
    }

    await this.validateTelegramPackStickers(details, {
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
      await this.ensureStickerFileExists(
        output.absolutePath,
        `Sticker file for ${sticker.relativePath}`,
      );
      this.assertStickerHasEmojis(sticker, "upload");
    }

    return details;
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

  private async recoverMirrorAfterFailedUpdate(input: {
    packId: string;
    stickerSetId: string;
    errorMessage: string;
  }) {
    try {
      await this.options.syncService.syncOwnedPacks();
    } catch {}

    const mirror =
      (await this.options.libraryService.findPackByTelegramStickerSetId(
        input.stickerSetId,
      ))?.record.id ?? input.packId;

    try {
      await this.options.libraryService.updateTelegramMirrorMetadata({
        packId: mirror,
        syncState: "error",
        lastSyncError: input.errorMessage,
      });
    } catch {}
  }

  private async resolveTelegramMirrorShortName(input: {
    packId: string;
    telegram: NonNullable<StickerPackDetails["pack"]["telegram"]>;
    remoteSet: TelegramRemoteStickerSet;
  }) {
    const telegramShortName = input.telegram.shortName || input.remoteSet.shortName;
    if (!telegramShortName) {
      throw new Error(
        "Telegram mirror short name is missing. Resync the pack and try again.",
      );
    }

    if (input.telegram.shortName !== telegramShortName) {
      await this.options.libraryService.updateTelegramMirrorMetadata({
        packId: input.packId,
        shortName: telegramShortName,
      });
    }

    return telegramShortName;
  }

  private async syncTelegramMirrorTitle(input: {
    details: StickerPackDetails;
    remoteSet: TelegramRemoteStickerSet;
    telegramShortName: string;
  }) {
    if (input.details.pack.name === input.remoteSet.title) {
      return;
    }

    await this.options.auth.tdlibService.setStickerSetTitle({
      shortName: input.telegramShortName,
      title: input.details.pack.name,
    });
  }

  private async applyTelegramStickerStickerChanges(input: {
    details: StickerPackDetails;
    stickerStickers: ReturnType<TelegramPackMutationService["getStickerStickers"]>;
    telegramShortName: string;
    remoteByStickerId: ReadonlyMap<string, TelegramRemoteSticker>;
    duplicateLocalStickerStickerIds: ReadonlySet<string>;
  }) {
    const remotelyAddedStickerIds = new Set<string>();

    for (const sticker of input.stickerStickers) {
      const output = findSticker(input.details.stickers, sticker.id);
      this.assertStickerHasEmojis(sticker, "update");

      if (!sticker.telegram) {
        if (input.duplicateLocalStickerStickerIds.has(sticker.id)) {
          continue;
        }

        if (!output) {
          throw new Error(
            `Sticker file for ${sticker.relativePath} is missing. Add the sticker again before Telegram update.`,
          );
        }
        await this.ensureStickerFileExists(
          output.absolutePath,
          `Sticker file for ${sticker.relativePath}`,
        );

        await this.options.auth.tdlibService.addStickerToSet({
          shortName: input.telegramShortName,
          stickerPath: output.absolutePath,
          emojis: sticker.emojiList,
        });
        remotelyAddedStickerIds.add(sticker.id);
        continue;
      }

      const remoteSticker = input.remoteByStickerId.get(sticker.telegram.stickerId);
      if (!remoteSticker) {
        continue;
      }

      const remoteFileId = sticker.telegram.fileId ?? remoteSticker.fileId;
      if (output) {
        await this.ensureStickerFileExists(
          output.absolutePath,
          `Sticker file for ${sticker.relativePath}`,
        );
      }

      if (
        output &&
        output.sha256 !== sticker.telegram.baselineStickerHash &&
        remoteFileId
      ) {
        await this.options.auth.tdlibService.replaceStickerInSet({
          shortName: input.telegramShortName,
          oldFileId: remoteFileId,
          newStickerPath: output.absolutePath,
          emojis: sticker.emojiList,
        });
        continue;
      }

      const remoteEmojis = remoteSticker.emojiList.join(" ");
      const localEmojis = sticker.emojiList.join(" ");
      if (localEmojis !== remoteEmojis && remoteFileId) {
        await this.options.auth.tdlibService.setStickerEmojis({
          stickerSetId: input.details.pack.telegram!.stickerSetId,
          fileId: remoteFileId,
          emojis: sticker.emojiList,
        });
      }
    }

    return remotelyAddedStickerIds;
  }

  private async removeDeletedRemoteStickers(input: {
    telegram: NonNullable<StickerPackDetails["pack"]["telegram"]>;
    remoteSet: TelegramRemoteStickerSet;
    localByStickerId: ReadonlyMap<string, StickerPackDetails["stickers"][number]>;
  }) {
    for (const remoteSticker of input.remoteSet.stickers) {
      if (input.localByStickerId.has(remoteSticker.stickerId) || !remoteSticker.fileId) {
        continue;
      }

      await this.options.auth.tdlibService.removeStickerFromSet({
        stickerSetId: input.telegram.stickerSetId,
        fileId: remoteSticker.fileId,
      });
    }
  }

  private async syncTelegramMirrorThumbnail(input: {
    details: StickerPackDetails;
    telegramShortName: string;
  }) {
    const iconSticker = this.getIconSticker(input.details);
    if (iconSticker) {
      await this.ensureStickerFileExists(
        iconSticker.absolutePath,
        `Icon file for ${input.details.pack.name}`,
      );
      await this.options.auth.tdlibService.setStickerSetThumbnail({
        shortName: input.telegramShortName,
        thumbnailPath: iconSticker.absolutePath,
        format: "video",
      });
      return;
    }

    if (
      input.details.pack.iconStickerId === null &&
      input.details.pack.telegram?.thumbnailPath === null
    ) {
      await this.options.auth.tdlibService.setStickerSetThumbnail({
        shortName: input.telegramShortName,
        thumbnailPath: null,
        format: null,
      });
    }
  }

  private async resyncUpdatedTelegramMirror(input: {
    stickerSetId: string;
    stickerStickers: ReturnType<TelegramPackMutationService["getStickerStickers"]>;
    remotelyAddedStickerIds: ReadonlySet<string>;
  }) {
    const refreshedRemoteSet =
      await this.options.syncService.getRemoteStickerSetOrThrow(input.stickerSetId);
    await this.reorderAddedRemoteStickerStickers(
      refreshedRemoteSet,
      input.stickerStickers,
      input.remotelyAddedStickerIds,
    );

    const reorderedRemoteSet =
      await this.options.syncService.getRemoteStickerSetOrThrow(input.stickerSetId);
    await this.options.syncService.syncRemoteStickerSet(reorderedRemoteSet);
  }
}
