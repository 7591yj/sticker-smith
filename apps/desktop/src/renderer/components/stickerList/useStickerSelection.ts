import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dispatch, MouseEvent, SetStateAction } from "react";
import type { StickerItem, StickerPackDetails } from "@sticker-smith/shared";
import type {
  StickerContextMenuState,
  StickerDataState,
  StickerSelectionState,
} from "./types";
import { sortStickers } from "./stickerUtils";

export function useStickerData(
  stickers: StickerItem[],
  iconStickerId: string | null,
): StickerDataState {
  const sortedStickers = useMemo(
    () => sortStickers(stickers, iconStickerId),
    [iconStickerId, stickers],
  );
  const stickerById = useMemo(
    () => new Map(stickers.map((sticker) => [sticker.id, sticker])),
    [stickers],
  );
  return { sortedStickers, stickerById };
}

export function useStickerSelection(
  packId: string,
  visibleStickerIds: string[],
): StickerSelectionState {
  const [selectedStickerIds, setSelectedStickerIds] = useState<string[]>([]);
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    setSelectedStickerIds([]);
    setSelectionAnchorId(null);
  }, [packId]);

  useEffect(() => {
    const visibleIds = new Set(visibleStickerIds);
    setSelectedStickerIds((current) =>
      current.filter((id) => visibleIds.has(id)),
    );
    setSelectionAnchorId((current) =>
      current && visibleIds.has(current) ? current : null,
    );
  }, [visibleStickerIds]);

  const selectOnly = useCallback((stickerId: string) => {
    setSelectedStickerIds([stickerId]);
    setSelectionAnchorId(stickerId);
  }, []);

  const handleStickerClick = useCallback(
    (event: MouseEvent<HTMLDivElement>, sticker: StickerItem) => {
      const stickerId = sticker.id;
      if (
        event.shiftKey &&
        selectionAnchorId &&
        selectStickerRange(
          selectionAnchorId,
          stickerId,
          visibleStickerIds,
          setSelectedStickerIds,
        )
      )
        return;

      setSelectedStickerIds((current) =>
        current.includes(stickerId)
          ? current.filter((id) => id !== stickerId)
          : [...current, stickerId],
      );
      setSelectionAnchorId(stickerId);
    },
    [selectionAnchorId, visibleStickerIds],
  );

  return {
    selectedStickerIds,
    selectionAnchorId,
    setSelectedStickerIds,
    setSelectionAnchorId,
    selectOnly,
    handleStickerClick,
  };
}

function selectStickerRange(
  anchorId: string,
  stickerId: string,
  selectableStickerIds: string[],
  setSelectedStickerIds: (ids: string[]) => void,
) {
  const anchorIndex = selectableStickerIds.indexOf(anchorId);
  const currentIndex = selectableStickerIds.indexOf(stickerId);
  if (anchorIndex === -1 || currentIndex === -1) return false;
  const [start, end] =
    anchorIndex < currentIndex
      ? [anchorIndex, currentIndex]
      : [currentIndex, anchorIndex];
  setSelectedStickerIds(selectableStickerIds.slice(start, end + 1));
  return true;
}

export function useStickerContextMenu(
  selectedStickerIds: string[],
  selectOnly: (stickerId: string) => void,
  setContextMenu: Dispatch<SetStateAction<StickerContextMenuState>>,
) {
  return useCallback(
    (event: MouseEvent, sticker: StickerItem) => {
      event.preventDefault();
      const isSelected = selectedStickerIds.includes(sticker.id);
      if (!isSelected) selectOnly(sticker.id);
      setContextMenu({
        mouseX: event.clientX,
        mouseY: event.clientY,
        stickerIds: isSelected ? selectedStickerIds : [sticker.id],
      });
    },
    [selectOnly, selectedStickerIds, setContextMenu],
  );
}

export function useEmojiConfirm({
  packId,
  refreshDetails,
  emojiEditStickerIds,
  selection,
  setEmojiEditStickerIds,
}: {
  packId: string;
  refreshDetails: () => Promise<StickerPackDetails>;
  emojiEditStickerIds: string[] | null;
  selection: Pick<
    StickerSelectionState,
    "setSelectedStickerIds" | "setSelectionAnchorId"
  >;
  setEmojiEditStickerIds: Dispatch<SetStateAction<string[] | null>>;
}) {
  return useCallback(
    async (emojis: string[]) => {
      if (!emojiEditStickerIds?.length) return;
      if (emojiEditStickerIds.length === 1) {
        await window.stickerSmith.stickers.setEmojis({
          packId,
          stickerId: emojiEditStickerIds[0]!,
          emojis,
        });
      } else {
        await window.stickerSmith.stickers.setEmojisMany({
          packId,
          stickerIds: emojiEditStickerIds,
          emojis,
        });
      }
      setEmojiEditStickerIds(null);
      selection.setSelectedStickerIds(emojiEditStickerIds);
      selection.setSelectionAnchorId(emojiEditStickerIds[0] ?? null);
      await refreshDetails();
    },
    [
      emojiEditStickerIds,
      packId,
      refreshDetails,
      selection,
      setEmojiEditStickerIds,
    ],
  );
}
