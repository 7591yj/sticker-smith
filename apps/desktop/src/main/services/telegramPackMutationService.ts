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
import { collectTelegramAssetSignatures } from "./telegramAssetSignatures";
import { findStickerOutput } from "../utils/packQueries";
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
          stickers: this.getStickerAssets(details).map((asset) => {
            const output = findStickerOutput(details.outputs, asset.id);
            if (!output) {
              throw new Error(`Missing sticker output for ${asset.relativePath}.`);
            }

            return {
              stickerPath: output.absolutePath,
              emojis: asset.emojiList,
              format: "video" as const,
            };
          }),
        });

      const iconOutput = details.outputs.find((output) => output.mode === "icon");
      if (iconOutput) {
        await this.ensureOutputFileExists(
          iconOutput.absolutePath,
          `Icon output for ${details.pack.name}`,
        );
        await this.options.auth.tdlibService.setStickerSetThumbnail({
          shortName: input.shortName,
          thumbnailPath: iconOutput.absolutePath,
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
    const stickerAssets = this.getStickerAssets(details);
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
      if (stickerAssets.length === 0) {
        throw new Error(
          "Telegram mirrors must keep at least one sticker. Deleting the entire remote sticker set is not supported by Update.",
        );
      }

      await this.validateTelegramPackOutputs(details, {
        operation: "update",
        requireIconOutput: false,
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
      const duplicateLocalStickerAssetIds =
        this.getDuplicateLocalStickerAssetIds(details);
      const localByStickerId = new Map(
        details.assets
          .filter((asset) => asset.telegram)
          .map((asset) => [asset.telegram!.stickerId, asset]),
      );

      await this.syncTelegramMirrorTitle({
        details,
        remoteSet,
        telegramShortName,
      });
      await this.reorderExistingRemoteStickerAssets(remoteSet, stickerAssets);
      const remotelyAddedAssetIds = await this.applyTelegramStickerAssetChanges({
        details,
        stickerAssets,
        telegramShortName,
        remoteByStickerId,
        duplicateLocalStickerAssetIds,
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
        stickerAssets,
        remotelyAddedAssetIds,
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

  private getStickerAssets(details: StickerPackDetails) {
    return details.assets
      .filter((asset) => {
        if (asset.id === details.pack.iconAssetId) {
          return false;
        }

        if (asset.telegram) {
          return true;
        }

        return (
          asset.emojiList.length > 0 ||
          findStickerOutput(details.outputs, asset.id) !== undefined
        );
      })
      .sort(
        (left, right) => left.order - right.order || left.id.localeCompare(right.id),
      );
  }

  private getStickerOutputs(details: StickerPackDetails) {
    return details.outputs
      .filter((output) => output.mode === "sticker")
      .sort(
        (left, right) =>
          left.order - right.order ||
          left.sourceAssetId.localeCompare(right.sourceAssetId),
      );
  }

  private getIconOutput(details: StickerPackDetails) {
    return details.outputs.find((output) => output.mode === "icon");
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

  private async reorderExistingRemoteStickerAssets(
    remoteSet: TelegramRemoteStickerSet,
    stickerAssets: ReturnType<TelegramPackMutationService["getStickerAssets"]>,
  ) {
    const remoteStickers = remoteSet.stickers.slice();
    const desiredRemoteStickerIds = stickerAssets
      .filter((asset) => asset.telegram)
      .map((asset) => asset.telegram!.stickerId);

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

  private async reorderAddedRemoteStickerAssets(
    remoteSet: TelegramRemoteStickerSet,
    stickerAssets: ReturnType<TelegramPackMutationService["getStickerAssets"]>,
    addedAssetIds: ReadonlySet<string>,
  ) {
    const addedAssets = stickerAssets.filter((asset) => addedAssetIds.has(asset.id));
    if (addedAssets.length === 0) {
      return;
    }

    const refreshedRemoteStickers = remoteSet.stickers.slice();
    const existingRemoteStickerIds = new Set(
      stickerAssets
        .filter((asset) => asset.telegram)
        .map((asset) => asset.telegram!.stickerId),
    );
    const unmatchedRemoteStickers = refreshedRemoteStickers.filter(
      (sticker) => !existingRemoteStickerIds.has(sticker.stickerId),
    );
    const addedRemoteStickers = unmatchedRemoteStickers.slice(-addedAssets.length);

    if (addedRemoteStickers.length < addedAssets.length) {
      return;
    }

    const addedStickerByAssetId = new Map(
      addedAssets.map((asset, index) => [asset.id, addedRemoteStickers[index]!]),
    );

    for (const [targetIndex, asset] of stickerAssets.entries()) {
      const addedRemoteSticker = addedStickerByAssetId.get(asset.id);
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

  private getDuplicateLocalStickerAssetIds(details: StickerPackDetails) {
    const remoteSignatures = new Set<string>();
    const duplicateAssetIds = new Set<string>();

    for (const asset of this.getStickerAssets(details)) {
      if (!asset.telegram) {
        continue;
      }

      const output = findStickerOutput(details.outputs, asset.id);
      for (const signature of collectTelegramAssetSignatures({
        emojis: asset.emojiList,
        sha256Values: [
          asset.telegram.baselineOutputHash ?? null,
          output?.sha256 ?? null,
        ],
      })) {
        if (signature) {
          remoteSignatures.add(signature);
        }
      }
    }

    for (const asset of this.getStickerAssets(details)) {
      if (asset.telegram) {
        continue;
      }

      const output = findStickerOutput(details.outputs, asset.id);
      const signatures = collectTelegramAssetSignatures({
        emojis: asset.emojiList,
        sha256Values: [output?.sha256 ?? null],
      });
      if (!signatures.some((signature) => remoteSignatures.has(signature))) {
        continue;
      }

      duplicateAssetIds.add(asset.id);
    }

    return duplicateAssetIds;
  }

  private async validateTelegramPackOutputs(
    details: StickerPackDetails,
    options: { operation: "upload" | "update"; requireIconOutput: boolean },
  ) {
    const stickerAssets = this.getStickerAssets(details);
    const stickerAssetIds = new Set(stickerAssets.map((asset) => asset.id));
    const stickerOutputs = this.getStickerOutputs(details);
    const mismatchMessage = `Pack outputs do not match the current assets. Run Convert before Telegram ${options.operation}.`;

    if (stickerOutputs.some((output) => !stickerAssetIds.has(output.sourceAssetId))) {
      throw new Error(mismatchMessage);
    }

    for (const asset of stickerAssets) {
      const matchingOutputs = stickerOutputs.filter(
        (output) => output.sourceAssetId === asset.id,
      );
      if (matchingOutputs.length === 0) {
        if (options.operation === "upload") {
          throw new Error(
            `Every sticker asset must have a current sticker output before upload. Missing output for ${asset.relativePath}.`,
          );
        }

        throw new Error(
          `Sticker output for ${asset.relativePath} is missing. Run Convert before Telegram update.`,
        );
      }
      if (matchingOutputs.length > 1) {
        throw new Error(mismatchMessage);
      }
    }

    const iconOutput = this.getIconOutput(details);
    if (iconOutput) {
      if (
        details.pack.iconAssetId === null ||
        iconOutput.sourceAssetId !== details.pack.iconAssetId
      ) {
        throw new Error(mismatchMessage);
      }
    } else if (options.requireIconOutput && details.pack.iconAssetId !== null) {
      throw new Error(
        `The selected icon asset must have a current icon output before Telegram ${options.operation}.`,
      );
    }
  }

  private async ensureOutputFileExists(absolutePath: string, description: string) {
    if (!(await pathExists(absolutePath))) {
      throw new Error(`${description} is missing at ${absolutePath}.`);
    }
  }

  private assertAssetHasEmojis(
    asset: { emojiList: readonly string[]; relativePath: string },
    context: string,
  ) {
    if (asset.emojiList.length === 0) {
      throw new Error(
        `Every sticker asset must have at least one emoji before ${context}. Missing emoji for ${asset.relativePath}.`,
      );
    }
  }

  private async preflightPublishPack(input: PublishLocalPackInput) {
    const details = await this.options.libraryService.getPack(input.packId);
    const stickerAssets = this.getStickerAssets(details);

    if (details.pack.source !== "local") {
      throw new Error("Only local packs can be uploaded to Telegram.");
    }
    if (stickerAssets.length === 0) {
      throw new Error("The pack needs at least one sticker asset before upload.");
    }

    await this.validateTelegramPackOutputs(details, {
      operation: "upload",
      requireIconOutput: true,
    });

    for (const asset of stickerAssets) {
      const output = findStickerOutput(details.outputs, asset.id);
      if (!output) {
        throw new Error(
          `Every sticker asset must have a current sticker output before upload. Missing output for ${asset.relativePath}.`,
        );
      }
      await this.ensureOutputFileExists(
        output.absolutePath,
        `Sticker output for ${asset.relativePath}`,
      );
      this.assertAssetHasEmojis(asset, "upload");
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

  private async applyTelegramStickerAssetChanges(input: {
    details: StickerPackDetails;
    stickerAssets: ReturnType<TelegramPackMutationService["getStickerAssets"]>;
    telegramShortName: string;
    remoteByStickerId: ReadonlyMap<string, TelegramRemoteSticker>;
    duplicateLocalStickerAssetIds: ReadonlySet<string>;
  }) {
    const remotelyAddedAssetIds = new Set<string>();

    for (const asset of input.stickerAssets) {
      const output = findStickerOutput(input.details.outputs, asset.id);
      this.assertAssetHasEmojis(asset, "update");

      if (!asset.telegram) {
        if (input.duplicateLocalStickerAssetIds.has(asset.id)) {
          continue;
        }

        if (!output) {
          throw new Error(
            `Added Telegram mirror asset ${asset.relativePath} is missing a sticker output.`,
          );
        }
        await this.ensureOutputFileExists(
          output.absolutePath,
          `Sticker output for ${asset.relativePath}`,
        );

        await this.options.auth.tdlibService.addStickerToSet({
          shortName: input.telegramShortName,
          stickerPath: output.absolutePath,
          emojis: asset.emojiList,
        });
        remotelyAddedAssetIds.add(asset.id);
        continue;
      }

      const remoteSticker = input.remoteByStickerId.get(asset.telegram.stickerId);
      if (!remoteSticker) {
        continue;
      }

      const remoteFileId = asset.telegram.fileId ?? remoteSticker.fileId;
      if (output) {
        await this.ensureOutputFileExists(
          output.absolutePath,
          `Sticker output for ${asset.relativePath}`,
        );
      }

      if (
        output &&
        output.sha256 !== asset.telegram.baselineOutputHash &&
        remoteFileId
      ) {
        await this.options.auth.tdlibService.replaceStickerInSet({
          shortName: input.telegramShortName,
          oldFileId: remoteFileId,
          newStickerPath: output.absolutePath,
          emojis: asset.emojiList,
        });
        continue;
      }

      const remoteEmojis = remoteSticker.emojiList.join(" ");
      const localEmojis = asset.emojiList.join(" ");
      if (localEmojis !== remoteEmojis && remoteFileId) {
        await this.options.auth.tdlibService.setStickerEmojis({
          stickerSetId: input.details.pack.telegram!.stickerSetId,
          fileId: remoteFileId,
          emojis: asset.emojiList,
        });
      }
    }

    return remotelyAddedAssetIds;
  }

  private async removeDeletedRemoteStickers(input: {
    telegram: NonNullable<StickerPackDetails["pack"]["telegram"]>;
    remoteSet: TelegramRemoteStickerSet;
    localByStickerId: ReadonlyMap<string, StickerPackDetails["assets"][number]>;
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
    const iconOutput = this.getIconOutput(input.details);
    if (iconOutput) {
      await this.ensureOutputFileExists(
        iconOutput.absolutePath,
        `Icon output for ${input.details.pack.name}`,
      );
      await this.options.auth.tdlibService.setStickerSetThumbnail({
        shortName: input.telegramShortName,
        thumbnailPath: iconOutput.absolutePath,
        format: "video",
      });
      return;
    }

    if (
      input.details.pack.iconAssetId === null &&
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
    stickerAssets: ReturnType<TelegramPackMutationService["getStickerAssets"]>;
    remotelyAddedAssetIds: ReadonlySet<string>;
  }) {
    const refreshedRemoteSet =
      await this.options.syncService.getRemoteStickerSetOrThrow(input.stickerSetId);
    await this.reorderAddedRemoteStickerAssets(
      refreshedRemoteSet,
      input.stickerAssets,
      input.remotelyAddedAssetIds,
    );

    const reorderedRemoteSet =
      await this.options.syncService.getRemoteStickerSetOrThrow(input.stickerSetId);
    await this.options.syncService.syncRemoteStickerSet(reorderedRemoteSet);
  }
}
