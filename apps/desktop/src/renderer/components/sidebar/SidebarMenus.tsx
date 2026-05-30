import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import IosShareIcon from "@mui/icons-material/IosShare";
import ManageAccountsIcon from "@mui/icons-material/ManageAccounts";
import PhotoIcon from "@mui/icons-material/Photo";
import Divider from "@mui/material/Divider";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import type { TelegramState } from "@sticker-smith/shared";
import { appTokens } from "../../../theme/appTokens";
import {
  browserMenuIconSx,
  browserMenuPaperSx,
  browserMenuTitleSx,
} from "../browserStyles";
import { statusLabelForTelegram } from "./sidebarModelUtils";
import type { PackContextMenuState, SidebarProps } from "./types";
import type { SidebarModel } from "./useSidebarModel";

function PackContextMenu({
  contextMenu,
  onClose,
  onRename,
  onOpenStickers,
  onChooseIcon,
  onExportStickers,
  onDelete,
}: {
  contextMenu: PackContextMenuState;
  onClose: () => void;
  onRename: () => void;
  onOpenStickers: () => void;
  onChooseIcon: () => void;
  onExportStickers: () => void;
  onDelete: () => void;
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
      {contextMenu && (
        <MenuItem disabled dense sx={browserMenuTitleSx}>
          {contextMenu.pack.name}
        </MenuItem>
      )}
      <Divider />
      <MenuItem onClick={onRename} dense>
        <EditIcon sx={browserMenuIconSx} />
        {appTokens.copy.actions.rename}
      </MenuItem>
      <MenuItem onClick={onOpenStickers} dense>
        <FolderOpenIcon sx={browserMenuIconSx} />
        {appTokens.copy.actions.openFolder}
      </MenuItem>
      <MenuItem onClick={onChooseIcon} dense>
        <PhotoIcon sx={browserMenuIconSx} />
        Change icon
      </MenuItem>
      <MenuItem onClick={onExportStickers} dense>
        <IosShareIcon sx={browserMenuIconSx} />
        {appTokens.copy.actions.export}
      </MenuItem>
      <MenuItem onClick={onDelete} dense sx={{ color: "error.light" }}>
        <DeleteIcon sx={browserMenuIconSx} />
        {appTokens.copy.actions.delete}
      </MenuItem>
    </Menu>
  );
}

function TelegramAccountMenu({
  anchorEl,
  telegramState,
  telegramManageLabel,
  onClose,
  onManage,
  onLogoutTelegram,
  onResetTelegram,
}: {
  anchorEl: HTMLElement | null;
  telegramState: TelegramState | null;
  telegramManageLabel: string;
  onClose: () => void;
  onManage: () => void;
  onLogoutTelegram: () => Promise<unknown>;
  onResetTelegram: () => Promise<unknown>;
}) {
  return (
    <Menu
      anchorEl={anchorEl}
      open={Boolean(anchorEl)}
      onClose={onClose}
      slotProps={{ paper: { sx: { minWidth: appTokens.sizes.menu.telegram } } }}
    >
      <MenuItem disabled dense sx={browserMenuTitleSx}>
        {statusLabelForTelegram(telegramState)}
      </MenuItem>
      {telegramState?.sessionUser ? (
        <MenuItem
          disabled
          dense
          sx={{
            opacity: "1 !important",
            fontSize: appTokens.typography.fontSizes.caption,
            color: "text.secondary",
          }}
        >
          {telegramState.sessionUser.username
            ? `${telegramState.sessionUser.displayName} (@${telegramState.sessionUser.username})`
            : telegramState.sessionUser.displayName}
        </MenuItem>
      ) : null}
      <Divider />
      <MenuItem onClick={onManage} dense>
        <ManageAccountsIcon sx={browserMenuIconSx} />
        {telegramManageLabel}
      </MenuItem>
      {telegramState?.status === "connected" ? (
        <MenuItem
          onClick={() => {
            onClose();
            void onLogoutTelegram().catch(() => undefined);
          }}
          dense
        >
          {appTokens.copy.actions.logout}
        </MenuItem>
      ) : (
        <MenuItem
          onClick={() => {
            onClose();
            void onResetTelegram().catch(() => undefined);
          }}
          dense
        >
          {appTokens.copy.actions.resetTelegram}
        </MenuItem>
      )}
    </Menu>
  );
}

export function SidebarMenus({
  model,
  props,
}: {
  model: SidebarModel;
  props: SidebarProps;
}) {
  return (
    <>
      <PackContextMenu
        contextMenu={model.contextMenu}
        onClose={model.handleCloseMenu}
        onRename={model.handleRenameOpen}
        onOpenStickers={model.handleOpenStickers}
        onChooseIcon={model.handleChooseIcon}
        onExportStickers={model.handleExportStickers}
        onDelete={model.handleDelete}
      />
      <TelegramAccountMenu
        anchorEl={model.telegramMenuAnchor}
        telegramState={props.telegramState}
        telegramManageLabel={model.telegramManageLabel}
        onClose={() => model.setTelegramMenuAnchor(null)}
        onManage={() => {
          model.setTelegramMenuAnchor(null);
          model.setTelegramDialogOpen(true);
        }}
        onLogoutTelegram={props.onLogoutTelegram}
        onResetTelegram={props.onResetTelegram}
      />
    </>
  );
}
