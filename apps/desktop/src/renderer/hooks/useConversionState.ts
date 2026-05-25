import { useCallback, useEffect, useRef, useState } from "react";
import type { ConversionJobEvent, StickerPackDetails } from "@sticker-smith/shared";
import type { ConversionFailureDialogState } from "../components/ConversionFailureDialog";
import { getLeafName } from "../utils/pathDisplay";

function createFallbackFailure(
  failures: ConversionFailureDialogState["failures"],
) {
  return failures.length > 0
    ? failures
    : [
        {
          assetLabel: "Conversion job",
          error:
            "One or more files failed while stickers were being added.",
        },
      ];
}

export function useConversionState({
  latestDetailsRef,
  refreshDetails,
}: {
  latestDetailsRef: React.RefObject<StickerPackDetails | null>;
  refreshDetails: (packId: string) => Promise<StickerPackDetails>;
}) {
  const [conversionEvents, setConversionEvents] = useState<ConversionJobEvent[]>([]);
  const [converting, setConverting] = useState(false);
  const [failureDialog, setFailureDialog] =
    useState<ConversionFailureDialogState | null>(null);
  const jobFailuresRef = useRef<
    Record<string, ConversionFailureDialogState["failures"]>
  >({});
  const jobPackNamesRef = useRef<Record<string, string | null>>({});
  const jobStickerNamesRef = useRef<Record<string, Record<string, string>>>({});

  const dismissFailureDialog = useCallback(() => {
    setFailureDialog(null);
  }, []);

  const captureConversionJobStart = useCallback((event: ConversionJobEvent) => {
    if (event.type !== "job_started") {
      return;
    }

    const stickerNames = Object.fromEntries(
      (latestDetailsRef.current?.stickers ?? []).map((sticker) => [
        sticker.id,
        getLeafName(sticker.relativePath),
      ]),
    );

    setFailureDialog(null);
    jobFailuresRef.current[event.jobId] = [];
    jobPackNamesRef.current[event.jobId] = latestDetailsRef.current?.pack.name ?? null;
    jobStickerNamesRef.current[event.jobId] = stickerNames;
    setConverting(true);
  }, [latestDetailsRef]);

  const captureConversionFailure = useCallback((event: ConversionJobEvent) => {
    if (event.type !== "sticker_failed") {
      return;
    }

    const assetLabel =
      (event.stickerId ? jobStickerNamesRef.current[event.jobId]?.[event.stickerId] : null) ??
      event.stickerId ??
      "Unknown file";

    jobFailuresRef.current[event.jobId] = [
      ...(jobFailuresRef.current[event.jobId] ?? []),
      {
        assetLabel,
        error: event.error ?? "Conversion failed for an unknown reason.",
        mode: event.mode,
      },
    ];
  }, []);

  const finishConversionJob = useCallback(
    (event: ConversionJobEvent) => {
      if (event.type !== "job_finished") {
        return;
      }

      const failures = jobFailuresRef.current[event.jobId] ?? [];
      const failureCount = event.failureCount ?? failures.length;

      setConverting(false);
      if (latestDetailsRef.current?.pack.id) {
        void refreshDetails(latestDetailsRef.current.pack.id);
      }

      if (failureCount > 0) {
        setFailureDialog({
          packName:
            jobPackNamesRef.current[event.jobId] ??
            latestDetailsRef.current?.pack.name ??
            null,
          successCount: event.successCount ?? 0,
          failureCount,
          failures: createFallbackFailure(failures),
        });
      }

      delete jobFailuresRef.current[event.jobId];
      delete jobPackNamesRef.current[event.jobId];
      delete jobStickerNamesRef.current[event.jobId];
    },
    [latestDetailsRef, refreshDetails],
  );

  useEffect(() => {
    const unsub = window.stickerSmith.conversion.subscribe((event) => {
      setConversionEvents((current) => [event, ...current].slice(0, 50));
      captureConversionJobStart(event);
      captureConversionFailure(event);
      finishConversionJob(event);
    });
    return unsub;
  }, [captureConversionJobStart, captureConversionFailure, finishConversionJob]);

  return {
    conversionEvents,
    converting,
    dismissFailureDialog,
    failureDialog,
  };
}
