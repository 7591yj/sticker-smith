import type { StickerPack, TelegramState } from "@sticker-smith/shared";
import { appTokens } from "../../../theme/appTokens";
import { formatTelegramSyncStateLabel } from "../../utils/telegramSyncState";
import type { SidebarPackFilter } from "./types";

export function statusLabelForTelegram(state: TelegramState | null) {
  if (!state) return appTokens.copy.labels.telegramDisconnected;
  if (state.status === "connected")
    return appTokens.copy.labels.telegramConnected;
  if (state.authStep === "wait_code")
    return appTokens.copy.labels.telegramNeedsCode;
  if (state.authStep === "wait_password")
    return appTokens.copy.labels.telegramNeedsPassword;
  if (state.status === "awaiting_credentials")
    return appTokens.copy.labels.telegramNeedsCredentials;
  return appTokens.copy.labels.telegramDisconnected;
}

function shortNameLabelForPack(pack: StickerPack) {
  return pack.telegramShortName ?? appTokens.copy.labels.telegramShortNameUnset;
}

export function secondaryLabelForPack(pack: StickerPack) {
  const shortNameLabel =
    pack.source === "telegram"
      ? (pack.telegram?.shortName ??
        appTokens.copy.labels.telegramShortNameUnset)
      : shortNameLabelForPack(pack);

  if (pack.source === "telegram" && pack.telegram?.syncState) {
    return `${shortNameLabel} · ${formatTelegramSyncStateLabel(pack.telegram.syncState)}`;
  }

  return shortNameLabel;
}

export function emptyTelegramStateLabel(options: {
  telegramSyncBusy: boolean;
}) {
  return options.telegramSyncBusy
    ? appTokens.copy.labels.telegramSyncInProgress
    : appTokens.copy.emptyStates.noTelegramPacks;
}

export function getSidebarPackGroups(packs: StickerPack[]) {
  const localPacks = packs.filter((pack) => pack.source === "local");
  const telegramPacks = packs.filter(
    (pack) =>
      pack.source === "telegram" && pack.telegram?.syncState !== "unsupported",
  );
  const unsupportedTelegramPacks = packs.filter(
    (pack) =>
      pack.source === "telegram" && pack.telegram?.syncState === "unsupported",
  );

  return { localPacks, telegramPacks, unsupportedTelegramPacks };
}

export function getSidebarLabels(options: {
  telegramPacks: StickerPack[];
  telegramSyncBusy: boolean;
  telegramSyncRecommended: boolean;
  telegramState: TelegramState | null;
}) {
  const syncActionLabel = options.telegramSyncBusy
    ? appTokens.copy.labels.telegramSyncInProgress
    : options.telegramSyncRecommended
      ? "Sync needed"
      : options.telegramPacks.length > 0
        ? appTokens.copy.actions.resync
        : appTokens.copy.actions.sync;
  const telegramManageLabel =
    options.telegramState?.status === "connected"
      ? appTokens.copy.actions.manageTelegram
      : appTokens.copy.actions.connectTelegram;

  return { syncActionLabel, telegramManageLabel };
}

export function getVisiblePacks(options: {
  activePackFilter: SidebarPackFilter;
  localPacks: StickerPack[];
  telegramPacks: StickerPack[];
  unsupportedTelegramPacks: StickerPack[];
  showUnsupportedTelegram: boolean;
}) {
  if (options.activePackFilter === "local") return options.localPacks;
  return options.showUnsupportedTelegram
    ? [...options.telegramPacks, ...options.unsupportedTelegramPacks]
    : options.telegramPacks;
}
