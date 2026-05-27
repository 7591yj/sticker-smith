import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dispatch, MouseEvent, SetStateAction } from "react";
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

type StickerContextMenu = { mouseX: number; mouseY: number; stickerIds: string[] } | null;

interface StickerSelectionState {
  selectedStickerIds: string[];
  selectionAnchorId: string | null;
  setSelectedStickerIds: Dispatch<SetStateAction<string[]>>;
  setSelectionAnchorId: Dispatch<SetStateAction<string | null>>;
  selectOnly: (stickerId: string) => void;
  handleStickerClick: (event: MouseEvent<HTMLDivElement>, sticker: StickerItem) => void;
}

interface StickerDataState {
  sortedStickers: StickerItem[];
  stickerById: ReadonlyMap<string, StickerItem>;
  selectableStickerIds: string[];
}

export function StickerList({
  packId,
  stickers,
  iconStickerId,
  view,
  onViewChange,
  refreshDetails,
}: Props) {
  const data = useStickerData(stickers, iconStickerId);
  const selection = useStickerSelection(packId, data.selectableStickerIds);
  const [contextMenu, setContextMenu] = useState<StickerContextMenu>(null);
  const [emojiEditStickerIds, setEmojiEditStickerIds] = useState<string[] | null>(null);
  const contextStickers = getContextStickers(contextMenu, data.stickerById);

  useEffect(() => setContextMenu(null), [packId]);

  const handleContextMenu = useStickerContextMenu(selection.selectedStickerIds, selection.selectOnly, setContextMenu);
  const handleCloseContextMenu = useCallback(() => setContextMenu(null), []);
  const handleEmojiConfirm = useEmojiConfirm({ packId, refreshDetails, emojiEditStickerIds, selection, setEmojiEditStickerIds });

  return <>
    <StickerToolbar selectedStickerIds={selection.selectedStickerIds} totalCount={data.sortedStickers.length} selectableStickerIds={data.selectableStickerIds} setSelectedStickerIds={selection.setSelectedStickerIds} view={view} onViewChange={onViewChange} setEmojiEditStickerIds={setEmojiEditStickerIds} />
    <StickerBrowser stickers={data.sortedStickers} iconStickerId={iconStickerId} selectedStickerIds={selection.selectedStickerIds} view={view} selectOnly={selection.selectOnly} onStickerClick={selection.handleStickerClick} onContextMenu={handleContextMenu} setEmojiEditStickerIds={setEmojiEditStickerIds} />
    <StickerContextMenu contextMenu={contextMenu} contextStickers={contextStickers} onClose={handleCloseContextMenu} setEmojiEditStickerIds={setEmojiEditStickerIds} />
    {emojiEditStickerIds ? <EmojiPickerDialog open title={emojiEditStickerIds.length === 1 ? appTokens.copy.dialogs.editEmojis : appTokens.copy.dialogs.editSelectedEmojis} initialEmojis={initialEmojiSelection(emojiEditStickerIds, data.stickerById)} onConfirm={handleEmojiConfirm} onClose={() => setEmojiEditStickerIds(null)} /> : null}
  </>;
}

function useStickerData(stickers: StickerItem[], iconStickerId: string | null): StickerDataState {
  const sortedStickers = useMemo(() => sortItemsWithPinnedFirst(stickers, {
    getOrder: (sticker) => sticker.order,
    isPinned: (sticker) => sticker.id === iconStickerId,
  }), [iconStickerId, stickers]);
  const stickerById = useMemo(() => new Map(stickers.map((sticker) => [sticker.id, sticker])), [stickers]);
  const selectableStickerIds = useMemo(() => sortedStickers.map((sticker) => sticker.id), [sortedStickers]);
  return { sortedStickers, stickerById, selectableStickerIds };
}

function useStickerSelection(packId: string, selectableStickerIds: string[]): StickerSelectionState {
  const [selectedStickerIds, setSelectedStickerIds] = useState<string[]>([]);
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedStickerIds([]);
    setSelectionAnchorId(null);
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
    if (event.shiftKey && selectionAnchorId && selectStickerRange(selectionAnchorId, stickerId, selectableStickerIds, setSelectedStickerIds)) return;
    if (event.metaKey || event.ctrlKey) {
      setSelectedStickerIds((current) => current.includes(stickerId) ? current.filter((id) => id !== stickerId) : [...current, stickerId]);
      setSelectionAnchorId(stickerId);
      return;
    }
    selectOnly(stickerId);
  }, [selectOnly, selectableStickerIds, selectionAnchorId]);

  return { selectedStickerIds, selectionAnchorId, setSelectedStickerIds, setSelectionAnchorId, selectOnly, handleStickerClick };
}

