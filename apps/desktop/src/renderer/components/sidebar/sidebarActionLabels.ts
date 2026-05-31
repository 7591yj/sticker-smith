import type { StickerPack, TelegramState } from "@sticker-smith/shared";
import { appTokens } from "../../../theme/appTokens";

export function emptyTelegramStateLabel(options: { telegramSyncBusy: boolean }) {
  return options.telegramSyncBusy
    ? appTokens.copy.labels.telegramSyncInProgress
    : appTokens.copy.emptyStates.noTelegramPacks;
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
