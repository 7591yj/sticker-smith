import { useCallback, useState, type DragEvent } from "react";
import type { StickerItem, StickerPackDetails } from "@sticker-smith/shared";

type UseStickerReorderingOptions = {
  packId: string;
  sortedStickers: StickerItem[];
  stickerById: ReadonlyMap<string, StickerItem>;
  selectedStickerIds: string[];
  selectOnly: (stickerId: string) => void;
  sort: string;
  filter: string;
  query: string;
  refreshDetails: () => Promise<StickerPackDetails>;
  refreshPacks: () => Promise<unknown>;
};

export function useStickerReordering({
  packId,
  sortedStickers,
  stickerById,
  selectedStickerIds,
  selectOnly,
  sort,
  filter,
  query,
  refreshDetails,
  refreshPacks,
}: UseStickerReorderingOptions) {
  const [draggingStickerId, setDraggingStickerId] = useState<string | null>(
    null,
  );
  const [dragOverStickerId, setDragOverStickerId] = useState<string | null>(
    null,
  );
  const canReorderVisibleStickers =
    sort === "index" && filter === "all" && query.trim() === "";

  const reorderStickerBefore = useCallback(
    async (sticker: StickerItem, beforeStickerId: string | null) => {
      if (beforeStickerId === sticker.id) return;
      await window.stickerSmith.stickers.reorder({
        packId,
        stickerId: sticker.id,
        beforeStickerId,
      });
      await Promise.all([refreshDetails(), refreshPacks()]);
    },
    [packId, refreshDetails, refreshPacks],
  );

  const handleMoveToIndex = useCallback(
    async (sticker: StickerItem, nextIndex: number) => {
      const ordered = [...sortedStickers];
      const currentIndex = ordered.findIndex((item) => item.id === sticker.id);
      if (currentIndex === -1 || currentIndex === nextIndex) return;
      ordered.splice(currentIndex, 1);
      const beforeStickerId = ordered[nextIndex]?.id ?? null;
      await reorderStickerBefore(sticker, beforeStickerId);
    },
    [reorderStickerBefore, sortedStickers],
  );

  const handleKeyboardReorder = useCallback(
    async (direction: -1 | 1) => {
      if (!canReorderVisibleStickers) return;
      const stickerId = selectedStickerIds.at(-1);
      const sticker = stickerId ? stickerById.get(stickerId) : undefined;
      if (!sticker) return;

      const currentIndex = sortedStickers.findIndex(
        (item) => item.id === sticker.id,
      );
      if (currentIndex === -1) return;
      const nextIndex = Math.min(
        sortedStickers.length - 1,
        Math.max(0, currentIndex + direction),
      );
      await handleMoveToIndex(sticker, nextIndex);
    },
    [
      canReorderVisibleStickers,
      handleMoveToIndex,
      selectedStickerIds,
      sortedStickers,
      stickerById,
    ],
  );

  const handleDragStart = useCallback(
    (event: DragEvent<HTMLDivElement>, sticker: StickerItem) => {
      if (!canReorderVisibleStickers) return;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", sticker.id);
      setDraggingStickerId(sticker.id);
      selectOnly(sticker.id);
    },
    [canReorderVisibleStickers, selectOnly],
  );

  const handleDragEnd = useCallback(() => {
    setDraggingStickerId(null);
    setDragOverStickerId(null);
  }, []);

  const handleDragOverSticker = useCallback(
    (event: DragEvent<HTMLDivElement>, sticker: StickerItem) => {
      if (!canReorderVisibleStickers || !draggingStickerId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setDragOverStickerId(sticker.id);
    },
    [canReorderVisibleStickers, draggingStickerId],
  );

  const handleDropSticker = useCallback(
    async (event: DragEvent<HTMLDivElement>, sticker: StickerItem) => {
      event.preventDefault();
      const draggedStickerId =
        event.dataTransfer.getData("text/plain") || draggingStickerId;
      const draggedSticker = draggedStickerId
        ? stickerById.get(draggedStickerId)
        : undefined;
      handleDragEnd();
      if (
        !canReorderVisibleStickers ||
        !draggedSticker ||
        draggedSticker.id === sticker.id
      ) {
        return;
      }
      const targetIndex = sortedStickers.findIndex(
        (item) => item.id === sticker.id,
      );
      const isAfterTarget =
        event.clientY >
        event.currentTarget.getBoundingClientRect().top +
          event.currentTarget.getBoundingClientRect().height / 2;
      const orderedWithoutDragged = sortedStickers.filter(
        (item) => item.id !== draggedSticker.id,
      );
      const targetIndexWithoutDragged = orderedWithoutDragged.findIndex(
        (item) => item.id === sticker.id,
      );
      const beforeStickerId = isAfterTarget
        ? (orderedWithoutDragged[targetIndexWithoutDragged + 1]?.id ?? null)
        : targetIndex >= 0
          ? sticker.id
          : null;
      await reorderStickerBefore(draggedSticker, beforeStickerId);
    },
    [
      canReorderVisibleStickers,
      draggingStickerId,
      handleDragEnd,
      reorderStickerBefore,
      sortedStickers,
      stickerById,
    ],
  );

  return {
    canReorderVisibleStickers,
    draggingStickerId,
    dragOverStickerId,
    handleDragStart,
    handleDragEnd,
    handleDragOverSticker,
    handleDropSticker,
    handleKeyboardReorder,
    handleMoveToIndex,
  };
}