function selectStickerRange(anchorId: string, stickerId: string, selectableStickerIds: string[], setSelectedStickerIds: (ids: string[]) => void) {
  const anchorIndex = selectableStickerIds.indexOf(anchorId);
  const currentIndex = selectableStickerIds.indexOf(stickerId);
  if (anchorIndex === -1 || currentIndex === -1) return false;
  const [start, end] = anchorIndex < currentIndex ? [anchorIndex, currentIndex] : [currentIndex, anchorIndex];
  setSelectedStickerIds(selectableStickerIds.slice(start, end + 1));
  return true;
}

function useStickerContextMenu(selectedStickerIds: string[], selectOnly: (stickerId: string) => void, setContextMenu: Dispatch<SetStateAction<StickerContextMenu>>) {
  return useCallback((event: MouseEvent, sticker: StickerItem) => {
    event.preventDefault();
    const isSelected = selectedStickerIds.includes(sticker.id);
    const nextSelected = isSelected ? selectedStickerIds : [sticker.id];
    if (!isSelected) selectOnly(sticker.id);
    setContextMenu({ mouseX: event.clientX, mouseY: event.clientY, stickerIds: nextSelected });
  }, [selectOnly, selectedStickerIds, setContextMenu]);
}

function useEmojiConfirm({ packId, refreshDetails, emojiEditStickerIds, selection, setEmojiEditStickerIds }: {
  packId: string;
  refreshDetails: () => Promise<StickerPackDetails>;
  emojiEditStickerIds: string[] | null;
  selection: Pick<StickerSelectionState, "setSelectedStickerIds" | "setSelectionAnchorId">;
  setEmojiEditStickerIds: Dispatch<SetStateAction<string[] | null>>;
}) {
  return useCallback(async (emojis: string[]) => {
    if (!emojiEditStickerIds?.length) return;
    if (emojiEditStickerIds.length === 1) await window.stickerSmith.stickers.setEmojis({ packId, stickerId: emojiEditStickerIds[0]!, emojis });
    else await window.stickerSmith.stickers.setEmojisMany({ packId, stickerIds: emojiEditStickerIds, emojis });
    setEmojiEditStickerIds(null);
    selection.setSelectedStickerIds(emojiEditStickerIds);
    selection.setSelectionAnchorId(emojiEditStickerIds[0] ?? null);
    await refreshDetails();
  }, [emojiEditStickerIds, packId, refreshDetails, selection, setEmojiEditStickerIds]);
}

function StickerToolbar({ selectedStickerIds, totalCount, selectableStickerIds, setSelectedStickerIds, view, onViewChange, setEmojiEditStickerIds }: {
  selectedStickerIds: string[];
  totalCount: number;
  selectableStickerIds: string[];
  setSelectedStickerIds: Dispatch<SetStateAction<string[]>>;
  view: BrowserView;
  onViewChange: (view: BrowserView) => void;
  setEmojiEditStickerIds: Dispatch<SetStateAction<string[] | null>>;
}) {
  return <Box sx={browserToolbarSx}>
    <Typography variant="caption" color="text.secondary" sx={browserCountLabelSx}>{selectedStickerIds.length > 0 ? formatCountLabel(selectedStickerIds.length, "selected sticker") : formatCountLabel(totalCount, "sticker")}</Typography>
    <Button size="small" variant="outlined" onClick={() => setSelectedStickerIds(selectableStickerIds)} disabled={selectableStickerIds.length === 0} sx={{ textTransform: "none" }}>{appTokens.copy.actions.selectAll}</Button>
    <Button size="small" variant="outlined" onClick={() => setSelectedStickerIds([])} disabled={selectedStickerIds.length === 0} sx={{ textTransform: "none" }}>{appTokens.copy.actions.clearSelection}</Button>
    {selectedStickerIds.length > 0 ? <Button size="small" variant="outlined" onClick={() => setEmojiEditStickerIds(selectedStickerIds)} sx={{ textTransform: "none" }}>{appTokens.copy.actions.editEmojis}</Button> : null}
    <Box sx={{ ml: "auto" }}><BrowserViewToggle compact ariaLabel={`${appTokens.copy.labels.stickers} view`} view={view} onChange={onViewChange} /></Box>
  </Box>;
}

