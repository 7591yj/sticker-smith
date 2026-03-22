import { useCallback, useEffect, useRef, useState } from "react";
import type { StickerPack, StickerPackDetails } from "@sticker-smith/shared";

export function usePackSelection() {
  const [packs, setPacks] = useState<StickerPack[]>([]);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [details, setDetails] = useState<StickerPackDetails | null>(null);
  const latestDetailsRef = useRef<StickerPackDetails | null>(null);

  useEffect(() => {
    latestDetailsRef.current = details;
  }, [details]);

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

  useEffect(() => {
    void refreshPacks();
  }, [refreshPacks]);

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

  return {
    details,
    latestDetailsRef,
    packs,
    refreshDetails,
    refreshDetailsSafely,
    refreshPacks,
    selectedPackId,
    setDetails,
    setSelectedPackId,
  };
}
