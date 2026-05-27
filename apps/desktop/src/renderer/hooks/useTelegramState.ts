import { useCallback, useEffect, useReducer, useRef } from "react";
import type {
  StickerPack,
  StickerPackDetails,
  TelegramEvent,
  TelegramState,
} from "@sticker-smith/shared";

interface TelegramErrorDialogState {
  title: string;
  message: string;
}

interface TelegramUiState {
  telegramState: TelegramState | null;
  telegramSyncInProgress: boolean;
  telegramSyncRecommended: boolean;
  telegramPublishingPackIds: string[];
  telegramUpdatingPackIds: string[];
  telegramErrorDialog: TelegramErrorDialogState | null;
}

type TelegramUiAction =
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

type Dispatch = React.Dispatch<TelegramUiAction>;

type TelegramActionRunner = <T>(
  action: () => Promise<T>,
  errorTitle: string,
  fallbackMessage: string,
  onSuccess?: (next: T) => Promise<void> | void,
) => Promise<T | null>;

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

function reduceTelegramUiState(
  state: TelegramUiState,
  action: TelegramUiAction,
): TelegramUiState {
  return telegramUiReducers[action.type](state, action as never);
}

function createInitialTelegramUiState(): TelegramUiState {
  return {
    telegramState: null,
    telegramSyncInProgress: false,
    telegramSyncRecommended: false,
    telegramPublishingPackIds: [],
    telegramUpdatingPackIds: [],
    telegramErrorDialog: null,
  };
}

function refreshSelectedPackDetails(
  event: TelegramEvent,
  latestDetailsRef: React.RefObject<StickerPackDetails | null>,
  refreshDetails: (packId: string) => Promise<StickerPackDetails>,
) {
  const eventsWithPackDetails = [
    "pack_sync_started",
    "pack_sync_completed",
    "pack_sync_failed",
    "file_download_progress",
    "update_started",
    "update_finished",
    "update_failed",
  ];

  const packId = "packId" in event ? event.packId : null;
  if (
    eventsWithPackDetails.includes(event.type) &&
    packId &&
    latestDetailsRef.current?.pack.id === packId
  ) {
    void refreshDetails(packId);
  }
}

interface TelegramEventHandlerContext {
  dispatch: Dispatch;
  refreshPacks: () => Promise<StickerPack[]>;
  setSelectedPackId: React.Dispatch<React.SetStateAction<string | null>>;
}

type TelegramEventHandler<Event extends TelegramEvent = TelegramEvent> = (
  event: Event,
  context: TelegramEventHandlerContext,
) => boolean | void;
type TelegramEventHandlerMap = {
  [Event in TelegramEvent as Event["type"]]?: TelegramEventHandler<Event>;
};

const telegramPackRefreshEventTypes = new Set<TelegramEvent["type"]>([
  "sync_finished",
  "pack_sync_started",
  "pack_sync_completed",
  "pack_sync_failed",
  "update_started",
  "update_finished",
  "update_failed",
]);

const telegramEventHandlers: TelegramEventHandlerMap = {
  auth_state_changed: (event, { dispatch, refreshPacks }) => {
    dispatch({ type: "auth_state_changed", state: event.state });
    void refreshPacks();
    return true;
  },
  sync_started: (_event, { dispatch }) => dispatch({ type: "sync_started" }),
  publish_started: (event, { dispatch }) =>
    dispatch({ type: "publish_started", packId: event.localPackId }),
  pack_sync_failed: (event, { dispatch }) =>
    dispatch({
      type: "show_error",
      title: "Telegram sync failed",
      message: event.error,
    }),
  publish_failed: (event, { dispatch }) =>
    dispatch({
      type: "publish_failed",
      packId: event.localPackId,
      error: event.error,
    }),
  update_started: (event, { dispatch }) =>
    dispatch({ type: "update_started", packId: event.packId }),
  update_failed: (event, { dispatch }) =>
    dispatch({
      type: "update_failed",
      packId: event.packId,
      error: event.error,
    }),
  publish_finished: (event, { dispatch, refreshPacks, setSelectedPackId }) => {
    dispatch({ type: "publish_finished", packId: event.localPackId });
    void refreshPacks().then((nextPacks) =>
      setSelectedPackId(
        nextPacks.find((pack) => pack.id === event.packId)?.id ?? event.packId,
      ),
    );
    return true;
  },
  sync_finished: (_event, { dispatch }) => dispatch({ type: "sync_finished" }),
  update_finished: (event, { dispatch }) =>
    dispatch({ type: "update_finished", packId: event.packId }),
};

function handleTelegramEvent({
  event,
  dispatch,
  latestDetailsRef,
  refreshDetails,
  refreshPacks,
  setSelectedPackId,
}: {
  event: TelegramEvent;
  dispatch: Dispatch;
  latestDetailsRef: React.RefObject<StickerPackDetails | null>;
  refreshDetails: (packId: string) => Promise<StickerPackDetails>;
  refreshPacks: () => Promise<StickerPack[]>;
  setSelectedPackId: React.Dispatch<React.SetStateAction<string | null>>;
}) {
  const handledWithEarlyReturn = telegramEventHandlers[event.type]?.(
    event as never,
    { dispatch, refreshPacks, setSelectedPackId },
  );
  if (handledWithEarlyReturn) return;

  if (telegramPackRefreshEventTypes.has(event.type)) void refreshPacks();
  refreshSelectedPackDetails(event, latestDetailsRef, refreshDetails);
}

