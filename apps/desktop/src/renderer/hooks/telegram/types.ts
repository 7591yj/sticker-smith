import type {
  StickerPack,
  StickerPackDetails,
  TelegramState,
} from "@sticker-smith/shared";

export interface TelegramErrorDialogState {
  title: string;
  message: string;
}

export interface TelegramUiState {
  telegramState: TelegramState | null;
  telegramSyncInProgress: boolean;
  telegramSyncRecommended: boolean;
  telegramPublishingPackIds: string[];
  telegramUpdatingPackIds: string[];
  telegramErrorDialog: TelegramErrorDialogState | null;
}

export type TelegramUiAction =
  | { type: "startup_succeeded"; state: TelegramState }
  | { type: "show_error"; title: string; message: string }
  | { type: "dismiss_error" }
  | { type: "auth_state_changed"; state: TelegramState }
  | { type: "sync_started" }
  | { type: "sync_finished" }
  | { type: "publish_started"; packId: string }
  | { type: "publish_failed"; packId: string; error: string }
  | { type: "publish_finished"; packId: string }
  | { type: "update_started"; packId: string }
  | { type: "update_failed"; packId: string; error: string }
  | { type: "update_finished"; packId: string }
  | { type: "sync_recommended"; value: boolean };

export type TelegramDispatch = React.Dispatch<TelegramUiAction>;

export type TelegramActionRunner = <T>(
  action: () => Promise<T>,
  errorTitle: string,
  fallbackMessage: string,
  onSuccess?: (next: T) => Promise<void> | void,
) => Promise<T | null>;

export interface UseTelegramStateInput {
  latestDetailsRef: React.RefObject<StickerPackDetails | null>;
  refreshDetails: (packId: string) => Promise<StickerPackDetails>;
  refreshDetailsSafely: (packId: string) => Promise<StickerPackDetails | null>;
  refreshPacks: () => Promise<StickerPack[]>;
  setSelectedPackId: React.Dispatch<React.SetStateAction<string | null>>;
}
