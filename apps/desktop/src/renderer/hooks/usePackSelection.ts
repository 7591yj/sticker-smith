import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { StickerPack, StickerPackDetails } from "@sticker-smith/shared";

type PackDetailsState = StickerPackDetails | null;
type PackListState = StickerPack[];
type SetDetails = Dispatch<SetStateAction<PackDetailsState>>;

type PackListSelection = {
  packs: PackListState;
  refreshPacks: () => Promise<PackListState>;
  selectedPackId: string | null;
  setSelectedPackId: Dispatch<SetStateAction<string | null>>;
};

type PackDetailsSelection = {
  details: PackDetailsState;
  latestDetailsRef: MutableRefObject<PackDetailsState>;
  refreshDetails: (packId: string) => Promise<StickerPackDetails>;
  refreshDetailsSafely: (packId: string) => Promise<PackDetailsState>;
  setDetails: SetDetails;
};

function useLatestDetailsRef(details: PackDetailsState) {
  const latestDetailsRef = useRef<PackDetailsState>(null);

  useEffect(() => {
    latestDetailsRef.current = details;
  }, [details]);

  return latestDetailsRef;
}

function usePackListSelection(): PackListSelection {
  const [packs, setPacks] = useState<PackListState>([]);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);

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

  useEffect(() => {
    void refreshPacks();
  }, [refreshPacks]);

  return { packs, refreshPacks, selectedPackId, setSelectedPackId };
}

function usePackDetailsSelection(refreshPacks: () => Promise<PackListState>): PackDetailsSelection {
  const [details, setDetails] = useState<PackDetailsState>(null);
  const latestDetailsRef = useLatestDetailsRef(details);

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

  return {
    details,
    latestDetailsRef,
    refreshDetails,
    refreshDetailsSafely,
    setDetails,
  };
}

function useSelectedPackDetails(
  selectedPackId: string | null,
  refreshPacks: () => Promise<PackListState>,
  setDetails: SetDetails,
) {
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
  }, [refreshPacks, selectedPackId, setDetails]);
}

export function usePackSelection() {
  const { packs, refreshPacks, selectedPackId, setSelectedPackId } =
    usePackListSelection();
  const {
    details,
    latestDetailsRef,
    refreshDetails,
    refreshDetailsSafely,
    setDetails,
  } = usePackDetailsSelection(refreshPacks);

  useSelectedPackDetails(selectedPackId, refreshPacks, setDetails);

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
