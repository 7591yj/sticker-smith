import type { TelegramUiAction, TelegramUiState } from "./types";

function addTrackedPackId(packIds: string[], packId: string) {
  return packIds.includes(packId) ? packIds : [...packIds, packId];
}

function removeTrackedPackId(packIds: string[], packId: string) {
  return packIds.filter((candidate) => candidate !== packId);
}

function resetTransientState(state: TelegramUiState): TelegramUiState {
  return {
    ...state,
    telegramSyncInProgress: false,
    telegramSyncRecommended: false,
    telegramPublishingPackIds: [],
    telegramUpdatingPackIds: [],
  };
}

type TelegramUiReducerMap = {
  [Action in TelegramUiAction as Action["type"]]: (
    state: TelegramUiState,
    action: Action,
  ) => TelegramUiState;
};

const telegramUiReducers: TelegramUiReducerMap = {
  startup_succeeded: (state, action) => ({
    ...state,
    telegramState: action.state,
  }),
  show_error: (state, action) => ({
    ...state,
    telegramErrorDialog: { title: action.title, message: action.message },
  }),
  dismiss_error: (state) => ({ ...state, telegramErrorDialog: null }),
  auth_state_changed: (state, action) =>
    action.state.status === "connected"
      ? { ...state, telegramState: action.state }
      : resetTransientState({ ...state, telegramState: action.state }),
  sync_started: (state) => ({ ...state, telegramSyncInProgress: true }),
  sync_finished: (state) => ({
    ...state,
    telegramSyncInProgress: false,
    telegramSyncRecommended: false,
  }),
  publish_started: (state, action) => ({
    ...state,
    telegramPublishingPackIds: addTrackedPackId(
      state.telegramPublishingPackIds,
      action.packId,
    ),
  }),
  publish_failed: (state, action) => ({
    ...state,
    telegramPublishingPackIds: removeTrackedPackId(
      state.telegramPublishingPackIds,
      action.packId,
    ),
    telegramErrorDialog: {
      title: "Telegram upload failed",
      message: action.error,
    },
  }),
  publish_finished: (state, action) => ({
    ...state,
    telegramPublishingPackIds: removeTrackedPackId(
      state.telegramPublishingPackIds,
      action.packId,
    ),
    telegramSyncRecommended: true,
  }),
  update_started: (state, action) => ({
    ...state,
    telegramUpdatingPackIds: addTrackedPackId(
      state.telegramUpdatingPackIds,
      action.packId,
    ),
  }),
  update_failed: (state, action) => ({
    ...state,
    telegramUpdatingPackIds: removeTrackedPackId(
      state.telegramUpdatingPackIds,
      action.packId,
    ),
    telegramErrorDialog: {
      title: "Telegram update failed",
      message: action.error,
    },
  }),
  update_finished: (state, action) => ({
    ...state,
    telegramUpdatingPackIds: removeTrackedPackId(
      state.telegramUpdatingPackIds,
      action.packId,
    ),
  }),
  sync_recommended: (state, action) => ({
    ...state,
    telegramSyncRecommended: action.value,
  }),
};

export function reduceTelegramUiState(
  state: TelegramUiState,
  action: TelegramUiAction,
): TelegramUiState {
  return telegramUiReducers[action.type](state, action as never);
}

export function createInitialTelegramUiState(): TelegramUiState {
  return {
    telegramState: null,
    telegramSyncInProgress: false,
    telegramSyncRecommended: false,
    telegramPublishingPackIds: [],
    telegramUpdatingPackIds: [],
    telegramErrorDialog: null,
  };
}
