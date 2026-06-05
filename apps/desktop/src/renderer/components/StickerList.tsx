import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import Box from "@mui/material/Box";
import type { StickerItem, StickerPackDetails } from "@sticker-smith/shared";
import { appTokens } from "../../theme/appTokens";
import { EmojiPickerDialog } from "./EmojiPickerDialog";
import { StickerBrowser } from "./stickerList/StickerBrowser";
import { DeleteStickersDialog } from "./stickerList/DeleteStickersDialog";
import { StickerContextMenu } from "./stickerList/StickerContextMenu";
import { StickerInspector } from "./stickerList/StickerInspector";
import {
  StickerToolbar,
  StickerToolbarNotice,
} from "./stickerList/StickerToolbar";
import {
  useEmojiConfirm,
  useStickerContextMenu,
  useStickerData,
  useStickerSelection,
} from "./stickerList/useStickerSelection";
import { useStickerKeyboardShortcuts } from "./stickerList/useStickerKeyboardShortcuts";
import {
  filterAndSortStickers,
  getContextStickers,
  initialEmojiSelection,
  summarizeFilterCounts,
} from "./stickerList/stickerUtils";
import type {
  StickerContextMenuState,
  StickerFilter,
  StickerSort,
} from "./stickerList/types";

interface Props {
  packId: string;
  stickers: StickerItem[];
  iconStickerId: string | null;
  toolbarNotice?: string | null;
  refreshDetails: () => Promise<StickerPackDetails>;
  refreshPacks: () => Promise<unknown>;
}

