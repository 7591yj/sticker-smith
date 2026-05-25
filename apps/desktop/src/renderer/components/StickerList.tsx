import { useCallback, useEffect, useMemo, useState } from "react";
import type { MouseEvent } from "react";
import InsertEmoticonIcon from "@mui/icons-material/InsertEmoticon";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import type { StickerItem, StickerPackDetails } from "@sticker-smith/shared";
import { appTokens } from "../../theme/appTokens";
import { EmojiPickerDialog } from "./EmojiPickerDialog";
import {
  browserCountLabelSx,
  browserGridContainerSx,
  browserListContainerSx,
  browserMenuIconSx,
  browserMenuPaperSx,
  browserMenuTitleSx,
  browserToolbarSx,
  formatCountLabel,
} from "./browserStyles";
import {
  BrowserViewToggle,
  type BrowserView,
  FilePreview,
  sortItemsWithPinnedFirst,
} from "./fileBrowser";
import {
  buildStickerMetadata,
  buildStickerTitle,
  formatOrderLabel,
  formatStickerLabel,
  renderBrowserItem,
} from "./browserItemUtils";

interface Props {
  packId: string;
  stickers: StickerItem[];
  iconStickerId: string | null;
  view: BrowserView;
  onViewChange: (view: BrowserView) => void;
  refreshDetails: () => Promise<StickerPackDetails>;
}

