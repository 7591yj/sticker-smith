import { useCallback, useState, type MouseEvent as ReactMouseEvent } from "react";
import Box from "@mui/material/Box";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { ConversionFailureDialog } from "./components/ConversionFailureDialog";
import { ConversionStatus } from "./components/ConversionStatus";
import { PackPanel } from "./components/PackPanel";
import { Sidebar } from "./components/Sidebar";
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

  return { handleSidebarResizeStart, sidebarWidth };
}

function ResizeHandle({
  onResizeStart,
}: {
  onResizeStart: (event: ReactMouseEvent<HTMLDivElement>) => void;
}) {
  return (
    <Box
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
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
        "&:hover": {
          bgcolor: "action.hover",
        },
      }}
    />
  );
}

function AppSidebar({
  appState,
  width,
}: {
  appState: DesktopAppState;
  width: number;
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
      onSyncTelegramPacks={appState.syncTelegramPacks}
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

function AppDialogs({ appState }: { appState: DesktopAppState }) {
  return (
    <>
      <AppConversionFailureDialog appState={appState} />
      <AppTelegramErrorDialog appState={appState} />
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
  const { handleSidebarResizeStart, sidebarWidth } = useResizableSidebarWidth();

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
        <AppSidebar appState={appState} width={sidebarWidth} />
        <ResizeHandle onResizeStart={handleSidebarResizeStart} />
        <MainPanel appState={appState} />
      </Box>
      <AppDialogs appState={appState} />
    </ThemeProvider>
  );
}
