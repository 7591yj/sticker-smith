import type { StickerPack, StickerPackDetails } from "@sticker-smith/shared";
import { appTokens } from "../../../theme/appTokens";

export type PackPanelDerivedState = {
  stickers: StickerPackDetails["stickers"];
  telegramUnsupported: boolean;
  unsupportedTelegramTooltip: string | null;
  primaryActionLabel: string;
  telegramMirrorBusy: boolean;
  hasPendingTelegramMedia: boolean;
  telegramMediaBusy: boolean;
  telegramMediaActionLabel: string;
};

function getUnsupportedTelegramTooltip(pack: StickerPack) {
  if (pack.source !== "telegram" || !pack.telegram) return null;
  return `This Telegram pack uses ${pack.telegram.format} stickers. Only video sticker packs are supported currently.`;
}

function getPrimaryActionLabel(
  pack: StickerPack,
  telegramPublishing: boolean,
  telegramUpdating: boolean,
) {
  if (pack.source === "telegram") {
    return telegramUpdating
      ? appTokens.copy.actions.pushing
      : appTokens.copy.actions.push;
  }
  return telegramPublishing
    ? appTokens.copy.actions.uploading
    : appTokens.copy.actions.upload;
}

function hasPendingMedia(
  stickers: StickerPackDetails["stickers"],
  telegramUnsupported: boolean,
  pack: StickerPack,
) {
  return (
    pack.source === "telegram" &&
    !telegramUnsupported &&
    stickers.some(
      (sticker) =>
        sticker.downloadState === "missing" ||
        sticker.downloadState === "failed",
    )
  );
}

function getTelegramMediaActionLabel(
  stickers: StickerPackDetails["stickers"],
  telegramMediaBusy: boolean,
) {
  if (telegramMediaBusy) return appTokens.copy.actions.downloadingMedia;
  if (stickers.some((sticker) => sticker.downloadState === "failed")) {
    return appTokens.copy.actions.retryMedia;
  }
  return appTokens.copy.actions.downloadMedia;
}

export function getPackPanelDerivedState(
  details: StickerPackDetails,
  telegramPublishing: boolean,
  telegramUpdating: boolean,
): PackPanelDerivedState {
  const { pack } = details;
  const stickers = details.stickers ?? [];
  const telegramUnsupported =
    pack.source === "telegram" && pack.telegram?.syncState === "unsupported";
  const telegramMediaBusy = stickers.some(
    (sticker) =>
      sticker.downloadState === "queued" ||
      sticker.downloadState === "downloading",
  );

  return {
    stickers,
    telegramUnsupported,
    unsupportedTelegramTooltip: getUnsupportedTelegramTooltip(pack),
    primaryActionLabel: getPrimaryActionLabel(
      pack,
      telegramPublishing,
      telegramUpdating,
    ),
    telegramMirrorBusy:
      telegramUpdating || pack.telegram?.syncState === "syncing",
    hasPendingTelegramMedia: hasPendingMedia(
      stickers,
      telegramUnsupported,
      pack,
    ),
    telegramMediaBusy,
    telegramMediaActionLabel: getTelegramMediaActionLabel(
      stickers,
      telegramMediaBusy,
    ),
  };
}
