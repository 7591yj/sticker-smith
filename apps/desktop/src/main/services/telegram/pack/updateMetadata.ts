import type { StickerPackDetails } from "@sticker-smith/shared";

import type { TelegramPackMutationServiceOptions } from "./mutationTypes";
import type { TelegramRemoteStickerSet } from "../tdlib/service";

export async function recoverMirrorAfterFailedUpdate(
  options: TelegramPackMutationServiceOptions,
  input: { packId: string; stickerSetId: string; errorMessage: string },
) {
  try {
    await options.syncService.syncOwnedPacks();
  } catch {}

  const mirror =
    (await options.libraryService.findPackByTelegramStickerSetId(input.stickerSetId))
      ?.record.id ?? input.packId;

  try {
    await options.libraryService.updateTelegramMirrorMetadata({
      packId: mirror,
      syncState: "error",
      lastSyncError: input.errorMessage,
    });
  } catch {}
}

export async function resolveTelegramMirrorShortName(
  options: TelegramPackMutationServiceOptions,
  input: {
    packId: string;
    telegram: NonNullable<StickerPackDetails["pack"]["telegram"]>;
    remoteSet: TelegramRemoteStickerSet;
  },
) {
  const telegramShortName = input.telegram.shortName || input.remoteSet.shortName;
  if (!telegramShortName) {
    throw new Error("This pack is missing its Telegram short name. Refresh the pack and try again.");
  }

  if (input.telegram.shortName !== telegramShortName) {
    await options.libraryService.updateTelegramMirrorMetadata({
      packId: input.packId,
      shortName: telegramShortName,
    });
  }

  return telegramShortName;
}

export async function syncTelegramMirrorTitle(
  options: TelegramPackMutationServiceOptions,
  input: {
    details: StickerPackDetails;
    remoteSet: TelegramRemoteStickerSet;
    telegramShortName: string;
  },
) {
  if (input.details.pack.name === input.remoteSet.title) return;

  await options.auth.tdlibService.setStickerSetTitle({
    shortName: input.telegramShortName,
    title: input.details.pack.name,
  });
}
