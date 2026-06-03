import { useState, type MouseEvent } from "react";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import IosShareIcon from "@mui/icons-material/IosShare";
import MenuIcon from "@mui/icons-material/Menu";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";
import type { StickerPack } from "@sticker-smith/shared";
import { appTokens } from "../../../theme/appTokens";

export function PackHeaderOverflowMenu({
  pack,
  stickerCount,
  onRename,
  onDelete,
  onOpenStickers,
  onExportStickers,
}: {
  pack: StickerPack;
  stickerCount: number;
  onRename: () => void;
  onDelete: () => void;
  onOpenStickers: () => void;
  onExportStickers: () => void;
}) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const deleteTooltip =
    pack.source === "local"
      ? appTokens.copy.tooltips.deletePack
      : appTokens.copy.tooltips.deleteTelegramPack;
  const handleOpen = (event: MouseEvent<HTMLButtonElement>) =>
    setAnchorEl(event.currentTarget);
  const handleClose = () => setAnchorEl(null);
  const handleMenuAction = (action: () => void) => {
    handleClose();
    action();
  };

  return (
    <>
      <Tooltip title="More pack actions">
        <IconButton
          size="small"
          aria-label="More pack actions"
          aria-haspopup="menu"
          aria-expanded={anchorEl ? "true" : undefined}
          onClick={handleOpen}
          sx={{
            color: "text.secondary",
            opacity: 0.72,
            "&:hover": { opacity: 1, bgcolor: "action.hover" },
          }}
        >
          <MenuIcon sx={{ fontSize: appTokens.sizes.icon.panelAction }} />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        slotProps={{
          paper: {
            sx: {
              minWidth: 180,
              bgcolor: "background.paper",
              border: 1,
              borderColor: "divider",
            },
          },
        }}
      >
        <MenuItem onClick={() => handleMenuAction(onOpenStickers)} dense>
          <ListItemIcon>
            <FolderOpenIcon sx={{ fontSize: appTokens.sizes.icon.action }} />
          </ListItemIcon>
          <ListItemText>{appTokens.copy.actions.openFolder}</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => handleMenuAction(onExportStickers)}
          disabled={stickerCount === 0}
          dense
        >
          <ListItemIcon>
            <IosShareIcon sx={{ fontSize: appTokens.sizes.icon.action }} />
          </ListItemIcon>
          <ListItemText>{appTokens.copy.actions.export}</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => handleMenuAction(onRename)} dense>
          <ListItemIcon>
            <EditIcon sx={{ fontSize: appTokens.sizes.icon.action }} />
          </ListItemIcon>
          <ListItemText>{appTokens.copy.actions.rename}</ListItemText>
        </MenuItem>
        <Tooltip title={deleteTooltip} placement="left">
          <span>
            <MenuItem
              onClick={() => handleMenuAction(onDelete)}
              disabled={pack.source !== "local"}
              dense
              sx={{ color: "error.main" }}
            >
              <ListItemIcon>
                <DeleteIcon
                  color="error"
                  sx={{ fontSize: appTokens.sizes.icon.action }}
                />
              </ListItemIcon>
              <ListItemText>{appTokens.copy.actions.delete}</ListItemText>
            </MenuItem>
          </span>
        </Tooltip>
      </Menu>
    </>
  );
}
