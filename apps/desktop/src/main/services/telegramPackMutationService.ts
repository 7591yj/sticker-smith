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

type StickerPackSticker = StickerPackDetails["stickers"][number];
type StickerSticker = StickerPackSticker;
type StickerOutput = StickerPackSticker | undefined;
type UpdateTelegramPackContext = {
  details: StickerPackDetails;
  telegram: NonNullable<StickerPackDetails["pack"]["telegram"]>;
  stickerStickers: StickerSticker[];
};

export class TelegramPackMutationService {
  constructor(private readonly options: TelegramPackMutationServiceOptions) {}

  async publishLocalPack(input: PublishLocalPackInput) {
    await this.options.auth.requireConnectedState();
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

  async updateTelegramPack(input: UpdateTelegramPackInput) {
    await this.options.auth.requireConnectedState();
    const context = await this.prepareTelegramPackUpdate(input);

    this.options.emit({
      type: "update_started",
      packId: input.packId,
      stickerSetId: context.telegram.stickerSetId,
    });
    await this.options.mirrorService.markPackSyncState(input.packId, "syncing", null);

    try {
      await this.applyTelegramPackUpdate(input.packId, context);
      await this.options.mirrorService.markPackSyncState(input.packId, "idle", null);
      this.options.emit({
        type: "update_finished",
        packId: input.packId,
        stickerSetId: context.telegram.stickerSetId,
      });
    } catch (error) {
      await this.handleTelegramPackUpdateFailure(input.packId, context.telegram, error);
    }
  }

  private emitPublishStarted(localPackId: string) {
    this.options.emit({
      type: "publish_started",
      localPackId,
    });
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
    return this.getStickerStickers(details).map((sticker) => {
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
    const iconSticker = this.getIconSticker(details);
    if (!iconSticker) {
      return;
    }

    await this.ensureStickerFileExists(
      iconSticker.absolutePath,
      `Icon file for ${details.pack.name}`,
    );
    await this.options.auth.tdlibService.setStickerSetThumbnail({
      shortName,
      thumbnailPath: iconSticker.absolutePath,
      format: "video",
    });
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

  private async prepareTelegramPackUpdate(
    input: UpdateTelegramPackInput,
  ): Promise<UpdateTelegramPackContext> {
    const details = await this.options.libraryService.getPack(input.packId);
    const telegram = details.pack.telegram;
    const stickerStickers = this.getStickerStickers(details);
    if (details.pack.source !== "telegram" || !telegram) {
      throw new Error(`Pack ${input.packId} is not a Telegram mirror.`);
    }
    if (!supportsTelegramMirrorEditing(telegram.format)) {
      throw new Error(describeUnsupportedStickerSet(telegram));
    }

    return { details, telegram, stickerStickers };
  }

  private async applyTelegramPackUpdate(
    packId: string,
    context: UpdateTelegramPackContext,
  ) {
    this.assertTelegramMirrorHasStickers(context.stickerStickers);
    await this.validateTelegramPackStickers(context.details, {
      operation: "update",
      requireIconSticker: false,
    });

    const remoteSet = await this.options.syncService.getRemoteStickerSetOrThrow(
      context.telegram.stickerSetId,
    );
    await this.syncTelegramMirrorWithRemote({ packId, ...context, remoteSet });
  }

  private assertTelegramMirrorHasStickers(
    stickerStickers: readonly StickerPackSticker[],
  ) {
    if (stickerStickers.length === 0) {
      throw new Error(
        "Telegram mirrors must keep at least one sticker. Deleting the entire remote sticker set is not supported by Update.",
      );
    }
  }

  private async syncTelegramMirrorWithRemote(input: UpdateTelegramPackContext & {
    packId: string;
    remoteSet: TelegramRemoteStickerSet;
  }) {
    const telegramShortName = await this.resolveTelegramMirrorShortName(input);
    const remoteByStickerId = new Map(
      input.remoteSet.stickers.map((sticker) => [sticker.stickerId, sticker]),
    );
    const localByStickerId = new Map(
      input.details.stickers
        .filter((sticker) => sticker.telegram)
        .map((sticker) => [sticker.telegram!.stickerId, sticker]),
    );

    await this.syncTelegramMirrorTitle({ ...input, telegramShortName });
    await this.reorderExistingRemoteStickerStickers(
      input.remoteSet,
      input.stickerStickers,
    );
    const remotelyAddedStickerIds = await this.applyTelegramStickerStickerChanges({
      details: input.details,
      stickerStickers: input.stickerStickers,
      telegramShortName,
      remoteByStickerId,
      duplicateLocalStickerStickerIds: this.getDuplicateLocalStickerStickerIds(
        input.details,
      ),
    });
    await this.removeDeletedRemoteStickers({
      telegram: input.telegram,
      remoteSet: input.remoteSet,
      localByStickerId,
    });
    await this.syncTelegramMirrorThumbnail({ details: input.details, telegramShortName });
    await this.resyncUpdatedTelegramMirror({
      stickerSetId: input.telegram.stickerSetId,
      stickerStickers: input.stickerStickers,
      remotelyAddedStickerIds,
    });
  }

  private async handleTelegramPackUpdateFailure(
    packId: string,
    telegram: NonNullable<StickerPackDetails["pack"]["telegram"]>,
    error: unknown,
  ) {
    const errorMessage = describeTdlibError(error);
    await this.recoverMirrorAfterFailedUpdate({
      packId,
      stickerSetId: telegram.stickerSetId,
      errorMessage,
    });
    this.options.emit({
      type: "update_failed",
      packId,
      stickerSetId: telegram.stickerSetId,
      error: errorMessage,
    });
    throw error;
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
    const stickerStickers = this.getStickerStickers(details);
    const remoteSignatures = this.getRemoteStickerSignatures(details, stickerStickers);

    return new Set(
      stickerStickers
        .filter((sticker) => this.isDuplicateLocalSticker(details, sticker, remoteSignatures))
        .map((sticker) => sticker.id),
    );
  }

  private getRemoteStickerSignatures(
    details: StickerPackDetails,
    stickerStickers: readonly StickerSticker[],
  ) {
    const remoteSignatures = new Set<string>();

    for (const sticker of stickerStickers) {
      if (!sticker.telegram) {
        continue;
      }

      const telegramSticker = sticker as StickerSticker & {
        telegram: NonNullable<StickerSticker["telegram"]>;
      };
      for (const signature of this.collectExistingRemoteStickerSignatures(
        details,
        telegramSticker,
      )) {
        remoteSignatures.add(signature);
      }
    }

    return remoteSignatures;
  }

  private collectExistingRemoteStickerSignatures(
    details: StickerPackDetails,
    sticker: StickerSticker & { telegram: NonNullable<StickerSticker["telegram"]> },
  ) {
    const output = findSticker(details.stickers, sticker.id);
    return collectTelegramStickerSignatures({
      emojis: sticker.emojiList,
      sha256Values: [
        sticker.telegram.baselineStickerHash ?? null,
        output?.sha256 ?? null,
      ],
    }).filter(Boolean);
  }

  private isDuplicateLocalSticker(
    details: StickerPackDetails,
    sticker: StickerSticker,
    remoteSignatures: ReadonlySet<string>,
  ) {
    if (sticker.telegram) {
      return false;
    }

    return this.collectLocalStickerSignatures(details, sticker).some((signature) =>
      remoteSignatures.has(signature),
    );
  }

  private collectLocalStickerSignatures(
    details: StickerPackDetails,
    sticker: StickerSticker,
  ) {
    const output = findSticker(details.stickers, sticker.id);
    return collectTelegramStickerSignatures({
      emojis: sticker.emojiList,
      sha256Values: [output?.sha256 ?? null],
    });
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
      const added = await this.applyTelegramStickerStickerChange(input, sticker);
      if (added) {
        remotelyAddedStickerIds.add(sticker.id);
      }
    }

    return remotelyAddedStickerIds;
  }

  private async applyTelegramStickerStickerChange(
    input: {
      details: StickerPackDetails;
      telegramShortName: string;
      remoteByStickerId: ReadonlyMap<string, TelegramRemoteSticker>;
      duplicateLocalStickerStickerIds: ReadonlySet<string>;
    },
    sticker: StickerSticker,
  ) {
    const output = findSticker(input.details.stickers, sticker.id);
    this.assertStickerHasEmojis(sticker, "update");

    if (!sticker.telegram) {
      return this.addLocalStickerToTelegramSet(input, sticker, output);
    }

    await this.updateExistingTelegramSticker(input, sticker, output);
    return false;
  }

  private async addLocalStickerToTelegramSet(
    input: {
      details: StickerPackDetails;
      telegramShortName: string;
      duplicateLocalStickerStickerIds: ReadonlySet<string>;
    },
    sticker: StickerSticker,
    output: StickerOutput,
  ) {
    if (input.duplicateLocalStickerStickerIds.has(sticker.id)) {
      return false;
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
    return true;
  }

  private async updateExistingTelegramSticker(
    input: {
      details: StickerPackDetails;
      telegramShortName: string;
      remoteByStickerId: ReadonlyMap<string, TelegramRemoteSticker>;
    },
    sticker: StickerSticker,
    output: StickerOutput,
  ) {
    if (!sticker.telegram) {
      return;
    }

    const telegramSticker = sticker as StickerSticker & {
      telegram: NonNullable<StickerSticker["telegram"]>;
    };
    const remoteSticker = input.remoteByStickerId.get(telegramSticker.telegram.stickerId);
    if (!remoteSticker) {
      return;
    }

    const remoteFileId = telegramSticker.telegram.fileId ?? remoteSticker.fileId;
    if (output) {
      await this.ensureStickerFileExists(
        output.absolutePath,
        `Sticker file for ${sticker.relativePath}`,
      );
    }

    if (
      await this.replaceTelegramStickerIfChanged(
        input,
        telegramSticker,
        output,
        remoteFileId,
      )
    ) {
      return;
    }

    await this.updateTelegramStickerEmojisIfChanged(
      input.details,
      sticker,
      remoteSticker,
      remoteFileId,
    );
  }

  private async replaceTelegramStickerIfChanged(
    input: { telegramShortName: string },
    sticker: StickerSticker & { telegram: NonNullable<StickerSticker["telegram"]> },
    output: StickerOutput,
    remoteFileId: string | null | undefined,
  ) {
    if (!output || output.sha256 === sticker.telegram.baselineStickerHash || !remoteFileId) {
      return false;
    }

    await this.options.auth.tdlibService.replaceStickerInSet({
      shortName: input.telegramShortName,
      oldFileId: remoteFileId,
      newStickerPath: output.absolutePath,
      emojis: sticker.emojiList,
    });
    return true;
  }

  private async updateTelegramStickerEmojisIfChanged(
    details: StickerPackDetails,
    sticker: StickerSticker,
    remoteSticker: TelegramRemoteSticker,
    remoteFileId: string | null | undefined,
  ) {
    const remoteEmojis = remoteSticker.emojiList.join(" ");
    const localEmojis = sticker.emojiList.join(" ");
    if (localEmojis === remoteEmojis || !remoteFileId) {
      return;
    }

    await this.options.auth.tdlibService.setStickerEmojis({
      stickerSetId: details.pack.telegram!.stickerSetId,
      fileId: remoteFileId,
      emojis: sticker.emojiList,
    });
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
