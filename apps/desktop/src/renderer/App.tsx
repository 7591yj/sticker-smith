import {
  useCallback,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import Box from "@mui/material/Box";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { ConversionFailureDialog } from "./components/ConversionFailureDialog";
import { ConversionStatus } from "./components/ConversionStatus";
import { PackPanel } from "./components/PackPanel";
import { Sidebar } from "./components/Sidebar";
import { SyncWarningDialog } from "./components/SyncWarningDialog";
import { TelegramErrorDialog } from "./components/TelegramErrorDialog";
import { useDesktopAppState } from "./hooks/useDesktopAppState";
import { appTheme } from "./theme";
import { appTokens } from "../theme/appTokens";

const sidebarResize = {
  minWidth: 200,
  maxWidth: 460,
} as const;

function clampSidebarWidth(width: number) {
  return Math.min(
    Math.max(width, sidebarResize.minWidth),
    sidebarResize.maxWidth,
  );
}

type DesktopAppState = ReturnType<typeof useDesktopAppState>;

function useResizableSidebarWidth() {
  const [sidebarWidth, setSidebarWidth] = useState<number>(
    appTokens.layout.sidebarWidth,
  );

  const handleSidebarResizeStart = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = sidebarWidth;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        setSidebarWidth(
          clampSidebarWidth(startWidth + moveEvent.clientX - startX),
        );
      };

      const handleMouseUp = () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [sidebarWidth],
  );

  const handleSidebarResizeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? 24 : 8;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setSidebarWidth((width) => clampSidebarWidth(width - step));
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setSidebarWidth((width) => clampSidebarWidth(width + step));
      }
      if (event.key === "Home") {
        event.preventDefault();
        setSidebarWidth(sidebarResize.minWidth);
      }
      if (event.key === "End") {
        event.preventDefault();
        setSidebarWidth(sidebarResize.maxWidth);
      }
    },
    [],
  );

  return { handleSidebarResizeKeyDown, handleSidebarResizeStart, sidebarWidth };
}

function ResizeHandle({
  width,
  onResizeKeyDown,
  onResizeStart,
}: {
  width: number;
  onResizeKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  onResizeStart: (event: ReactMouseEvent<HTMLDivElement>) => void;
}) {
  return (
    <Box
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuemin={sidebarResize.minWidth}
      aria-valuemax={sidebarResize.maxWidth}
      aria-valuenow={Math.round(width)}
      tabIndex={0}
      onKeyDown={onResizeKeyDown}
      onMouseDown={onResizeStart}
      sx={{
        width: 4,
        ml: "-2px",
        mr: "-2px",
        flexShrink: 0,
        cursor: "col-resize",
        bgcolor: "transparent",
        zIndex: 2,
        WebkitAppRegion: "no-drag",
        "&:hover, &:focus-visible": {
          bgcolor: "primary.main",
        },
        "&:focus-visible": {
          outline: "2px solid",
          outlineColor: "primary.main",
          outlineOffset: -2,
        },
      }}
    />
  );
}

function AppSidebar({
  appState,
  width,
  onSyncTelegramPacks,
}: {
  appState: DesktopAppState;
  width: number;
  onSyncTelegramPacks: () => Promise<unknown>;
}) {
  return (
    <Sidebar
      packs={appState.packs}
      telegramState={appState.telegramState}
      telegramSyncInProgress={appState.telegramSyncInProgress}
      telegramSyncRecommended={appState.telegramSyncRecommended}
      selectedPackId={appState.selectedPackId}
      width={width}
      onSelect={appState.setSelectedPackId}
      onSubmitTelegramTdlibParameters={appState.submitTelegramTdlibParameters}
      onSubmitTelegramPhoneNumber={appState.submitTelegramPhoneNumber}
      onSubmitTelegramCode={appState.submitTelegramCode}
      onSubmitTelegramPassword={appState.submitTelegramPassword}
      onLogoutTelegram={appState.logoutTelegram}
      onResetTelegram={appState.resetTelegram}
      onSyncTelegramPacks={onSyncTelegramPacks}
      refreshPacks={appState.refreshPacks}
      setSelectedPackId={appState.setSelectedPackId}
    />
  );
}

