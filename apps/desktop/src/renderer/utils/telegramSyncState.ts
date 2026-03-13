import type { TelegramPackSyncState } from "@sticker-smith/shared";
import { appTokens } from "../../theme/appTokens";

export function formatTelegramSyncStateLabel(syncState: TelegramPackSyncState) {
  switch (syncState) {
    case "idle":
      return appTokens.copy.labels.telegramMirrorUpToDate;
    case "syncing":
      return appTokens.copy.labels.telegramMirrorSyncing;
    case "stale":
      return appTokens.copy.labels.telegramMirrorNeedsUpdate;
    case "error":
      return appTokens.copy.labels.telegramMirrorError;
    case "unsupported":
      return appTokens.copy.labels.telegramMirrorUnsupported;
  }
}

export function telegramSyncStateChipSx(syncState: TelegramPackSyncState) {
  switch (syncState) {
    case "idle":
      return {
        bgcolor: "success.dark",
        color: "success.contrastText",
      };
    case "syncing":
      return {
        bgcolor: "info.dark",
        color: "info.contrastText",
      };
    case "stale":
      return {
        bgcolor: "warning.dark",
        color: "warning.contrastText",
      };
    case "error":
      return {
        bgcolor: "error.dark",
        color: "error.contrastText",
      };
    case "unsupported":
      return {
        bgcolor: "grey.700",
        color: "text.primary",
      };
  }
}
