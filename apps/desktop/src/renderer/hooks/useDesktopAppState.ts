import { useConversionState } from "./useConversionState";
import { usePackSelection } from "./usePackSelection";
import { useTelegramState } from "./useTelegramState";

type PackSelectionState = ReturnType<typeof usePackSelection>;
type ConversionState = ReturnType<typeof useConversionState>;
type TelegramState = ReturnType<typeof useTelegramState>;

type DesktopStateParts = {
  conversion: ConversionState;
  packs: PackSelectionState;
  telegram: TelegramState;
};

function useDesktopStateParts(): DesktopStateParts {
  const packs = usePackSelection();
  const conversion = useConversionState({
    latestDetailsRef: packs.latestDetailsRef,
    refreshDetails: packs.refreshDetails,
  });
  const telegram = useTelegramState({
    latestDetailsRef: packs.latestDetailsRef,
    refreshDetails: packs.refreshDetails,
    refreshDetailsSafely: packs.refreshDetailsSafely,
    refreshPacks: packs.refreshPacks,
    setSelectedPackId: packs.setSelectedPackId,
  });

  return { conversion, packs, telegram };
}

function isTelegramConnected({ telegramState }: TelegramState) {
  return telegramState?.status === "connected" && telegramState.authStep === "ready";
}

function buildDesktopAppState({ conversion, packs, telegram }: DesktopStateParts) {
  return {
    ...conversion,
    details: packs.details,
    ...telegram,
    packs: packs.packs,
    refreshDetails: packs.refreshDetails,
    refreshPacks: packs.refreshPacks,
    selectedPackId: packs.selectedPackId,
    setDetails: packs.setDetails,
    setSelectedPackId: packs.setSelectedPackId,
    telegramConnected: isTelegramConnected(telegram),
  };
}

export function useDesktopAppState() {
  return buildDesktopAppState(useDesktopStateParts());
}
