import type { UpdateTelegramPackInput, StickerPackDetails } from "@sticker-smith/shared";

import { describeTdlibError, describeUnsupportedStickerSet } from "./telegramAuthService";
import type {
  StickerPackSticker,
  StickerSticker,
  TelegramPackMutationServiceOptions,
  UpdateTelegramPackContext,
} from "./telegramPackMutationTypes";
import {
  recoverMirrorAfterFailedUpdate,
  resolveTelegramMirrorShortName,
  syncTelegramMirrorTitle,
} from "./telegramPackUpdateMetadata";
import { TelegramPackUpdateMutations } from "./telegramPackUpdateMutations";
import {
  assertTelegramMirrorHasStickers,
  getDuplicateLocalStickerStickerIds,
  getStickerStickers,
  validateTelegramPackStickers,
} from "./telegramPackUpdateStickers";
import {
  reorderAddedRemoteStickerStickers,
  reorderExistingRemoteStickerStickers,
} from "./telegramPackUpdateRemoteOrder";
import type { TelegramRemoteStickerSet } from "./telegramTdlibService";
import { supportsTelegramMirrorEditing } from "./telegramMirrorSupport";

export class TelegramPackUpdater {
  private readonly mutations: TelegramPackUpdateMutations;

  constructor(private readonly options: TelegramPackMutationServiceOptions) {
    this.mutations = new TelegramPackUpdateMutations(options);
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

  private async prepareTelegramPackUpdate(
    input: UpdateTelegramPackInput,
  ): Promise<UpdateTelegramPackContext> {
    const details = await this.options.libraryService.getPack(input.packId);
    const telegram = details.pack.telegram;
    const stickerStickers = getStickerStickers(details);
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
    assertTelegramMirrorHasStickers(context.stickerStickers);
    await validateTelegramPackStickers(context.details, {
      operation: "update",
      requireIconSticker: false,
    });

    const remoteSet = await this.options.syncService.getRemoteStickerSetOrThrow(
      context.telegram.stickerSetId,
    );
    await this.syncTelegramMirrorWithRemote({ packId, ...context, remoteSet });
  }

  private async syncTelegramMirrorWithRemote(input: UpdateTelegramPackContext & {
    packId: string;
    remoteSet: TelegramRemoteStickerSet;
  }) {
    const telegramShortName = await resolveTelegramMirrorShortName(this.options, input);
    const remoteByStickerId = new Map(
      input.remoteSet.stickers.map((sticker) => [sticker.stickerId, sticker]),
    );
    const localByStickerId = new Map(
      input.details.stickers
        .filter((sticker) => sticker.telegram)
        .map((sticker) => [sticker.telegram!.stickerId, sticker]),
    );

    await syncTelegramMirrorTitle(this.options, { ...input, telegramShortName });
    await reorderExistingRemoteStickerStickers(
      this.options,
      input.remoteSet,
      input.stickerStickers,
    );
    const remotelyAddedStickerIds = await this.mutations.applyTelegramStickerStickerChanges({
      details: input.details,
      stickerStickers: input.stickerStickers,
      telegramShortName,
      remoteByStickerId,
      duplicateLocalStickerStickerIds: getDuplicateLocalStickerStickerIds(input.details),
    });
    await this.mutations.removeDeletedRemoteStickers({
      telegram: input.telegram,
      remoteSet: input.remoteSet,
      localByStickerId,
    });
    await this.mutations.syncTelegramMirrorThumbnail({
      details: input.details,
      telegramShortName,
    });
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
    await recoverMirrorAfterFailedUpdate(this.options, {
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

  private async resyncUpdatedTelegramMirror(input: {
    stickerSetId: string;
    stickerStickers: StickerSticker[];
    remotelyAddedStickerIds: ReadonlySet<string>;
  }) {
    const refreshedRemoteSet =
      await this.options.syncService.getRemoteStickerSetOrThrow(input.stickerSetId);
    await reorderAddedRemoteStickerStickers(
      this.options,
      refreshedRemoteSet,
      input.stickerStickers,
      input.remotelyAddedStickerIds,
    );

    const reorderedRemoteSet =
      await this.options.syncService.getRemoteStickerSetOrThrow(input.stickerSetId);
    await this.options.syncService.syncRemoteStickerSet(reorderedRemoteSet);
  }
}
