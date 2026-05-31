import type { StickerPack } from "@sticker-smith/shared";
import { appTokens } from "../../../theme/appTokens";
import { formatTelegramSyncStateLabel } from "../../utils/telegramSyncState";

function shortNameLabelForPack(pack: StickerPack) {
  return pack.telegramShortName ?? appTokens.copy.labels.telegramShortNameUnset;
}

export function secondaryLabelForPack(pack: StickerPack) {
  const shortNameLabel =
    pack.source === "telegram"
      ? (pack.telegram?.shortName ?? appTokens.copy.labels.telegramShortNameUnset)
      : shortNameLabelForPack(pack);

  if (pack.source === "telegram" && pack.telegram?.syncState) {
    return `${shortNameLabel} · ${formatTelegramSyncStateLabel(pack.telegram.syncState)}`;
  }

  return shortNameLabel;
}