function useTelegramSubscription({
  latestDetailsRef,
  refreshDetails,
  refreshPacks,
  setSelectedPackId,
  showTelegramError,
  dispatch,
}: {
  latestDetailsRef: React.RefObject<StickerPackDetails | null>;
  refreshDetails: (packId: string) => Promise<StickerPackDetails>;
  refreshPacks: () => Promise<StickerPack[]>;
  setSelectedPackId: React.Dispatch<React.SetStateAction<string | null>>;
  showTelegramError: (title: string, message: string) => void;
  dispatch: Dispatch;
}) {
  useEffect(() => {
    let active = true;
    void window.stickerSmith.telegram
      .getState()
      .then(
        (nextTelegramState) =>
          active &&
          dispatch({
            type: "startup_succeeded",
            state: nextTelegramState,
          }),
      )
      .catch(
        (error) =>
          active &&
          showTelegramError(
            "Telegram startup failed",
            (error as Error)?.message ?? "Telegram startup failed.",
          ),
      );

    const unsub = window.stickerSmith.telegram.subscribe((event) =>
      handleTelegramEvent({
        event,
        dispatch,
        latestDetailsRef,
        refreshDetails,
        refreshPacks,
        setSelectedPackId,
      }),
    );
    return () => {
      active = false;
      unsub();
    };
  }, [
    dispatch,
    latestDetailsRef,
    refreshDetails,
    refreshPacks,
    setSelectedPackId,
    showTelegramError,
  ]);
}

function useTelegramActionRunner(
  showTelegramError: (title: string, message: string) => void,
): TelegramActionRunner {
  return useCallback(
    async (action, errorTitle, fallbackMessage, onSuccess) => {
      try {
        const next = await action();
        await onSuccess?.(next);
        return next;
      } catch (error) {
        showTelegramError(
          errorTitle,
          (error as Error)?.message ?? fallbackMessage,
        );
        return null;
      }
    },
    [showTelegramError],
  );
}

function useTelegramAuthActions(
  runTelegramAction: TelegramActionRunner,
  dispatch: Dispatch,
  refreshPacks: () => Promise<StickerPack[]>,
) {
  return {
    submitTelegramTdlibParameters: useCallback(
      (input: { apiId: string; apiHash: string }) =>
        runTelegramAction(
          () => window.stickerSmith.telegram.submitTdlibParameters(input),
          "Telegram login failed",
          "Telegram login failed.",
          (next) => dispatch({ type: "startup_succeeded", state: next }),
        ),
      [dispatch, runTelegramAction],
    ),
    submitTelegramPhoneNumber: useCallback(
      (input: { phoneNumber: string }) =>
        runTelegramAction(
          () => window.stickerSmith.telegram.submitPhoneNumber(input),
          "Telegram login failed",
          "Telegram login failed.",
          (next) => dispatch({ type: "startup_succeeded", state: next }),
        ),
      [dispatch, runTelegramAction],
    ),
    submitTelegramCode: useCallback(
      (input: { code: string }) =>
        runTelegramAction(
          () => window.stickerSmith.telegram.submitCode(input),
          "Telegram login failed",
          "Telegram login failed.",
          (next) => dispatch({ type: "startup_succeeded", state: next }),
        ),
      [dispatch, runTelegramAction],
    ),
    submitTelegramPassword: useCallback(
      (input: { password: string }) =>
        runTelegramAction(
          () => window.stickerSmith.telegram.submitPassword(input),
          "Telegram login failed",
          "Telegram login failed.",
          (next) => dispatch({ type: "startup_succeeded", state: next }),
        ),
      [dispatch, runTelegramAction],
    ),
    logoutTelegram: useCallback(
      () =>
        runTelegramAction(
          () => window.stickerSmith.telegram.logout(),
          "Telegram logout failed",
          "Telegram logout failed.",
          (next) => dispatch({ type: "startup_succeeded", state: next }),
        ),
      [dispatch, runTelegramAction],
    ),
    resetTelegram: useCallback(
      () =>
        runTelegramAction(
          () => window.stickerSmith.telegram.reset(),
          "Telegram reset failed",
          "Telegram reset failed.",
          async (next) => {
            dispatch({ type: "startup_succeeded", state: next });
            dispatch({ type: "sync_finished" });
            await refreshPacks();
          },
        ),
      [dispatch, refreshPacks, runTelegramAction],
    ),
  };
}

