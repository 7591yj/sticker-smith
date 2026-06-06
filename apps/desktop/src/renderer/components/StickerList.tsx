import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useStickerReordering } from "./stickerList/useStickerReordering";
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
  const [emojiEditMode, setEmojiEditMode] = useState<"append" | "replace">(
    "replace",
  );
  const [deleteStickerIds, setDeleteStickerIds] = useState<string[] | null>(
    null,
  );
  const [filter, setFilter] = useState<StickerFilter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<StickerSort>("index");

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
  const reordering = useStickerReordering({
    packId,
    sortedStickers: data.sortedStickers,
    stickerById: data.stickerById,
    selectedStickerIds: selection.selectedStickerIds,
    selectOnly: selection.selectOnly,
    sort,
    filter,
    query,
    refreshDetails,
    refreshPacks,
  });

  useEffect(() => setContextMenu(null), [packId]);

  const openAppendEmojis = useCallback((stickerIds: string[]) => {
    setEmojiEditMode("append");
    setEmojiEditStickerIds(stickerIds);
  }, []);

  const openReplaceEmojis = useCallback((stickerIds: string[]) => {
    setEmojiEditMode("replace");
    setEmojiEditStickerIds(stickerIds);
  }, []);

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
    emojiEditMode,
    selection,
    setEmojiEditStickerIds,
    stickerById: data.stickerById,
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

  useStickerKeyboardShortcuts({
    selectedStickerIds: selection.selectedStickerIds,
    visibleStickerIds,
    setSelectedStickerIds: selection.setSelectedStickerIds,
    setSelectionAnchorId: selection.setSelectionAnchorId,
    onAppendEmojis: openAppendEmojis,
    onDeleteStickers: setDeleteStickerIds,
    onMoveSelectedStickers: reordering.handleKeyboardReorder,
  });

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
            draggingStickerId={reordering.draggingStickerId}
            dragOverStickerId={reordering.dragOverStickerId}
            canReorder={reordering.canReorderVisibleStickers}
            onDragStart={reordering.handleDragStart}
            onDragEnd={reordering.handleDragEnd}
            onDragOverSticker={reordering.handleDragOverSticker}
            onDropSticker={reordering.handleDropSticker}
            setEmojiEditStickerIds={openReplaceEmojis}
          />
          <StickerInspector
            selectedStickers={selectedStickers}
            totalStickers={data.sortedStickers.length}
            onEditEmoji={() => {
              if (selection.selectedStickerIds.length > 0) {
                openReplaceEmojis(selection.selectedStickerIds);
              }
            }}
            onDelete={() => setDeleteStickerIds(selection.selectedStickerIds)}
            onMoveToIndex={reordering.handleMoveToIndex}
          />
        </Box>
      </Box>
      <StickerContextMenu
        contextMenu={contextMenu}
        contextStickers={contextStickers}
        onClose={handleCloseContextMenu}
        onDeleteStickers={setDeleteStickerIds}
        setEmojiEditStickerIds={openReplaceEmojis}
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
          initialEmojis={
            emojiEditMode === "append"
              ? []
              : initialEmojiSelection(emojiEditStickerIds, data.stickerById)
          }
          onConfirm={handleEmojiConfirm}
          onClose={() => setEmojiEditStickerIds(null)}
        />
      ) : null}
    </>
  );
}
