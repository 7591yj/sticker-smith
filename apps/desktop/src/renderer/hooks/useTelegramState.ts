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

function reduceTelegramUiState(
  state: TelegramUiState,
  action: TelegramUiAction,
): TelegramUiState {
  switch (action.type) {
    case "startup_succeeded":
      return {
        ...state,
        telegramState: action.state,
      };
    case "show_error":
      return {
        ...state,
        telegramErrorDialog: {
          title: action.title,
          message: action.message,
        },
      };
    case "dismiss_error":
      return {
        ...state,
        telegramErrorDialog: null,
      };
    case "auth_state_changed":
      return action.state.status === "connected"
        ? {
            ...state,
            telegramState: action.state,
          }
        : resetTransientState({
            ...state,
            telegramState: action.state,
          });
    case "sync_started":
      return {
        ...state,
        telegramSyncInProgress: true,
      };
    case "sync_finished":
      return {
        ...state,
        telegramSyncInProgress: false,
        telegramSyncRecommended: false,
      };
    case "publish_started":
      return {
        ...state,
        telegramPublishingPackIds: addTrackedPackId(
          state.telegramPublishingPackIds,
          action.packId,
        ),
      };
    case "publish_failed":
      return {
        ...state,
        telegramPublishingPackIds: removeTrackedPackId(
          state.telegramPublishingPackIds,
          action.packId,
        ),
        telegramErrorDialog: {
          title: "Telegram upload failed",
          message: action.error,
        },
      };
    case "publish_finished":
      return {
        ...state,
        telegramPublishingPackIds: removeTrackedPackId(
          state.telegramPublishingPackIds,
          action.packId,
        ),
        telegramSyncRecommended: true,
      };
    case "update_started":
      return {
        ...state,
        telegramUpdatingPackIds: addTrackedPackId(
          state.telegramUpdatingPackIds,
          action.packId,
        ),
      };
    case "update_failed":
      return {
        ...state,
        telegramUpdatingPackIds: removeTrackedPackId(
          state.telegramUpdatingPackIds,
          action.packId,
        ),
        telegramErrorDialog: {
          title: "Telegram update failed",
          message: action.error,
        },
      };
    case "update_finished":
      return {
        ...state,
        telegramUpdatingPackIds: removeTrackedPackId(
          state.telegramUpdatingPackIds,
          action.packId,
        ),
      };
    case "sync_recommended":
      return {
        ...state,
        telegramSyncRecommended: action.value,
      };
  }
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
  const [
    {
      telegramErrorDialog,
      telegramPublishingPackIds,
      telegramState,
      telegramSyncInProgress,
      telegramSyncRecommended,
      telegramUpdatingPackIds,
    },
    dispatch,
  ] = useReducer(reduceTelegramUiState, undefined, createInitialTelegramUiState);
  const autoSyncedTelegramAccountRef = useRef<string | null>(null);

  const showTelegramError = useCallback((title: string, message: string) => {
    dispatch({ type: "show_error", title, message });
  }, []);

  const dismissTelegramErrorDialog = useCallback(() => {
    dispatch({ type: "dismiss_error" });
  }, []);

  const runTelegramAction = useCallback(
    async <T,>(
      action: () => Promise<T>,
      errorTitle: string,
      fallbackMessage: string,
      onSuccess?: (next: T) => Promise<void> | void,
    ) => {
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

  useEffect(() => {
    let active = true;

    void window.stickerSmith.telegram
      .getState()
      .then((nextTelegramState) => {
        if (active) {
          dispatch({ type: "startup_succeeded", state: nextTelegramState });
        }
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        showTelegramError(
          "Telegram startup failed",
          (error as Error)?.message ?? "Telegram startup failed.",
        );
      });

    const unsub = window.stickerSmith.telegram.subscribe((event) => {
      if (event.type === "auth_state_changed") {
        dispatch({ type: "auth_state_changed", state: event.state });
        void refreshPacks();
        return;
      }

      if (event.type === "sync_started") {
        dispatch({ type: "sync_started" });
        return;
      }

      if (event.type === "publish_started") {
        dispatch({ type: "publish_started", packId: event.localPackId });
        return;
      }

      if (event.type === "pack_sync_failed") {
        dispatch({
          type: "show_error",
          title: "Telegram sync failed",
          message: event.error,
        });
      }

      if (event.type === "publish_failed") {
        dispatch({
          type: "publish_failed",
          packId: event.localPackId,
          error: event.error,
        });
        return;
      }

      if (event.type === "update_started") {
        dispatch({ type: "update_started", packId: event.packId });
      }

      if (event.type === "update_failed") {
        dispatch({
          type: "update_failed",
          packId: event.packId,
          error: event.error,
        });
      }

      if (event.type === "publish_finished") {
        dispatch({ type: "publish_finished", packId: event.localPackId });
        void refreshPacks().then((nextPacks) => {
          setSelectedPackId(
            nextPacks.find((pack) => pack.id === event.packId)?.id ?? event.packId,
          );
        });
        return;
      }

      if (
        event.type === "sync_finished" ||
        event.type === "pack_sync_started" ||
        event.type === "pack_sync_completed" ||
        event.type === "pack_sync_failed" ||
        event.type === "update_started" ||
        event.type === "update_finished" ||
        event.type === "update_failed"
      ) {
        if (event.type === "sync_finished") {
          dispatch({ type: "sync_finished" });
        }
        if (event.type === "update_finished") {
          dispatch({ type: "update_finished", packId: event.packId });
        }
        void refreshPacks();
      }

      if (
        (event.type === "pack_sync_started" ||
          event.type === "pack_sync_completed" ||
          event.type === "pack_sync_failed" ||
          event.type === "file_download_progress" ||
          event.type === "update_started" ||
          event.type === "update_finished" ||
          event.type === "update_failed") &&
        event.packId &&
        latestDetailsRef.current?.pack.id === event.packId
      ) {
        void refreshDetails(event.packId);
      }
    });

    return () => {
      active = false;
      unsub();
    };
  }, [latestDetailsRef, refreshDetails, refreshPacks, setSelectedPackId, showTelegramError]);

  const submitTelegramTdlibParameters = useCallback(
    async (input: { apiId: string; apiHash: string }) =>
      runTelegramAction(
        () => window.stickerSmith.telegram.submitTdlibParameters(input),
        "Telegram login failed",
        "Telegram login failed.",
        (next) => dispatch({ type: "startup_succeeded", state: next }),
      ),
    [runTelegramAction],
  );

  const submitTelegramPhoneNumber = useCallback(
    async (input: { phoneNumber: string }) =>
      runTelegramAction(
        () => window.stickerSmith.telegram.submitPhoneNumber(input),
        "Telegram login failed",
        "Telegram login failed.",
        (next) => dispatch({ type: "startup_succeeded", state: next }),
      ),
    [runTelegramAction],
  );

  const submitTelegramCode = useCallback(
    async (input: { code: string }) =>
      runTelegramAction(
        () => window.stickerSmith.telegram.submitCode(input),
        "Telegram login failed",
        "Telegram login failed.",
        (next) => dispatch({ type: "startup_succeeded", state: next }),
      ),
    [runTelegramAction],
  );

  const submitTelegramPassword = useCallback(
    async (input: { password: string }) =>
      runTelegramAction(
        () => window.stickerSmith.telegram.submitPassword(input),
        "Telegram login failed",
        "Telegram login failed.",
        (next) => dispatch({ type: "startup_succeeded", state: next }),
      ),
    [runTelegramAction],
  );

  const logoutTelegram = useCallback(
    async () =>
      runTelegramAction(
        () => window.stickerSmith.telegram.logout(),
        "Telegram logout failed",
        "Telegram logout failed.",
        (next) => dispatch({ type: "startup_succeeded", state: next }),
      ),
    [runTelegramAction],
  );

  const resetTelegram = useCallback(
    async () =>
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
    [refreshPacks, runTelegramAction],
  );

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
  }, [refreshPacks, showTelegramError]);

  const publishLocalPack = useCallback(
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
  );

  const updateTelegramPack = useCallback(
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
  );

  const downloadTelegramPackMedia = useCallback(
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
  );

  useEffect(() => {
    if (telegramState?.status !== "connected" || telegramState.authStep !== "ready") {
      autoSyncedTelegramAccountRef.current = null;
      return;
    }

    const accountKey = telegramState.sessionUser?.id
      ? String(telegramState.sessionUser.id)
      : "connected";

    if (autoSyncedTelegramAccountRef.current === accountKey) {
      return;
    }

    autoSyncedTelegramAccountRef.current = accountKey;
    void syncTelegramPacks().catch(() => undefined);
  }, [syncTelegramPacks, telegramState]);

  return {
    dismissTelegramErrorDialog,
    downloadTelegramPackMedia,
    logoutTelegram,
    publishLocalPack,
    resetTelegram,
    submitTelegramCode,
    submitTelegramPassword,
    submitTelegramPhoneNumber,
    submitTelegramTdlibParameters,
    syncTelegramPacks,
    telegramErrorDialog,
    telegramPublishingPackIds,
    telegramState,
    telegramSyncInProgress,
    telegramSyncRecommended,
    telegramUpdatingPackIds,
    updateTelegramPack,
  };
}
