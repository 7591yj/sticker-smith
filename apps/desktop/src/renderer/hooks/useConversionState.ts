import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConversionJobEvent, StickerPackDetails } from "@sticker-smith/shared";
import type { ConversionFailureDialogState } from "../components/ConversionFailureDialog";
import { getLeafName } from "../utils/pathDisplay";

type UseConversionStateArgs = {
  latestDetailsRef: React.RefObject<StickerPackDetails | null>;
  refreshDetails: (packId: string) => Promise<StickerPackDetails>;
};

type ConversionJobRefs = {
  failures: React.MutableRefObject<
    Record<string, ConversionFailureDialogState["failures"]>
  >;
  packNames: React.MutableRefObject<Record<string, string | null>>;
  stickerNames: React.MutableRefObject<Record<string, Record<string, string>>>;
};

type ConversionJobHandlers = {
  captureConversionJobStart: (event: ConversionJobEvent) => void;
  captureConversionFailure: (event: ConversionJobEvent) => void;
  finishConversionJob: (event: ConversionJobEvent) => void;
};

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

function getStickerNames(details: StickerPackDetails | null) {
  return Object.fromEntries(
    (details?.stickers ?? []).map((sticker) => [
      sticker.id,
      getLeafName(sticker.relativePath),
    ]),
  );
}

function useConversionJobRefs(): ConversionJobRefs {
  const failures = useRef<
    Record<string, ConversionFailureDialogState["failures"]>
  >({});
  const packNames = useRef<Record<string, string | null>>({});
  const stickerNames = useRef<Record<string, Record<string, string>>>({});

  return useMemo(
    () => ({ failures, packNames, stickerNames }),
    [failures, packNames, stickerNames],
  );
}

function useConversionJobHandlers({
  jobRefs,
  latestDetailsRef,
  refreshDetails,
  setConverting,
  setFailureDialog,
}: UseConversionStateArgs & {
  jobRefs: ConversionJobRefs;
  setConverting: React.Dispatch<React.SetStateAction<boolean>>;
  setFailureDialog: React.Dispatch<
    React.SetStateAction<ConversionFailureDialogState | null>
  >;
}): ConversionJobHandlers {
  const captureConversionJobStart = useCallback((event: ConversionJobEvent) => {
    if (event.type !== "job_started") {
      return;
    }

    setFailureDialog(null);
    jobRefs.failures.current[event.jobId] = [];
    jobRefs.packNames.current[event.jobId] = latestDetailsRef.current?.pack.name ?? null;
    jobRefs.stickerNames.current[event.jobId] = getStickerNames(latestDetailsRef.current);
    setConverting(true);
  }, [jobRefs, latestDetailsRef, setConverting, setFailureDialog]);

  const captureConversionFailure = useCallback((event: ConversionJobEvent) => {
    if (event.type !== "sticker_failed") {
      return;
    }

    const assetLabel =
      (event.stickerId ? jobRefs.stickerNames.current[event.jobId]?.[event.stickerId] : null) ??
      event.stickerId ??
      "Unknown file";

    jobRefs.failures.current[event.jobId] = [
      ...(jobRefs.failures.current[event.jobId] ?? []),
      {
        assetLabel,
        error: event.error ?? "Conversion failed for an unknown reason.",
        mode: event.mode,
      },
    ];
  }, [jobRefs]);

  const finishConversionJob = useCallback(
    (event: ConversionJobEvent) => {
      if (event.type !== "job_finished") {
        return;
      }

      const failures = jobRefs.failures.current[event.jobId] ?? [];
      const failureCount = event.failureCount ?? failures.length;

      setConverting(false);
      if (latestDetailsRef.current?.pack.id) {
        void refreshDetails(latestDetailsRef.current.pack.id);
      }

      if (failureCount > 0) {
        setFailureDialog({
          packName:
            jobRefs.packNames.current[event.jobId] ??
            latestDetailsRef.current?.pack.name ??
            null,
          successCount: event.successCount ?? 0,
          failureCount,
          failures: createFallbackFailure(failures),
        });
      }

      delete jobRefs.failures.current[event.jobId];
      delete jobRefs.packNames.current[event.jobId];
      delete jobRefs.stickerNames.current[event.jobId];
    },
    [jobRefs, latestDetailsRef, refreshDetails, setConverting, setFailureDialog],
  );

  return useMemo(
    () => ({
      captureConversionJobStart,
      captureConversionFailure,
      finishConversionJob,
    }),
    [captureConversionJobStart, captureConversionFailure, finishConversionJob],
  );
}

function useConversionEventsSubscription(handlers: ConversionJobHandlers) {
  const [conversionEvents, setConversionEvents] = useState<ConversionJobEvent[]>([]);

  useEffect(() => {
    const unsub = window.stickerSmith.conversion.subscribe((event) => {
      setConversionEvents((current) => [event, ...current].slice(0, 50));
      handlers.captureConversionJobStart(event);
      handlers.captureConversionFailure(event);
      handlers.finishConversionJob(event);
    });
    return unsub;
  }, [handlers]);

  return conversionEvents;
}

export function useConversionState({
  latestDetailsRef,
  refreshDetails,
}: UseConversionStateArgs) {
  const [converting, setConverting] = useState(false);
  const [failureDialog, setFailureDialog] =
    useState<ConversionFailureDialogState | null>(null);
  const jobRefs = useConversionJobRefs();
  const handlers = useConversionJobHandlers({
    jobRefs,
    latestDetailsRef,
    refreshDetails,
    setConverting,
    setFailureDialog,
  });
  const conversionEvents = useConversionEventsSubscription(handlers);

  const dismissFailureDialog = useCallback(() => {
    setFailureDialog(null);
  }, []);

  return {
    conversionEvents,
    converting,
    dismissFailureDialog,
    failureDialog,
  };
}
