import { hashEmojiList, type StickerPackDetails } from "@sticker-smith/shared";

import { findSticker } from "../../../utils/stickerQueries";
import type {
  StickerOutput,
  StickerSticker,
  TelegramPackMutationServiceOptions,
} from "./mutationTypes";
import {
  assertStickerHasEmojis,
  ensureStickerFileExists,
  getIconSticker,
} from "./updateStickers";
import type { TelegramRemoteSticker, TelegramRemoteStickerSet } from "../tdlib/service";

export class TelegramPackUpdateMutations {
  constructor(private readonly options: TelegramPackMutationServiceOptions) {}

  async applyTelegramStickerStickerChanges(input: {
    details: StickerPackDetails;
    stickerStickers: StickerSticker[];
    telegramShortName: string;
    remoteByStickerId: ReadonlyMap<string, TelegramRemoteSticker>;
    duplicateLocalStickerStickerIds: ReadonlySet<string>;
  }) {
    const remotelyAddedStickerIds = new Set<string>();

    for (const sticker of input.stickerStickers) {
      const added = await this.applyTelegramStickerStickerChange(input, sticker);
      if (added) remotelyAddedStickerIds.add(sticker.id);
    }

    return remotelyAddedStickerIds;
  }

  async removeDeletedRemoteStickers(input: {
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

  async syncTelegramMirrorThumbnail(input: {
    details: StickerPackDetails;
    telegramShortName: string;
  }) {
    const iconSticker = getIconSticker(input.details);
    if (iconSticker) {
      await ensureStickerFileExists(
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
    assertStickerHasEmojis(sticker, "update");

    if (!sticker.telegram) {
      return this.addLocalStickerToTelegramSet(input, sticker, output);
    }

    await this.updateExistingTelegramSticker(input, sticker, output);
    return false;
  }

  private async addLocalStickerToTelegramSet(
    input: {
      telegramShortName: string;
      duplicateLocalStickerStickerIds: ReadonlySet<string>;
    },
    sticker: StickerSticker,
    output: StickerOutput,
  ) {
    if (input.duplicateLocalStickerStickerIds.has(sticker.id)) return false;

    if (!output) {
      throw new Error(
        `Sticker file for ${sticker.relativePath} is missing. Add the sticker again before Telegram update.`,
      );
    }
    await ensureStickerFileExists(output.absolutePath, `Sticker file for ${sticker.relativePath}`);

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
    if (!sticker.telegram) return;

    const telegramSticker = sticker as StickerSticker & {
      telegram: NonNullable<StickerSticker["telegram"]>;
    };
    const remoteSticker = input.remoteByStickerId.get(telegramSticker.telegram.stickerId);
    if (!remoteSticker) return;

    const remoteFileId = telegramSticker.telegram.fileId ?? remoteSticker.fileId;
    if (output) {
      await ensureStickerFileExists(output.absolutePath, `Sticker file for ${sticker.relativePath}`);
    }

    if (await this.replaceTelegramStickerIfChanged(input, telegramSticker, output, remoteFileId)) {
      await this.options.libraryService.updateStickerTelegramBaseline({
        packId: input.details.pack.id,
        stickerId: sticker.id,
        baselineStickerHash: output!.sha256,
        baselineEmojiHash: hashEmojiList(sticker.emojiList),
      });
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
    if (localEmojis === remoteEmojis || !remoteFileId) return;

    await this.options.auth.tdlibService.setStickerEmojis({
      stickerSetId: details.pack.telegram!.stickerSetId,
      fileId: remoteFileId,
      emojis: sticker.emojiList,
    });

    await this.options.libraryService.updateStickerTelegramBaseline({
      packId: details.pack.id,
      stickerId: sticker.id,
      baselineEmojiHash: hashEmojiList(sticker.emojiList),
    });
  }
}
