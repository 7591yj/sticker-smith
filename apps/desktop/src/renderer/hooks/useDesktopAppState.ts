import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ConversionJobEvent,
  TelegramState,
  StickerPack,
  StickerPackDetails,
} from "@sticker-smith/shared";
import type {
  ConversionFailureDialogState,
} from "../components/ConversionFailureDialog";
import { getLeafName } from "../utils/pathDisplay";

interface TelegramErrorDialogState {
  title: string;
  message: string;
}

function createFallbackFailure(
  failures: ConversionFailureDialogState["failures"],
) {
  return failures.length > 0
    ? failures
    : [
        {
          assetLabel: "Conversion job",
          error:
            "One or more assets failed while the conversion ran in the background.",
        },
      ];
}

export function useDesktopAppState() {
  const [packs, setPacks] = useState<StickerPack[]>([]);
  const [telegramState, setTelegramState] = useState<TelegramState | null>(null);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [details, setDetails] = useState<StickerPackDetails | null>(null);
  const [conversionEvents, setConversionEvents] = useState<
    ConversionJobEvent[]
  >([]);
  const [converting, setConverting] = useState(false);
  const [telegramSyncInProgress, setTelegramSyncInProgress] = useState(false);
  const [telegramSyncRecommended, setTelegramSyncRecommended] = useState(false);
  const [telegramPublishingPackIds, setTelegramPublishingPackIds] = useState<
    string[]
  >([]);
  const [telegramUpdatingPackIds, setTelegramUpdatingPackIds] = useState<
    string[]
  >([]);
  const [failureDialog, setFailureDialog] =
    useState<ConversionFailureDialogState | null>(null);
  const [telegramErrorDialog, setTelegramErrorDialog] =
    useState<TelegramErrorDialogState | null>(null);
  const latestDetailsRef = useRef<StickerPackDetails | null>(null);
  const autoSyncedTelegramAccountRef = useRef<string | null>(null);
  const jobFailuresRef = useRef<
    Record<string, ConversionFailureDialogState["failures"]>
  >({});
  const jobPackNamesRef = useRef<Record<string, string | null>>({});
  const jobAssetNamesRef = useRef<Record<string, Record<string, string>>>({});

  const refreshPacks = useCallback(async () => {
    const next = await window.stickerSmith.packs.list();
    setPacks(next);
    setSelectedPackId((current) =>
      current && next.some((pack) => pack.id === current)
        ? current
        : next[0]?.id ?? null,
    );
    return next;
  }, []);

  const refreshDetails = useCallback(async (packId: string) => {
    const next = await window.stickerSmith.packs.get(packId);
    setDetails(next);
    return next;
  }, []);

  const refreshDetailsSafely = useCallback(
    async (packId: string) => {
      try {
        return await refreshDetails(packId);
      } catch {
        setDetails(null);
        await refreshPacks();
        return null;
      }
    },
    [refreshDetails, refreshPacks],
  );

  const showTelegramError = useCallback((title: string, message: string) => {
    setTelegramErrorDialog({ title, message });
  }, []);

  const dismissFailureDialog = useCallback(() => {
    setFailureDialog(null);
  }, []);

  const dismissTelegramErrorDialog = useCallback(() => {
    setTelegramErrorDialog(null);
  }, []);

  const captureConversionJobStart = useCallback((event: ConversionJobEvent) => {
    if (event.type !== "job_started") {
      return;
    }

    const assetNames = Object.fromEntries(
      (latestDetailsRef.current?.assets ?? []).map((asset) => [
        asset.id,
        getLeafName(asset.relativePath),
      ]),
    );

    setFailureDialog(null);
    jobFailuresRef.current[event.jobId] = [];
    jobPackNamesRef.current[event.jobId] = latestDetailsRef.current?.pack.name ?? null;
    jobAssetNamesRef.current[event.jobId] = assetNames;
    setConverting(true);
  }, []);

  const captureConversionFailure = useCallback((event: ConversionJobEvent) => {
    if (event.type !== "asset_failed") {
      return;
    }

    const assetLabel =
      (event.assetId ? jobAssetNamesRef.current[event.jobId]?.[event.assetId] : null) ??
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
      delete jobAssetNamesRef.current[event.jobId];
    },
    [refreshDetails],
  );

  const runTelegramAction = useCallback(
    async <T,>(
      action: () => Promise<T>,
      errorTitle: string,
      fallbackMessage: string,
      onSuccess?: (next: T) => Promise<void> | void,
    ) => {
      try {
        const next = await action();
        await onSuccess?.(next);
        return next;
      } catch (error) {
        showTelegramError(
          errorTitle,
          (error as Error)?.message ?? fallbackMessage,
        );
        return null;
      }
    },
    [showTelegramError],
  );

  useEffect(() => {
    latestDetailsRef.current = details;
  }, [details]);

  useEffect(() => {
    let active = true;

    void refreshPacks();
    void window.stickerSmith.telegram
      .getState()
      .then((nextTelegramState) => {
        if (active) {
          setTelegramState(nextTelegramState);
        }
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        showTelegramError(
          "Telegram startup failed",
          (error as Error)?.message ?? "Telegram startup failed.",
        );
      });

    const unsubConversion = window.stickerSmith.conversion.subscribe((event) => {
      setConversionEvents((current) => [event, ...current].slice(0, 50));
      captureConversionJobStart(event);
      captureConversionFailure(event);
      finishConversionJob(event);
    });

    const unsubTelegram = window.stickerSmith.telegram.subscribe((event) => {
      if (event.type === "auth_state_changed") {
        setTelegramState(event.state);
        if (event.state.status !== "connected") {
          setTelegramSyncInProgress(false);
          setTelegramSyncRecommended(false);
          setTelegramPublishingPackIds([]);
          setTelegramUpdatingPackIds([]);
        }
        void refreshPacks();
        return;
      }

      if (event.type === "sync_started") {
        setTelegramSyncInProgress(true);
      }

      if (event.type === "publish_started") {
        setTelegramPublishingPackIds((current) =>
          current.includes(event.localPackId)
            ? current
            : [...current, event.localPackId],
        );
        return;
      }

      if (event.type === "pack_sync_failed") {
        showTelegramError("Telegram sync failed", event.error);
      }

      if (event.type === "publish_failed") {
        setTelegramPublishingPackIds((current) =>
          current.filter((packId) => packId !== event.localPackId),
        );
        showTelegramError("Telegram upload failed", event.error);
        return;
      }

      if (event.type === "update_started") {
        setTelegramUpdatingPackIds((current) =>
          current.includes(event.packId) ? current : [...current, event.packId],
        );
      }

      if (event.type === "update_failed") {
        setTelegramUpdatingPackIds((current) =>
          current.filter((packId) => packId !== event.packId),
        );
        showTelegramError("Telegram update failed", event.error);
      }

      if (event.type === "publish_finished") {
        setTelegramPublishingPackIds((current) =>
          current.filter((packId) => packId !== event.localPackId),
        );
        setTelegramSyncRecommended(true);
        void refreshPacks().then((nextPacks) => {
          setSelectedPackId(
            nextPacks.find((pack) => pack.id === event.packId)?.id ?? event.packId,
          );
        });
        return;
      }

      if (
        event.type === "sync_finished" ||
        event.type === "pack_sync_started" ||
        event.type === "pack_sync_completed" ||
        event.type === "pack_sync_failed" ||
        event.type === "update_started" ||
        event.type === "update_finished" ||
        event.type === "update_failed"
      ) {
        if (event.type === "sync_finished") {
          setTelegramSyncInProgress(false);
          setTelegramSyncRecommended(false);
        }
        if (event.type === "update_finished") {
          setTelegramUpdatingPackIds((current) =>
            current.filter((packId) => packId !== event.packId),
          );
        }
        void refreshPacks();
      }

      if (
        (event.type === "pack_sync_started" ||
          event.type === "pack_sync_completed" ||
          event.type === "pack_sync_failed" ||
          event.type === "file_download_progress" ||
          event.type === "update_started" ||
          event.type === "update_finished" ||
          event.type === "update_failed") &&
        event.packId &&
        latestDetailsRef.current?.pack.id === event.packId
      ) {
        void refreshDetails(event.packId);
      }
    });

    return () => {
      active = false;
      unsubConversion();
      unsubTelegram();
    };
  }, [
    captureConversionFailure,
    captureConversionJobStart,
    finishConversionJob,
    refreshDetails,
    refreshPacks,
    showTelegramError,
  ]);

  useEffect(() => {
    let active = true;

    if (!selectedPackId) {
      setDetails(null);
      return;
    }

    void window.stickerSmith.packs
      .get(selectedPackId)
      .then((nextDetails) => {
        if (active) {
          setDetails(nextDetails);
        }
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setDetails(null);
        void refreshPacks();
      });

    return () => {
      active = false;
    };
  }, [refreshPacks, selectedPackId]);

  const submitTelegramTdlibParameters = useCallback(
    async (input: { apiId: string; apiHash: string }) =>
      runTelegramAction(
        () => window.stickerSmith.telegram.submitTdlibParameters(input),
        "Telegram login failed",
        "Telegram login failed.",
        setTelegramState,
      ),
    [runTelegramAction],
  );

  const submitTelegramPhoneNumber = useCallback(
    async (input: { phoneNumber: string }) =>
      runTelegramAction(
        () => window.stickerSmith.telegram.submitPhoneNumber(input),
        "Telegram login failed",
        "Telegram login failed.",
        setTelegramState,
      ),
    [runTelegramAction],
  );

  const submitTelegramCode = useCallback(
    async (input: { code: string }) =>
      runTelegramAction(
        () => window.stickerSmith.telegram.submitCode(input),
        "Telegram login failed",
        "Telegram login failed.",
        setTelegramState,
      ),
    [runTelegramAction],
  );

  const submitTelegramPassword = useCallback(
    async (input: { password: string }) =>
      runTelegramAction(
        () => window.stickerSmith.telegram.submitPassword(input),
        "Telegram login failed",
        "Telegram login failed.",
        setTelegramState,
      ),
    [runTelegramAction],
  );

  const logoutTelegram = useCallback(
    async () =>
      runTelegramAction(
        () => window.stickerSmith.telegram.logout(),
        "Telegram logout failed",
        "Telegram logout failed.",
        setTelegramState,
      ),
    [runTelegramAction],
  );

  const resetTelegram = useCallback(
    async () =>
      runTelegramAction(
        () => window.stickerSmith.telegram.reset(),
        "Telegram reset failed",
        "Telegram reset failed.",
        async (next) => {
          setTelegramState(next);
          setTelegramSyncInProgress(false);
          setTelegramSyncRecommended(false);
          setTelegramPublishingPackIds([]);
          setTelegramUpdatingPackIds([]);
          await refreshPacks();
        },
      ),
    [refreshPacks, runTelegramAction],
  );

  const syncTelegramPacks = useCallback(async () => {
    setTelegramSyncInProgress(true);
    try {
      await window.stickerSmith.telegram.syncOwnedPacks();
      setTelegramSyncRecommended(false);
      await refreshPacks();
    } catch (error) {
      showTelegramError(
        "Telegram sync failed",
        (error as Error)?.message ?? "Telegram sync failed.",
      );
      throw error;
    } finally {
      setTelegramSyncInProgress(false);
    }
  }, [refreshPacks, showTelegramError]);

  const publishLocalPack = useCallback(
    async (input: { packId: string; title: string; shortName: string }) => {
      try {
        await window.stickerSmith.telegram.publishLocalPack(input);
        await refreshPacks();
      } catch (error) {
        showTelegramError(
          "Telegram upload failed",
          (error as Error)?.message ?? "Telegram upload failed.",
        );
        throw error;
      }
    },
    [refreshPacks, showTelegramError],
  );

  const updateTelegramPack = useCallback(
    async (input: { packId: string }) => {
      try {
        await window.stickerSmith.telegram.updateTelegramPack(input);
        await Promise.all([refreshPacks(), refreshDetails(input.packId)]);
      } catch (error) {
        showTelegramError(
          "Telegram update failed",
          (error as Error)?.message ?? "Telegram update failed.",
        );
        throw error;
      }
    },
    [refreshDetails, refreshPacks, showTelegramError],
  );

  const downloadTelegramPackMedia = useCallback(
    async (input: { packId: string }) => {
      try {
        await window.stickerSmith.telegram.downloadPackMedia(input);
        await refreshDetailsSafely(input.packId);
      } catch (error) {
        showTelegramError(
          "Telegram media download failed",
          (error as Error)?.message ?? "Telegram media download failed.",
        );
        throw error;
      }
    },
    [refreshDetailsSafely, showTelegramError],
  );

  useEffect(() => {
    if (telegramState?.status !== "connected" || telegramState.authStep !== "ready") {
      autoSyncedTelegramAccountRef.current = null;
      return;
    }

    const accountKey = telegramState.sessionUser?.id
      ? String(telegramState.sessionUser.id)
      : "connected";

    if (autoSyncedTelegramAccountRef.current === accountKey) {
      return;
    }

    autoSyncedTelegramAccountRef.current = accountKey;
    void syncTelegramPacks().catch(() => undefined);
  }, [syncTelegramPacks, telegramState]);

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
