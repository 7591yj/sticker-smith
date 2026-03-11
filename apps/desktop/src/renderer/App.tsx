import { useCallback, useEffect, useState } from "react";
import CssBaseline from "@mui/material/CssBaseline";
import Box from "@mui/material/Box";
import { ThemeProvider } from "@mui/material/styles";
import type {
  ConversionJobEvent,
  StickerPack,
  StickerPackDetails,
} from "@sticker-smith/shared";
import { ConversionStatus } from "./components/ConversionStatus";
import { PackPanel } from "./components/PackPanel";
import { Sidebar } from "./components/Sidebar";
import { appTheme } from "./theme";

export function App() {
  const [packs, setPacks] = useState<StickerPack[]>([]);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [details, setDetails] = useState<StickerPackDetails | null>(null);
  const [conversionEvents, setConversionEvents] = useState<
    ConversionJobEvent[]
  >([]);
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    let active = true;

    void window.stickerSmith.packs.list().then((nextPacks) => {
      if (!active) {
        return;
      }

      setPacks(nextPacks);
      setSelectedPackId(nextPacks[0]?.id ?? null);
    });

    const unsub = window.stickerSmith.conversion.subscribe((event) => {
      setConversionEvents((cur) => [event, ...cur].slice(0, 50));
      if (event.type === "job_started") setConverting(true);
      if (event.type === "job_finished") setConverting(false);
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
          selectedPackId={selectedPackId}
          onSelect={setSelectedPackId}
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
    </ThemeProvider>
  );
}
