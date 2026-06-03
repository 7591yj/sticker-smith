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
        bgcolor: appTokens.colors.status.ready.background,
        color: appTokens.colors.status.ready.contrast,
      };
    case "syncing":
      return {
        bgcolor: appTokens.colors.status.synced.background,
        color: appTokens.colors.status.synced.contrast,
      };
    case "stale":
      return {
        bgcolor: appTokens.colors.status.modified.background,
        color: appTokens.colors.status.modified.contrast,
      };
    case "error":
      return {
        bgcolor: appTokens.colors.status.failed.background,
        color: appTokens.colors.status.failed.contrast,
      };
    case "unsupported":
      return {
        bgcolor: appTokens.colors.status.draft.background,
        color: appTokens.colors.status.draft.contrast,
      };
  }
}