function StickerBrowser({ stickers, iconStickerId, selectedStickerIds, view, selectOnly, onStickerClick, onContextMenu, setEmojiEditStickerIds }: {
  stickers: StickerItem[];
  iconStickerId: string | null;
  selectedStickerIds: string[];
  view: BrowserView;
  selectOnly: (stickerId: string) => void;
  onStickerClick: (event: MouseEvent<HTMLDivElement>, sticker: StickerItem) => void;
  onContextMenu: (event: MouseEvent, sticker: StickerItem) => void;
  setEmojiEditStickerIds: Dispatch<SetStateAction<string[] | null>>;
}) {
  return <Box sx={{ pb: 2.5 }}>
    {stickers.length === 0 ? <Typography variant="body2" color="text.secondary" sx={{ px: 2.5, py: 3, fontSize: appTokens.typography.fontSizes.bodyDefault }}>{appTokens.copy.emptyStates.noStickers}</Typography> :
      <Box sx={view === "list" ? browserListContainerSx : browserGridContainerSx}>
        {stickers.map((sticker) => renderBrowserItem(view, {
          key: sticker.id,
          title: buildStickerTitle(sticker),
          label: formatStickerLabel(sticker),
          isPinned: sticker.id === iconStickerId,
          selected: selectedStickerIds.includes(sticker.id),
          onClick: (event) => onStickerClick(event, sticker),
          onDoubleClick: () => { selectOnly(sticker.id); setEmojiEditStickerIds([sticker.id]); },
          onContextMenu: (event) => onContextMenu(event, sticker),
          preview: <FilePreview absolutePath={sticker.absolutePath} relativePath={sticker.relativePath} />,
          metadata: buildStickerMetadata(sticker),
        }))}
      </Box>}
  </Box>;
}

function StickerContextMenu({ contextMenu, contextStickers, onClose, setEmojiEditStickerIds }: {
  contextMenu: StickerContextMenu;
  contextStickers: StickerItem[];
  onClose: () => void;
  setEmojiEditStickerIds: Dispatch<SetStateAction<string[] | null>>;
}) {
  return <Menu open={Boolean(contextMenu)} onClose={onClose} anchorReference="anchorPosition" anchorPosition={contextMenu ? { top: contextMenu.mouseY, left: contextMenu.mouseX } : undefined} slotProps={{ paper: { sx: browserMenuPaperSx } }}>
    {contextStickers.length > 0 ? <MenuItem disabled dense sx={browserMenuTitleSx}>{contextStickers.length === 1 ? formatOrderLabel(contextStickers[0]!.order) : formatCountLabel(contextStickers.length, "selected sticker")}</MenuItem> : null}
    <Divider />
    <MenuItem onClick={() => { setEmojiEditStickerIds(contextStickers.map((s) => s.id)); onClose(); }} dense><InsertEmoticonIcon sx={browserMenuIconSx} />{appTokens.copy.actions.editEmojis}</MenuItem>
  </Menu>;
}

function getContextStickers(contextMenu: StickerContextMenu, stickerById: ReadonlyMap<string, StickerItem>) {
  return (contextMenu?.stickerIds ?? [])
    .map((stickerId) => stickerById.get(stickerId))
    .filter((sticker): sticker is StickerItem => sticker !== undefined);
}

function initialEmojiSelection(stickerIds: string[], stickerById: ReadonlyMap<string, StickerItem>) {
  const current = stickerIds.map((id) => stickerById.get(id)).filter((sticker): sticker is StickerItem => sticker !== undefined);
  if (current.length === 0) return [];
  const [first, ...rest] = current;
  const firstValue = first.emojiList.join(" ");
  return rest.every((sticker) => sticker.emojiList.join(" ") === firstValue) ? [...first.emojiList] : [];
}
