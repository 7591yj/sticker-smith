import { useCallback } from "react";
import type { StickerPack, StickerPackDetails } from "@sticker-smith/shared";
import type { TelegramActionRunner, TelegramDispatch } from "./types";

export function useTelegramActionRunner(
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

export function useTelegramAuthActions(
  runTelegramAction: TelegramActionRunner,
  dispatch: TelegramDispatch,
  refreshPacks: () => Promise<StickerPack[]>,
) {
  const dispatchStartupSucceeded = useCallback(
    (next: Awaited<ReturnType<typeof window.stickerSmith.telegram.getState>>) =>
      dispatch({ type: "startup_succeeded", state: next }),
    [dispatch],
  );

  return {
    submitTelegramTdlibParameters: useCallback(
      (input: { apiId: string; apiHash: string }) =>
        runTelegramAction(
          () => window.stickerSmith.telegram.submitTdlibParameters(input),
          "Telegram login failed",
          "Telegram login failed.",
          dispatchStartupSucceeded,
        ),
      [dispatchStartupSucceeded, runTelegramAction],
    ),
    submitTelegramPhoneNumber: useCallback(
      (input: { phoneNumber: string }) =>
        runTelegramAction(
          () => window.stickerSmith.telegram.submitPhoneNumber(input),
          "Telegram login failed",
          "Telegram login failed.",
          dispatchStartupSucceeded,
        ),
      [dispatchStartupSucceeded, runTelegramAction],
    ),
    submitTelegramCode: useCallback(
      (input: { code: string }) =>
        runTelegramAction(
          () => window.stickerSmith.telegram.submitCode(input),
          "Telegram login failed",
          "Telegram login failed.",
          dispatchStartupSucceeded,
        ),
      [dispatchStartupSucceeded, runTelegramAction],
    ),
    submitTelegramPassword: useCallback(
      (input: { password: string }) =>
        runTelegramAction(
          () => window.stickerSmith.telegram.submitPassword(input),
          "Telegram login failed",
          "Telegram login failed.",
          dispatchStartupSucceeded,
        ),
      [dispatchStartupSucceeded, runTelegramAction],
    ),
    logoutTelegram: useCallback(
      () =>
        runTelegramAction(
          () => window.stickerSmith.telegram.logout(),
          "Telegram logout failed",
          "Telegram logout failed.",
          dispatchStartupSucceeded,
        ),
      [dispatchStartupSucceeded, runTelegramAction],
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

export function useTelegramPackActions({
  dispatch,
  refreshDetails,
  refreshDetailsSafely,
  refreshPacks,
  showTelegramError,
}: {
  dispatch: TelegramDispatch;
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