function MainPanel({ appState }: { appState: DesktopAppState }) {
  const { details } = appState;

  return (
    <Box
      sx={{
        flex: 1,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <PackPanel
        details={details}
        converting={appState.converting}
        telegramConnected={appState.telegramConnected}
        telegramPublishing={isPackActionInProgress(
          details,
          "local",
          appState.telegramPublishingPackIds,
        )}
        telegramUpdating={isPackActionInProgress(
          details,
          "telegram",
          appState.telegramUpdatingPackIds,
        )}
        setDetails={appState.setDetails}
        refreshDetails={appState.refreshDetails}
        refreshPacks={appState.refreshPacks}
        setSelectedPackId={appState.setSelectedPackId}
        onPublishLocalPack={appState.publishLocalPack}
        onDownloadTelegramPackMedia={appState.downloadTelegramPackMedia}
        onUpdateTelegramPack={appState.updateTelegramPack}
      />
      <ConversionStatus
        events={appState.conversionEvents}
        converting={appState.converting}
      />
    </Box>
  );
}

function isPackActionInProgress(
  details: DesktopAppState["details"],
  source: "local" | "telegram",
  packIds: readonly string[],
) {
  return details?.pack.source === source ? packIds.includes(details.pack.id) : false;
}

function AppDialogs({
  appState,
  syncWarning,
  onConfirmSync,
  onDismissSyncWarning,
}: {
  appState: DesktopAppState;
  syncWarning: { packs: { packId: string; name: string }[] } | null;
  onConfirmSync: () => void;
  onDismissSyncWarning: () => void;
}) {
  return (
    <>
      <AppConversionFailureDialog appState={appState} />
      <AppTelegramErrorDialog appState={appState} />
      <SyncWarningDialog
        open={syncWarning !== null}
        packs={syncWarning?.packs ?? []}
        onConfirm={onConfirmSync}
        onCancel={onDismissSyncWarning}
      />
    </>
  );
}

function AppConversionFailureDialog({
  appState,
}: {
  appState: DesktopAppState;
}) {
  const { failureDialog } = appState;

  return (
    <ConversionFailureDialog
      open={failureDialog !== null}
      packName={failureDialog?.packName ?? null}
      successCount={failureDialog?.successCount ?? 0}
      failureCount={failureDialog?.failureCount ?? 0}
      failures={failureDialog?.failures ?? []}
      onClose={appState.dismissFailureDialog}
    />
  );
}

function AppTelegramErrorDialog({ appState }: { appState: DesktopAppState }) {
  const { telegramErrorDialog } = appState;

  return (
    <TelegramErrorDialog
      open={telegramErrorDialog !== null}
      title={telegramErrorDialog?.title ?? "Telegram request failed"}
      message={telegramErrorDialog?.message ?? "Telegram request failed."}
      onClose={appState.dismissTelegramErrorDialog}
    />
  );
}

export function App() {
  const appState = useDesktopAppState();
  const {
    handleSidebarResizeKeyDown,
    handleSidebarResizeStart,
    sidebarWidth,
  } = useResizableSidebarWidth();
  const [syncWarning, setSyncWarning] = useState<{
    packs: { packId: string; name: string }[];
  } | null>(null);

  const handleSyncTelegramPacks = useCallback(async () => {
    const pending = await window.stickerSmith.telegram.getPacksWithPendingEdits();
    if (pending.length > 0) {
      setSyncWarning({ packs: pending });
      return;
    }
    await appState.syncTelegramPacks();
  }, [appState.syncTelegramPacks]);

  const handleConfirmSync = useCallback(() => {
    setSyncWarning(null);
    void appState.syncTelegramPacks().catch(() => undefined);
  }, [appState.syncTelegramPacks]);

  const handleDismissSyncWarning = useCallback(() => {
    setSyncWarning(null);
  }, []);

  return (
    <ThemeProvider theme={appTheme}>
      <CssBaseline />
      <Box
        sx={{
          display: "flex",
          height: "100vh",
          overflow: "hidden",
          bgcolor: "background.default",
        }}
      >
        <AppSidebar
          appState={appState}
          width={sidebarWidth}
          onSyncTelegramPacks={handleSyncTelegramPacks}
        />
        <ResizeHandle
          width={sidebarWidth}
          onResizeKeyDown={handleSidebarResizeKeyDown}
          onResizeStart={handleSidebarResizeStart}
        />
        <MainPanel appState={appState} />
      </Box>
      <AppDialogs
        appState={appState}
        syncWarning={syncWarning}
        onConfirmSync={handleConfirmSync}
        onDismissSyncWarning={handleDismissSyncWarning}
      />
    </ThemeProvider>
  );
}