export function StickerList({
  packId,
  stickers,
  iconStickerId,
  toolbarNotice,
  refreshDetails,
  refreshPacks,
}: Props) {
  const data = useStickerData(stickers, iconStickerId);
  const [contextMenu, setContextMenu] = useState<StickerContextMenuState>(null);
  const [emojiEditStickerIds, setEmojiEditStickerIds] = useState<
    string[] | null
  >(null);
  const [deleteStickerIds, setDeleteStickerIds] = useState<string[] | null>(
    null,
  );
  const [filter, setFilter] = useState<StickerFilter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<StickerSort>("index");
  const [draggingStickerId, setDraggingStickerId] = useState<string | null>(
    null,
  );
  const [dragOverStickerId, setDragOverStickerId] = useState<string | null>(
    null,
  );

  const visibleStickers = useMemo(
    () => filterAndSortStickers(data.sortedStickers, filter, query, sort),
    [data.sortedStickers, filter, query, sort],
  );
  const visibleStickerIds = useMemo(
    () => visibleStickers.map((sticker) => sticker.id),
    [visibleStickers],
  );
  const selection = useStickerSelection(packId, visibleStickerIds);
  const selectedStickers = useMemo(
    () =>
      selection.selectedStickerIds
        .map((stickerId) => data.stickerById.get(stickerId))
        .filter((sticker): sticker is StickerItem => sticker !== undefined),
    [data.stickerById, selection.selectedStickerIds],
  );
  const filterCounts = useMemo(
    () => summarizeFilterCounts(data.sortedStickers),
    [data.sortedStickers],
  );
  const contextStickers = getContextStickers(contextMenu, data.stickerById);
  const canReorderVisibleStickers = sort === "index" && filter === "all" && query.trim() === "";

  useEffect(() => setContextMenu(null), [packId]);

  useStickerKeyboardShortcuts({
    selectedStickerIds: selection.selectedStickerIds,
    visibleStickerIds,
    setSelectedStickerIds: selection.setSelectedStickerIds,
    setSelectionAnchorId: selection.setSelectionAnchorId,
  });

  const handleContextMenu = useStickerContextMenu(
    selection.selectedStickerIds,
    selection.selectOnly,
    setContextMenu,
  );
  const handleCloseContextMenu = useCallback(() => setContextMenu(null), []);
  const handleEmojiConfirm = useEmojiConfirm({
    packId,
    refreshDetails,
    emojiEditStickerIds,
    selection,
    setEmojiEditStickerIds,
  });
  const handleDeleteConfirm = useCallback(
    async (stickerIds: string[]) => {
      await window.stickerSmith.stickers.deleteMany({ packId, stickerIds });
      selection.setSelectedStickerIds([]);
      selection.setSelectionAnchorId(null);
      setDeleteStickerIds(null);
      await Promise.all([refreshDetails(), refreshPacks()]);
    },
    [packId, refreshDetails, refreshPacks, selection],
  );

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
      const ordered = [...data.sortedStickers];
      const currentIndex = ordered.findIndex((item) => item.id === sticker.id);
      if (currentIndex === -1 || currentIndex === nextIndex) return;
      ordered.splice(currentIndex, 1);
      const beforeStickerId = ordered[nextIndex]?.id ?? null;
      await reorderStickerBefore(sticker, beforeStickerId);
    },
    [data.sortedStickers, reorderStickerBefore],
  );

  const handleDragStart = useCallback(
    (event: DragEvent<HTMLDivElement>, sticker: StickerItem) => {
      if (!canReorderVisibleStickers) return;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", sticker.id);
      setDraggingStickerId(sticker.id);
      selection.selectOnly(sticker.id);
    },
    [canReorderVisibleStickers, selection],
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
        ? data.stickerById.get(draggedStickerId)
        : undefined;
      handleDragEnd();
      if (
        !canReorderVisibleStickers ||
        !draggedSticker ||
        draggedSticker.id === sticker.id
      ) {
        return;
      }
      const targetIndex = data.sortedStickers.findIndex(
        (item) => item.id === sticker.id,
      );
      const isAfterTarget =
        event.clientY > event.currentTarget.getBoundingClientRect().top +
          event.currentTarget.getBoundingClientRect().height / 2;
      const orderedWithoutDragged = data.sortedStickers.filter(
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
      data.sortedStickers,
      data.stickerById,
      draggingStickerId,
      handleDragEnd,
      reorderStickerBefore,
    ],
  );

  return (
    <>
      <Box
        sx={{
          px: appTokens.layout.spacing.panelPaddingX,
          pt: 1.25,
          pb: 1.5,
          display: "flex",
          flexDirection: "column",
          gap: 1.25,
          minHeight: 0,
        }}
      >
        {toolbarNotice ? (
          <StickerToolbarNotice message={toolbarNotice} />
        ) : (
          <StickerToolbar
            filter={filter}
            setFilter={setFilter}
            query={query}
            setQuery={setQuery}
            sort={sort}
            setSort={setSort}
            filterCounts={filterCounts}
            visibleCount={visibleStickers.length}
            selectedStickerIds={selection.selectedStickerIds}
            totalCount={data.sortedStickers.length}
            selectableStickerIds={visibleStickerIds}
            setSelectedStickerIds={selection.setSelectedStickerIds}
            setSelectionAnchorId={selection.setSelectionAnchorId}
          />
        )}
      </Box>
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          px: appTokens.layout.spacing.panelPaddingX,
        }}
      >
        <Box
          sx={{
            height: "100%",
            minHeight: 0,
            display: "grid",
            gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1fr) 300px" },
            overflow: "hidden",
          }}
        >
          <StickerBrowser
            stickers={visibleStickers}
            iconStickerId={iconStickerId}
            selectedStickerIds={selection.selectedStickerIds}
            selectOnly={selection.selectOnly}
            onStickerClick={selection.handleStickerClick}
            onContextMenu={handleContextMenu}
            draggingStickerId={draggingStickerId}
            dragOverStickerId={dragOverStickerId}
            canReorder={canReorderVisibleStickers}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOverSticker={handleDragOverSticker}
            onDropSticker={handleDropSticker}
            setEmojiEditStickerIds={setEmojiEditStickerIds}
          />
          <StickerInspector
            selectedStickers={selectedStickers}
            totalStickers={data.sortedStickers.length}
            onEditEmoji={() => {
              if (selection.selectedStickerIds.length > 0) {
                setEmojiEditStickerIds(selection.selectedStickerIds);
              }
            }}
            onDelete={() => setDeleteStickerIds(selection.selectedStickerIds)}
            onMoveToIndex={handleMoveToIndex}
          />
        </Box>
      </Box>
      <StickerContextMenu
        contextMenu={contextMenu}
        contextStickers={contextStickers}
        onClose={handleCloseContextMenu}
        onDeleteStickers={setDeleteStickerIds}
        setEmojiEditStickerIds={setEmojiEditStickerIds}
      />
      <DeleteStickersDialog
        stickerIds={deleteStickerIds}
        onClose={() => setDeleteStickerIds(null)}
        onConfirm={handleDeleteConfirm}
      />
      {emojiEditStickerIds ? (
        <EmojiPickerDialog
          open
          title={
            emojiEditStickerIds.length === 1
              ? appTokens.copy.dialogs.editEmojis
              : appTokens.copy.dialogs.editSelectedEmojis
          }
          initialEmojis={initialEmojiSelection(
            emojiEditStickerIds,
            data.stickerById,
          )}
          onConfirm={handleEmojiConfirm}
          onClose={() => setEmojiEditStickerIds(null)}
        />
      ) : null}
    </>
  );
}
