import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import InsertEmoticonIcon from "@mui/icons-material/InsertEmoticon";
import Divider from "@mui/material/Divider";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import type { StickerItem } from "@sticker-smith/shared";
import { appTokens } from "../../../theme/appTokens";
import {
  browserMenuIconSx,
  browserMenuPaperSx,
  browserMenuTitleSx,
  formatCountLabel,
} from "../browserStyles";
import { formatOrderLabel } from "../stickerOrder";
import type { StickerContextMenuState } from "./types";
import { useStickerContextMenuActions } from "./useStickerContextMenuActions";

export function StickerContextMenu({
  contextMenu,
  contextStickers,
  onClose,
  onDeleteStickers,
  setEmojiEditStickerIds,
}: {
  contextMenu: StickerContextMenuState;
  contextStickers: StickerItem[];
  onClose: () => void;
  onDeleteStickers: (stickerIds: string[]) => void;
  setEmojiEditStickerIds: (stickerIds: string[]) => void;
}) {
  const { stickerIds, editEmojis, deleteStickers } = useStickerContextMenuActions({
    contextStickers,
    onClose,
    onDeleteStickers,
    setEmojiEditStickerIds,
  });

  return (
    <Menu
      open={Boolean(contextMenu)}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={
        contextMenu
          ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
          : undefined
      }
      slotProps={{ paper: { sx: browserMenuPaperSx } }}
    >
      {contextStickers.length > 0 ? (
        <MenuItem disabled dense sx={browserMenuTitleSx}>
          {contextStickers.length === 1
            ? formatOrderLabel(contextStickers[0]!.order)
            : formatCountLabel(contextStickers.length, "selected sticker")}
        </MenuItem>
      ) : null}
      <Divider />
      <MenuItem onClick={editEmojis} dense>
        <InsertEmoticonIcon sx={browserMenuIconSx} />
        {appTokens.copy.actions.editEmojis}
      </MenuItem>
      <Divider />
      <MenuItem
        disabled={stickerIds.length === 0}
        onClick={deleteStickers}
        dense
        sx={{ color: "error.main" }}
      >
        <DeleteOutlineIcon sx={{ ...browserMenuIconSx, color: "inherit" }} />
        {appTokens.copy.actions.delete}
      </MenuItem>
    </Menu>
  );
}
