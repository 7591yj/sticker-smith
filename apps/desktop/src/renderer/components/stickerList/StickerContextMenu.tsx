import type { Dispatch, SetStateAction } from "react";
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
import { formatOrderLabel } from "../browserItemUtils";
import type { StickerContextMenuState } from "./types";

export function StickerContextMenu({
  contextMenu,
  contextStickers,
  onClose,
  setEmojiEditStickerIds,
}: {
  contextMenu: StickerContextMenuState;
  contextStickers: StickerItem[];
  onClose: () => void;
  setEmojiEditStickerIds: Dispatch<SetStateAction<string[] | null>>;
}) {
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
      <MenuItem
        onClick={() => {
          setEmojiEditStickerIds(contextStickers.map((sticker) => sticker.id));
          onClose();
        }}
        dense
      >
        <InsertEmoticonIcon sx={browserMenuIconSx} />
        {appTokens.copy.actions.editEmojis}
      </MenuItem>
    </Menu>
  );
}
