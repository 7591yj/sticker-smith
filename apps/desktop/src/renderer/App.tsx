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

export function App() {
  const {
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
    telegramConnected,
    telegramErrorDialog,
    telegramPublishingPackIds,
    telegramState,
    telegramSyncInProgress,
    telegramSyncRecommended,
    telegramUpdatingPackIds,
    updateTelegramPack,
  } = useDesktopAppState();

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
        <Sidebar
          packs={packs}
          telegramState={telegramState}
          telegramSyncInProgress={telegramSyncInProgress}
          telegramSyncRecommended={telegramSyncRecommended}
          selectedPackId={selectedPackId}
          onSelect={setSelectedPackId}
          onSubmitTelegramTdlibParameters={submitTelegramTdlibParameters}
          onSubmitTelegramPhoneNumber={submitTelegramPhoneNumber}
          onSubmitTelegramCode={submitTelegramCode}
          onSubmitTelegramPassword={submitTelegramPassword}
          onLogoutTelegram={logoutTelegram}
          onResetTelegram={resetTelegram}
          onSyncTelegramPacks={syncTelegramPacks}
          refreshPacks={refreshPacks}
          setSelectedPackId={setSelectedPackId}
        />
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
            converting={converting}
            telegramConnected={telegramConnected}
            telegramPublishing={
              details?.pack.source === "local"
                ? telegramPublishingPackIds.includes(details.pack.id)
                : false
            }
            telegramUpdating={
              details?.pack.source === "telegram"
                ? telegramUpdatingPackIds.includes(details.pack.id)
                : false
            }
            setDetails={setDetails}
            refreshDetails={refreshDetails}
            refreshPacks={refreshPacks}
            setSelectedPackId={setSelectedPackId}
            onPublishLocalPack={publishLocalPack}
            onDownloadTelegramPackMedia={downloadTelegramPackMedia}
            onUpdateTelegramPack={updateTelegramPack}
          />
          <ConversionStatus events={conversionEvents} converting={converting} />
        </Box>
      </Box>
      <ConversionFailureDialog
        open={failureDialog !== null}
        packName={failureDialog?.packName ?? null}
        successCount={failureDialog?.successCount ?? 0}
        failureCount={failureDialog?.failureCount ?? 0}
        failures={failureDialog?.failures ?? []}
        onClose={dismissFailureDialog}
      />
      <TelegramErrorDialog
        open={telegramErrorDialog !== null}
        title={telegramErrorDialog?.title ?? "Telegram request failed"}
        message={telegramErrorDialog?.message ?? "Telegram request failed."}
        onClose={dismissTelegramErrorDialog}
      />
    </ThemeProvider>
  );
}