function useTelegramPackActions({
  dispatch,
  refreshDetails,
  refreshDetailsSafely,
  refreshPacks,
  showTelegramError,
}: {
  dispatch: Dispatch;
  refreshDetails: (packId: string) => Promise<StickerPackDetails>;
  refreshDetailsSafely: (packId: string) => Promise<StickerPackDetails | null>;
  refreshPacks: () => Promise<StickerPack[]>;
  showTelegramError: (title: string, message: string) => void;
}) {
  const syncTelegramPacks = useCallback(async () => {
    dispatch({ type: "sync_started" });
    try {
      await window.stickerSmith.telegram.syncOwnedPacks();
      dispatch({ type: "sync_recommended", value: false });
      await refreshPacks();
    } catch (error) {
      showTelegramError(
        "Telegram sync failed",
        (error as Error)?.message ?? "Telegram sync failed.",
      );
      throw error;
    } finally {
      dispatch({ type: "sync_finished" });
    }
  }, [dispatch, refreshPacks, showTelegramError]);

  return {
    syncTelegramPacks,
    publishLocalPack: useCallback(
      async (input: { packId: string; title: string; shortName: string }) => {
        try {
          await window.stickerSmith.telegram.publishLocalPack(input);
          await refreshPacks();
        } catch (error) {
          showTelegramError(
            "Telegram upload failed",
            (error as Error)?.message ?? "Telegram upload failed.",
          );
          throw error;
        }
      },
      [refreshPacks, showTelegramError],
    ),
    updateTelegramPack: useCallback(
      async (input: { packId: string }) => {
        try {
          await window.stickerSmith.telegram.updateTelegramPack(input);
          await Promise.all([refreshPacks(), refreshDetails(input.packId)]);
        } catch (error) {
          showTelegramError(
            "Telegram update failed",
            (error as Error)?.message ?? "Telegram update failed.",
          );
          throw error;
        }
      },
      [refreshDetails, refreshPacks, showTelegramError],
    ),
    downloadTelegramPackMedia: useCallback(
      async (input: { packId: string }) => {
        try {
          await window.stickerSmith.telegram.downloadPackMedia(input);
          await refreshDetailsSafely(input.packId);
        } catch (error) {
          showTelegramError(
            "Telegram media download failed",
            (error as Error)?.message ?? "Telegram media download failed.",
          );
          throw error;
        }
      },
      [refreshDetailsSafely, showTelegramError],
    ),
  };
}

function getAutoSyncAccountKey(telegramState: TelegramState | null) {
  if (
    telegramState?.status !== "connected" ||
    telegramState.authStep !== "ready"
  )
    return null;
  return telegramState.sessionUser?.id
    ? String(telegramState.sessionUser.id)
    : "connected";
}

function triggerAutoTelegramSyncOnce(options: {
  accountKey: string | null;
  syncedAccountRef: React.MutableRefObject<string | null>;
  syncTelegramPacks: () => Promise<void>;
}) {
  if (!options.accountKey) {
    options.syncedAccountRef.current = null;
    return;
  }
  if (options.syncedAccountRef.current === options.accountKey) return;

  options.syncedAccountRef.current = options.accountKey;
  void options.syncTelegramPacks().catch(() => undefined);
}

function useAutoTelegramSync(
  telegramState: TelegramState | null,
  syncTelegramPacks: () => Promise<void>,
) {
  const autoSyncedTelegramAccountRef = useRef<string | null>(null);
  useEffect(() => {
    triggerAutoTelegramSyncOnce({
      accountKey: getAutoSyncAccountKey(telegramState),
      syncedAccountRef: autoSyncedTelegramAccountRef,
      syncTelegramPacks,
    });
  }, [syncTelegramPacks, telegramState]);
}

export function useTelegramState({
  latestDetailsRef,
  refreshDetails,
  refreshDetailsSafely,
  refreshPacks,
  setSelectedPackId,
}: {
  latestDetailsRef: React.RefObject<StickerPackDetails | null>;
  refreshDetails: (packId: string) => Promise<StickerPackDetails>;
  refreshDetailsSafely: (packId: string) => Promise<StickerPackDetails | null>;
  refreshPacks: () => Promise<StickerPack[]>;
  setSelectedPackId: React.Dispatch<React.SetStateAction<string | null>>;
}) {
  const [state, dispatch] = useReducer(
    reduceTelegramUiState,
    undefined,
    createInitialTelegramUiState,
  );
  const showTelegramError = useCallback(
    (title: string, message: string) =>
      dispatch({ type: "show_error", title, message }),
    [],
  );
  const dismissTelegramErrorDialog = useCallback(
    () => dispatch({ type: "dismiss_error" }),
    [],
  );
  const runTelegramAction = useTelegramActionRunner(showTelegramError);
  const authActions = useTelegramAuthActions(
    runTelegramAction,
    dispatch,
    refreshPacks,
  );
  const packActions = useTelegramPackActions({
    dispatch,
    refreshDetails,
    refreshDetailsSafely,
    refreshPacks,
    showTelegramError,
  });

  useTelegramSubscription({
    latestDetailsRef,
    refreshDetails,
    refreshPacks,
    setSelectedPackId,
    showTelegramError,
    dispatch,
  });
  useAutoTelegramSync(state.telegramState, packActions.syncTelegramPacks);

  return {
    dismissTelegramErrorDialog,
    ...authActions,
    ...packActions,
    ...state,
  };
}
