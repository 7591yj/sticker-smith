import { useConversionState } from "./useConversionState";
import { usePackSelection } from "./usePackSelection";
import { useTelegramState } from "./useTelegramState";

export function useDesktopAppState() {
  const {
    details,
    latestDetailsRef,
    packs,
    refreshDetails,
    refreshDetailsSafely,
    refreshPacks,
    selectedPackId,
    setDetails,
    setSelectedPackId,
  } = usePackSelection();

  const { conversionEvents, converting, dismissFailureDialog, failureDialog } =
    useConversionState({ latestDetailsRef, refreshDetails });

  const {
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
  } = useTelegramState({
    latestDetailsRef,
    refreshDetails,
    refreshDetailsSafely,
    refreshPacks,
    setSelectedPackId,
  });

  return {
    conversionEvents,
    converting,
    details,
    dismissFailureDialog,
    dismissTelegramErrorDialog,
    downloadTelegramPackMedia,
    failureDialog,
    logoutTelegram,
    packs,
    publishLocalPack,
    refreshDetails,
    refreshPacks,
    resetTelegram,
    selectedPackId,
    setDetails,
    setSelectedPackId,
    submitTelegramCode,
    submitTelegramPassword,
    submitTelegramPhoneNumber,
    submitTelegramTdlibParameters,
    syncTelegramPacks,
    telegramConnected:
      telegramState?.status === "connected" &&
      telegramState.authStep === "ready",
    telegramErrorDialog,
    telegramPublishingPackIds,
    telegramState,
    telegramSyncInProgress,
    telegramSyncRecommended,
    telegramUpdatingPackIds,
    updateTelegramPack,
  };
}