export function StickerList({
  packId,
  stickers,
  iconStickerId,
  view,
  onViewChange,
  refreshDetails,
}: Props) {
  const [selectedStickerIds, setSelectedStickerIds] = useState<string[]>([]);
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
    stickerIds: string[];
  } | null>(null);
  const [emojiEditStickerIds, setEmojiEditStickerIds] = useState<string[] | null>(null);

  const sortedStickers = useMemo(
    () => sortItemsWithPinnedFirst(stickers, {
      getOrder: (sticker) => sticker.order,
      isPinned: (sticker) => sticker.id === iconStickerId,
    }),
    [iconStickerId, stickers],
  );
  const stickerById = useMemo(
    () => new Map(stickers.map((sticker) => [sticker.id, sticker])),
    [stickers],
  );
  const selectableStickerIds = useMemo(
    () => sortedStickers.map((sticker) => sticker.id),
    [sortedStickers],
  );
  const contextStickers = (contextMenu?.stickerIds ?? [])
    .map((stickerId) => stickerById.get(stickerId))
    .filter((sticker): sticker is StickerItem => sticker !== undefined);

  useEffect(() => {
    setSelectedStickerIds([]);
    setSelectionAnchorId(null);
    setContextMenu(null);
  }, [packId]);

  useEffect(() => {
    const selectableIds = new Set(selectableStickerIds);
    setSelectedStickerIds((current) => current.filter((id) => selectableIds.has(id)));
    setSelectionAnchorId((current) => current && selectableIds.has(current) ? current : null);
  }, [selectableStickerIds]);

  const selectOnly = useCallback((stickerId: string) => {
    setSelectedStickerIds([stickerId]);
    setSelectionAnchorId(stickerId);
  }, []);

  const handleStickerClick = useCallback((event: MouseEvent<HTMLDivElement>, sticker: StickerItem) => {
    const stickerId = sticker.id;
    if (event.shiftKey && selectionAnchorId) {
      const anchorIndex = selectableStickerIds.indexOf(selectionAnchorId);
      const currentIndex = selectableStickerIds.indexOf(stickerId);
      if (anchorIndex !== -1 && currentIndex !== -1) {
        const [start, end] = anchorIndex < currentIndex ? [anchorIndex, currentIndex] : [currentIndex, anchorIndex];
        setSelectedStickerIds(selectableStickerIds.slice(start, end + 1));
        return;
      }
    }
    if (event.metaKey || event.ctrlKey) {
      setSelectedStickerIds((current) => current.includes(stickerId) ? current.filter((id) => id !== stickerId) : [...current, stickerId]);
      setSelectionAnchorId(stickerId);
      return;
    }
    selectOnly(stickerId);
  }, [selectOnly, selectableStickerIds, selectionAnchorId]);

  const handleContextMenu = useCallback((event: MouseEvent, sticker: StickerItem) => {
    event.preventDefault();
    const isSelected = selectedStickerIds.includes(sticker.id);
    const nextSelected = isSelected ? selectedStickerIds : [sticker.id];
    if (!isSelected) selectOnly(sticker.id);
    setContextMenu({ mouseX: event.clientX, mouseY: event.clientY, stickerIds: nextSelected });
  }, [selectOnly, selectedStickerIds]);

  const handleCloseContextMenu = useCallback(() => setContextMenu(null), []);

  const handleEmojiConfirm = useCallback(async (emojis: string[]) => {
    if (!emojiEditStickerIds?.length) return;
    if (emojiEditStickerIds.length === 1) {
      await window.stickerSmith.stickers.setEmojis({ packId, stickerId: emojiEditStickerIds[0]!, emojis });
    } else {
      await window.stickerSmith.stickers.setEmojisMany({ packId, stickerIds: emojiEditStickerIds, emojis });
    }
    setEmojiEditStickerIds(null);
    setSelectedStickerIds(emojiEditStickerIds);
    setSelectionAnchorId(emojiEditStickerIds[0] ?? null);
    await refreshDetails();
  }, [emojiEditStickerIds, packId, refreshDetails]);

  return <>
    <Box sx={browserToolbarSx}>
      <Typography variant="caption" color="text.secondary" sx={browserCountLabelSx}>
        {selectedStickerIds.length > 0 ? formatCountLabel(selectedStickerIds.length, "selected sticker") : formatCountLabel(sortedStickers.length, "sticker")}
      </Typography>
      <Button size="small" variant="outlined" onClick={() => setSelectedStickerIds(selectableStickerIds)} disabled={selectableStickerIds.length === 0} sx={{ textTransform: "none" }}>{appTokens.copy.actions.selectAll}</Button>
      <Button size="small" variant="outlined" onClick={() => setSelectedStickerIds([])} disabled={selectedStickerIds.length === 0} sx={{ textTransform: "none" }}>{appTokens.copy.actions.clearSelection}</Button>
      {selectedStickerIds.length > 0 ? <Button size="small" variant="outlined" onClick={() => setEmojiEditStickerIds(selectedStickerIds)} sx={{ textTransform: "none" }}>{appTokens.copy.actions.editEmojis}</Button> : null}
      <Box sx={{ ml: "auto" }}><BrowserViewToggle compact ariaLabel={`${appTokens.copy.labels.stickers} view`} view={view} onChange={onViewChange} /></Box>
    </Box>
    <Box sx={{ pb: 2.5 }}>
      {sortedStickers.length === 0 ? <Typography variant="body2" color="text.secondary" sx={{ px: 2.5, py: 3, fontSize: appTokens.typography.fontSizes.bodyDefault }}>{appTokens.copy.emptyStates.noStickers}</Typography> :
        <Box sx={view === "list" ? browserListContainerSx : browserGridContainerSx}>
          {sortedStickers.map((sticker) => renderBrowserItem(view, {
            key: sticker.id,
            title: buildStickerTitle(sticker),
            label: formatStickerLabel(sticker),
            isPinned: sticker.id === iconStickerId,
            selected: selectedStickerIds.includes(sticker.id),
            onClick: (event) => handleStickerClick(event, sticker),
            onDoubleClick: () => { selectOnly(sticker.id); setEmojiEditStickerIds([sticker.id]); },
            onContextMenu: (event) => handleContextMenu(event, sticker),
            preview: <FilePreview absolutePath={sticker.absolutePath} relativePath={sticker.relativePath} />,
            metadata: buildStickerMetadata(sticker),
          }))}
        </Box>}
    </Box>
    <Menu open={Boolean(contextMenu)} onClose={handleCloseContextMenu} anchorReference="anchorPosition" anchorPosition={contextMenu ? { top: contextMenu.mouseY, left: contextMenu.mouseX } : undefined} slotProps={{ paper: { sx: browserMenuPaperSx } }}>
      {contextStickers.length > 0 ? <MenuItem disabled dense sx={browserMenuTitleSx}>{contextStickers.length === 1 ? formatOrderLabel(contextStickers[0]!.order) : formatCountLabel(contextStickers.length, "selected sticker")}</MenuItem> : null}
      <Divider />
      <MenuItem onClick={() => { setEmojiEditStickerIds(contextStickers.map((s) => s.id)); handleCloseContextMenu(); }} dense><InsertEmoticonIcon sx={browserMenuIconSx} />{appTokens.copy.actions.editEmojis}</MenuItem>
    </Menu>
    {emojiEditStickerIds ? <EmojiPickerDialog open title={emojiEditStickerIds.length === 1 ? appTokens.copy.dialogs.editEmojis : appTokens.copy.dialogs.editSelectedEmojis} initialEmojis={initialEmojiSelection(emojiEditStickerIds, stickerById)} onConfirm={handleEmojiConfirm} onClose={() => setEmojiEditStickerIds(null)} /> : null}
  </>;
}

function initialEmojiSelection(stickerIds: string[], stickerById: ReadonlyMap<string, StickerItem>) {
  const current = stickerIds.map((id) => stickerById.get(id)).filter((sticker): sticker is StickerItem => sticker !== undefined);
  if (current.length === 0) return [];
  const [first, ...rest] = current;
  const firstValue = first.emojiList.join(" ");
  return rest.every((sticker) => sticker.emojiList.join(" ") === firstValue) ? [...first.emojiList] : [];
}
