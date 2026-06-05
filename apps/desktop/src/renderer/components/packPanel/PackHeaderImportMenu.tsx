import { useState, type MouseEvent } from "react";
import AddIcon from "@mui/icons-material/Add";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import Button from "@mui/material/Button";
import ButtonGroup from "@mui/material/ButtonGroup";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import { appTokens } from "../../../theme/appTokens";
import { panelPrimaryButtonSx } from "./packPanelStyles";

export function PackHeaderImportMenu({
  disabled,
  onImportFiles,
  onImportDir,
}: {
  disabled: boolean;
  onImportFiles: () => void;
  onImportDir: () => void;
}) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  const handleOpen = (event: MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleAction = (action: () => void) => {
    handleClose();
    action();
  };

  return (
    <>
      <ButtonGroup
        size="small"
        variant="contained"
        disableElevation
        disabled={disabled}
        sx={{
          borderRadius: appTokens.shape.radius.control,
          overflow: "hidden",
          boxShadow: "none",
          "& .MuiButton-root": {
            ...panelPrimaryButtonSx,
            minHeight: 34,
            borderRadius: 0,
            boxShadow: "none",
            whiteSpace: "nowrap",
          },
          "& .MuiButton-root:first-of-type": {
            borderTopLeftRadius: appTokens.shape.radius.control,
            borderBottomLeftRadius: appTokens.shape.radius.control,
          },
          "& .MuiButton-root:last-of-type": {
            minWidth: 0,
            p: "4px",
            borderTopRightRadius: appTokens.shape.radius.control,
            borderBottomRightRadius: appTokens.shape.radius.control,
          },
        }}
      >
        <Button
          startIcon={<AddIcon sx={{ fontSize: appTokens.sizes.icon.action }} />}
          disabled={disabled}
          title="Add sticker files to this pack"
          onClick={onImportFiles}
        >
          {appTokens.copy.actions.import}
        </Button>
        <Button
          disabled={disabled}
          title="Import options"
          aria-label="Import options"
          aria-haspopup="menu"
          aria-expanded={open ? "true" : undefined}
          onClick={handleOpen}
          sx={{ minWidth: 0, p: "4px" }}
        >
          <ArrowDropDownIcon sx={{ fontSize: appTokens.sizes.icon.action }} />
        </Button>
      </ButtonGroup>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: {
            sx: {
              minWidth: 160,
              bgcolor: "background.paper",
              border: 1,
              borderColor: "divider",
              mt: 0.5,
            },
          },
        }}
      >
        <MenuItem onClick={() => handleAction(onImportFiles)} dense>
          <ListItemIcon>
            <AddIcon sx={{ fontSize: appTokens.sizes.icon.action }} />
          </ListItemIcon>
          <ListItemText>{appTokens.copy.actions.addFiles}</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => handleAction(onImportDir)} dense>
          <ListItemIcon>
            <CreateNewFolderIcon
              sx={{ fontSize: appTokens.sizes.icon.action }}
            />
          </ListItemIcon>
          <ListItemText>{appTokens.copy.actions.addFolder}</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}
