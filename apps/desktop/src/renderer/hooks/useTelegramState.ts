import { useCallback, useReducer } from "react";
import {
  useTelegramActionRunner,
  useTelegramAuthActions,
  useTelegramPackActions,
} from "./telegram/actions";
import { useAutoTelegramSync } from "./telegram/autoSync";
import { useTelegramSubscription } from "./telegram/events";
import {
  createInitialTelegramUiState,
  reduceTelegramUiState,
} from "./telegram/reducer";
import type { UseTelegramStateInput } from "./telegram/types";

export function useTelegramState({
  latestDetailsRef,
  refreshDetails,
  refreshDetailsSafely,
  refreshPacks,
  setSelectedPackId,
}: UseTelegramStateInput) {
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
