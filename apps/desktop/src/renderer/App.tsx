import { useCallback, useEffect, useRef, useState } from "react";
import CssBaseline from "@mui/material/CssBaseline";
import Box from "@mui/material/Box";
import { ThemeProvider } from "@mui/material/styles";
import type {
  ConversionJobEvent,
  TelegramState,
  StickerPack,
  StickerPackDetails,
} from "@sticker-smith/shared";
import { ConversionFailureDialog } from "./components/ConversionFailureDialog";
import { ConversionStatus } from "./components/ConversionStatus";
import { PackPanel } from "./components/PackPanel";
import { Sidebar } from "./components/Sidebar";
import { appTheme } from "./theme";

interface ConversionFailureDialogState {
  packName: string | null;
  successCount: number;
  failureCount: number;
  failures: Array<{
    assetLabel: string;
    error: string;
    mode?: ConversionJobEvent["mode"];
  }>;
}

export function App() {
  const [packs, setPacks] = useState<StickerPack[]>([]);
  const [telegramState, setTelegramState] = useState<TelegramState | null>(null);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [details, setDetails] = useState<StickerPackDetails | null>(null);
  const [conversionEvents, setConversionEvents] = useState<
    ConversionJobEvent[]
  >([]);
  const [converting, setConverting] = useState(false);
  const [failureDialog, setFailureDialog] =
    useState<ConversionFailureDialogState | null>(null);
  const latestDetailsRef = useRef<StickerPackDetails | null>(null);
  const jobFailuresRef = useRef<
    Record<string, ConversionFailureDialogState["failures"]>
  >({});
  const jobPackNamesRef = useRef<Record<string, string | null>>({});
  const jobAssetNamesRef = useRef<Record<string, Record<string, string>>>({});

  useEffect(() => {
    latestDetailsRef.current = details;
  }, [details]);

  useEffect(() => {
    let active = true;

    void window.stickerSmith.packs.list().then((nextPacks) => {
      if (!active) {
        return;
      }

      setPacks(nextPacks);
      setSelectedPackId(nextPacks[0]?.id ?? null);
    });
    void window.stickerSmith.telegram.getState().then((nextTelegramState) => {
      if (!active) {
        return;
      }

      setTelegramState(nextTelegramState);
    });

    const unsub = window.stickerSmith.conversion.subscribe((event) => {
      setConversionEvents((cur) => [event, ...cur].slice(0, 50));

      if (event.type === "job_started") {
        const assetNames = Object.fromEntries(
          (latestDetailsRef.current?.assets ?? []).map((asset) => [
            asset.id,
            asset.relativePath.split("/").pop() ?? asset.relativePath,
          ]),
        );
        setFailureDialog(null);
        jobFailuresRef.current[event.jobId] = [];
        jobPackNamesRef.current[event.jobId] =
          latestDetailsRef.current?.pack.name ?? null;
        jobAssetNamesRef.current[event.jobId] = assetNames;
        setConverting(true);
        return;
      }

      if (event.type === "asset_failed") {
        const assetLabel =
          (event.assetId
            ? jobAssetNamesRef.current[event.jobId]?.[event.assetId]
            : null) ??
          event.assetId ??
          "Unknown asset";
        jobFailuresRef.current[event.jobId] = [
          ...(jobFailuresRef.current[event.jobId] ?? []),
          {
            assetLabel,
            error: event.error ?? "Conversion failed for an unknown reason.",
            mode: event.mode,
          },
        ];
        return;
      }

      if (event.type === "job_finished") {
        const failures = jobFailuresRef.current[event.jobId] ?? [];
        const failureCount = event.failureCount ?? failures.length;
        setConverting(false);

        if (failureCount > 0) {
          setFailureDialog({
            packName:
              jobPackNamesRef.current[event.jobId] ??
              latestDetailsRef.current?.pack.name ??
              null,
            successCount: event.successCount ?? 0,
            failureCount,
            failures:
              failures.length > 0
                ? failures
                : [
                    {
                      assetLabel: "Conversion job",
                      error:
                        "One or more assets failed while the conversion ran in the background.",
                    },
                  ],
          });
        }

        delete jobFailuresRef.current[event.jobId];
        delete jobPackNamesRef.current[event.jobId];
        delete jobAssetNamesRef.current[event.jobId];
      }
    });

    return () => {
      active = false;
      unsub();
    };
  }, []);

  useEffect(() => {
    let active = true;

    if (!selectedPackId) {
      setDetails(null);
      return;
    }

    void window.stickerSmith.packs.get(selectedPackId).then((nextDetails) => {
      if (active) {
        setDetails(nextDetails);
      }
    });

    return () => {
      active = false;
    };
  }, [selectedPackId]);

  const refreshPacks = useCallback(async () => {
    const next = await window.stickerSmith.packs.list();
    setPacks(next);
    return next;
  }, []);

  const selectTelegramAuthMode = useCallback(async (mode: "user" | "bot") => {
    const next = await window.stickerSmith.telegram.selectAuthMode({ mode });
    setTelegramState(next);
    return next;
  }, []);

  const disconnectTelegram = useCallback(async () => {
    const next = await window.stickerSmith.telegram.disconnect();
    setTelegramState(next);
    return next;
  }, []);

  const refreshDetails = useCallback(async (packId: string) => {
    const next = await window.stickerSmith.packs.get(packId);
    setDetails(next);
    return next;
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
        <Sidebar
          packs={packs}
          telegramState={telegramState}
          selectedPackId={selectedPackId}
          onSelect={setSelectedPackId}
          onSelectTelegramAuthMode={selectTelegramAuthMode}
          onDisconnectTelegram={disconnectTelegram}
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
            setDetails={setDetails}
            refreshDetails={refreshDetails}
            refreshPacks={refreshPacks}
            setSelectedPackId={setSelectedPackId}
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
        onClose={() => setFailureDialog(null)}
      />
    </ThemeProvider>
  );
}
