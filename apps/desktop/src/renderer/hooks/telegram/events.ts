import { useEffect } from "react";
import type {
  StickerPack,
  StickerPackDetails,
  TelegramEvent,
} from "@sticker-smith/shared";
import type { TelegramDispatch } from "./types";

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
  dispatch: TelegramDispatch;
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
  dispatch: TelegramDispatch;
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

export function useTelegramSubscription({
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
  dispatch: TelegramDispatch;
}) {
  useEffect(() => {
    let active = true;
    void window.stickerSmith.telegram
      .getState()
      .then(
        (nextTelegramState) =>
          active &&
          dispatch({ type: "startup_succeeded", state: nextTelegramState }),
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
