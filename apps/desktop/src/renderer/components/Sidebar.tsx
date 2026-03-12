import { useState, useCallback } from "react";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import DriveFileMoveIcon from "@mui/icons-material/DriveFileMove";
import EditIcon from "@mui/icons-material/Edit";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import IosShareIcon from "@mui/icons-material/IosShare";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import LayersIcon from "@mui/icons-material/Layers";
import SyncIcon from "@mui/icons-material/Sync";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemAvatar from "@mui/material/ListItemAvatar";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { StickerPack, TelegramState } from "@sticker-smith/shared";
import { appTokens } from "../../theme/appTokens";
import { RenameDialog } from "./RenameDialog";
import { TelegramAuthDialog } from "./TelegramAuthDialog";
import { toFileUrl } from "../utils/fileUrl";

function isVideoThumbnail(filePath: string) {
  return filePath.toLowerCase().endsWith(".webm");
}

function PackThumbnail({
  name,
  thumbnailPath,
}: {
  name: string;
  thumbnailPath: string | null;
}) {
  const isVideo = thumbnailPath ? isVideoThumbnail(thumbnailPath) : false;

  return (
    <ListItemAvatar sx={{ minWidth: 32 }}>
      <Box
        sx={{
          width: appTokens.sizes.thumbnail,
          height: appTokens.sizes.thumbnail,
          borderRadius: appTokens.radii.thumbnail / 8,
          bgcolor: "action.hover",
          border: "1px solid",
          borderColor: "divider",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {thumbnailPath ? (
          <Box
            component={isVideo ? "video" : "img"}
            src={toFileUrl(thumbnailPath)}
            alt={isVideo ? undefined : name}
            aria-label={isVideo ? `${name} icon preview` : undefined}
            muted={isVideo ? true : undefined}
            autoPlay={isVideo ? true : undefined}
            loop={isVideo ? true : undefined}
            playsInline={isVideo ? true : undefined}
            preload={isVideo ? "metadata" : undefined}
            sx={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />
        ) : (
          <Inventory2OutlinedIcon
            aria-label={`${name} fallback pack icon`}
            sx={{
              fontSize: appTokens.sizes.thumbnail - 4,
              color: "text.secondary",
            }}
          />
        )}
      </Box>
    </ListItemAvatar>
  );
}

interface Props {
  packs: StickerPack[];
  telegramState: TelegramState | null;
  selectedPackId: string | null;
  onSelect: (id: string) => void;
  onSubmitTelegramTdlibParameters: (input: {
    apiId: string;
    apiHash: string;
  }) => Promise<unknown>;
  onSubmitTelegramPhoneNumber: (input: {
    phoneNumber: string;
  }) => Promise<unknown>;
  onSubmitTelegramCode: (input: { code: string }) => Promise<unknown>;
  onSubmitTelegramPassword: (input: { password: string }) => Promise<unknown>;
  onLogoutTelegram: () => Promise<unknown>;
  onSyncTelegramPacks: () => Promise<unknown>;
  refreshPacks: () => Promise<StickerPack[]>;
  setSelectedPackId: (id: string | null) => void;
}

function statusLabelForTelegram(state: TelegramState | null) {
  if (!state) {
    return appTokens.copy.labels.telegramDisconnected;
  }

  if (state.status === "connected") {
    return appTokens.copy.labels.telegramConnected;
  }

  if (state.authStep === "wait_code") {
    return appTokens.copy.labels.telegramNeedsCode;
  }

  if (state.authStep === "wait_password") {
    return appTokens.copy.labels.telegramNeedsPassword;
  }

  if (state.status === "awaiting_credentials") {
    return appTokens.copy.labels.telegramNeedsCredentials;
  }

  return appTokens.copy.labels.telegramDisconnected;
}

export function Sidebar({
  packs,
  telegramState,
  selectedPackId,
  onSelect,
  onSubmitTelegramTdlibParameters,
  onSubmitTelegramPhoneNumber,
  onSubmitTelegramCode,
  onSubmitTelegramPassword,
  onLogoutTelegram,
  onSyncTelegramPacks,
  refreshPacks,
  setSelectedPackId,
}: Props) {
  const localPacks = packs.filter((pack) => pack.source === "local");
  const telegramPacks = packs.filter((pack) => pack.source === "telegram");
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
    pack: StickerPack;
  } | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [renamePack, setRenamePack] = useState<StickerPack | null>(null);
  const [telegramDialogOpen, setTelegramDialogOpen] = useState(false);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, pack: StickerPack) => {
      if (pack.source !== "local") {
        return;
      }
      e.preventDefault();
      setContextMenu({ mouseX: e.clientX, mouseY: e.clientY, pack });
    },
    [],
  );

  const handleCloseMenu = useCallback(() => setContextMenu(null), []);

  const handleCreate = async (name: string) => {
    const pack = await window.stickerSmith.packs.create({ name });
    await refreshPacks();
    setSelectedPackId(pack.id);
    setCreateDialogOpen(false);
  };

  const handleImportDir = async () => {
    const result = await window.stickerSmith.packs.createFromDirectory();
    if (result) {
      await refreshPacks();
      setSelectedPackId(result.pack.id);
    }
  };

  const handleRenameOpen = useCallback(() => {
    if (!contextMenu) return;
    setRenamePack(contextMenu.pack);
    handleCloseMenu();
  }, [contextMenu, handleCloseMenu]);

  const handleRenameConfirm = async (name: string) => {
    if (!renamePack) return;
    await window.stickerSmith.packs.rename({ packId: renamePack.id, name });
    await refreshPacks();
    setRenamePack(null);
  };

  const handleDelete = useCallback(async () => {
    if (!contextMenu) return;
    const { pack } = contextMenu;
    handleCloseMenu();
    await window.stickerSmith.packs.delete({ packId: pack.id });
    const next = await refreshPacks();
    if (selectedPackId === pack.id) {
      setSelectedPackId(next[0]?.id ?? null);
    }
  }, [
    contextMenu,
    handleCloseMenu,
    refreshPacks,
    selectedPackId,
    setSelectedPackId,
  ]);

  const handleOpenOutputs = useCallback(async () => {
    if (!contextMenu) return;
    const { pack } = contextMenu;
    handleCloseMenu();
    await window.stickerSmith.outputs.revealInFolder({ packId: pack.id });
  }, [contextMenu, handleCloseMenu]);

  const handleExportOutputs = useCallback(async () => {
    if (!contextMenu) return;
    const { pack } = contextMenu;
    handleCloseMenu();
    await window.stickerSmith.outputs.exportFolder({ packId: pack.id });
  }, [contextMenu, handleCloseMenu]);

  const renderPackList = (sectionPacks: StickerPack[], emptyState: string) => {
    if (sectionPacks.length === 0) {
      return (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            px: 2,
            py: 1.5,
            fontSize: appTokens.typography.fontSizes.body,
          }}
        >
          {emptyState}
        </Typography>
      );
    }

    return sectionPacks.map((pack) => (
      <ListItemButton
        key={pack.id}
        selected={pack.id === selectedPackId}
        onClick={() => onSelect(pack.id)}
        onContextMenu={(e) => handleContextMenu(e, pack)}
        dense
        sx={{ borderRadius: appTokens.radii.panel / 8 }}
      >
        <PackThumbnail name={pack.name} thumbnailPath={pack.thumbnailPath} />
        <ListItemText
          primary={pack.name}
          secondary={
            pack.telegram?.syncState && pack.source === "telegram"
              ? pack.telegram.syncState
              : undefined
          }
          primaryTypographyProps={{
            variant: "body2",
            noWrap: true,
            fontWeight: pack.id === selectedPackId ? 600 : 400,
            fontSize: appTokens.typography.fontSizes.bodyDefault,
          }}
          secondaryTypographyProps={{
            variant: "caption",
            noWrap: true,
          }}
        />
      </ListItemButton>
    ));
  };

  return (
    <Box
      sx={{
        width: appTokens.layout.sidebarWidth,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        bgcolor: "background.paper",
        borderRight: 1,
        borderColor: "divider",
        height: "100%",
      }}
    >
      <Box
        sx={{ px: 1.5, py: 1, display: "flex", alignItems: "center", gap: 0.5 }}
      >
        <LayersIcon
          sx={{ color: "primary.main", fontSize: appTokens.sizes.sidebarBrandIcon, mr: 0.5 }}
        />
        <Typography
          variant="subtitle2"
          fontWeight={appTokens.typography.fontWeights.bold}
          sx={{ flex: 1, letterSpacing: appTokens.typography.letterSpacing.tight }}
        >
          {appTokens.copy.appName}
        </Typography>
        <Tooltip title={appTokens.copy.labels.importFolderAsNewPack}>
          <IconButton size="small" onClick={handleImportDir}>
            <DriveFileMoveIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={appTokens.copy.actions.newPack}>
          <IconButton size="small" onClick={() => setCreateDialogOpen(true)}>
            <AddIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <Divider />

      <List sx={{ flex: 1, overflowY: "auto", py: 0.5, px: 0.5 }}>
        <Typography
          variant="overline"
          color="text.secondary"
          sx={{
            display: "block",
            px: 1.5,
            pt: 0.75,
            pb: 0.25,
            letterSpacing: appTokens.typography.letterSpacing.overline,
            fontSize: appTokens.typography.fontSizes.overline,
          }}
        >
          {appTokens.copy.labels.localPacks}
        </Typography>
        {renderPackList(localPacks, appTokens.copy.emptyStates.noLocalPacks)}

        <Divider sx={{ my: 0.75 }} />

        <Typography
          variant="overline"
          color="text.secondary"
          sx={{
            display: "block",
            px: 1.5,
            pt: 0.5,
            pb: 0.25,
            letterSpacing: appTokens.typography.letterSpacing.overline,
            fontSize: appTokens.typography.fontSizes.overline,
          }}
        >
          {appTokens.copy.labels.telegramPacks}
        </Typography>
        <Box
          sx={{
            px: 1.5,
            pb: 1,
            display: "flex",
            flexDirection: "column",
            gap: 0.75,
          }}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: appTokens.typography.fontSizes.caption }}
          >
            {statusLabelForTelegram(telegramState)}
          </Typography>
          {telegramState?.sessionUser ? (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontSize: appTokens.typography.fontSizes.caption }}
            >
              {telegramState.sessionUser.username
                ? `${telegramState.sessionUser.displayName} (@${telegramState.sessionUser.username})`
                : telegramState.sessionUser.displayName}
            </Typography>
          ) : null}
          <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
            <Button
              size="small"
              variant="contained"
              onClick={() => setTelegramDialogOpen(true)}
              sx={{
                textTransform: "none",
                fontSize: appTokens.typography.fontSizes.bodyCompact,
              }}
            >
              {telegramState?.status === "connected"
                ? appTokens.copy.actions.manageTelegram
                : appTokens.copy.actions.connectTelegram}
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<SyncIcon sx={{ fontSize: `${appTokens.sizes.compactActionIcon}px !important` }} />}
              onClick={() => void onSyncTelegramPacks().catch(() => undefined)}
              disabled={telegramState?.status !== "connected"}
              sx={{
                textTransform: "none",
                fontSize: appTokens.typography.fontSizes.bodyCompact,
              }}
            >
              {telegramPacks.length > 0
                ? appTokens.copy.actions.resync
                : appTokens.copy.actions.sync}
            </Button>
            {telegramState?.status === "connected" ? (
              <Button
                size="small"
                variant="outlined"
                onClick={() => void onLogoutTelegram().catch(() => undefined)}
                sx={{
                  textTransform: "none",
                  fontSize: appTokens.typography.fontSizes.bodyCompact,
                }}
              >
                {appTokens.copy.actions.logout}
              </Button>
            ) : null}
          </Box>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: appTokens.typography.fontSizes.caption }}
          >
            {telegramState?.message ?? appTokens.copy.emptyStates.noTelegramPacks}
          </Typography>
        </Box>
        {renderPackList(telegramPacks, appTokens.copy.emptyStates.noTelegramPacks)}
      </List>

      <Menu
        open={Boolean(contextMenu)}
        onClose={handleCloseMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
        slotProps={{
          paper: { sx: { minWidth: appTokens.sizes.contextMenuWide } },
        }}
      >
        {contextMenu && (
          <MenuItem
            disabled
            dense
            sx={{
              opacity: "1 !important",
              fontSize: appTokens.typography.fontSizes.caption,
              color: "text.secondary",
              fontWeight: appTokens.typography.fontWeights.medium,
            }}
          >
            {contextMenu.pack.name}
          </MenuItem>
        )}
        <Divider />
        <MenuItem onClick={handleRenameOpen} dense>
          <EditIcon sx={{ mr: 1.5, fontSize: appTokens.sizes.actionIcon }} />
          {appTokens.copy.actions.rename}
        </MenuItem>
        <MenuItem onClick={handleOpenOutputs} dense>
          <FolderOpenIcon sx={{ mr: 1.5, fontSize: appTokens.sizes.actionIcon }} />
          {appTokens.copy.actions.openOutputs}
        </MenuItem>
        <MenuItem onClick={handleExportOutputs} dense>
          <IosShareIcon sx={{ mr: 1.5, fontSize: appTokens.sizes.actionIcon }} />
          {appTokens.copy.actions.export}
        </MenuItem>
        <MenuItem onClick={handleDelete} dense sx={{ color: "error.light" }}>
          <DeleteIcon sx={{ mr: 1.5, fontSize: appTokens.sizes.actionIcon }} />
          {appTokens.copy.actions.delete}
        </MenuItem>
      </Menu>

      <RenameDialog
        open={createDialogOpen}
        title={appTokens.copy.dialogs.newPack}
        label={appTokens.copy.dialogs.packName}
        initialValue=""
        onConfirm={handleCreate}
        onClose={() => setCreateDialogOpen(false)}
      />

      {renamePack && (
        <RenameDialog
          open
          title={appTokens.copy.dialogs.renamePack}
          initialValue={renamePack.name}
          onConfirm={handleRenameConfirm}
          onClose={() => setRenamePack(null)}
        />
      )}

      <TelegramAuthDialog
        open={telegramDialogOpen}
        state={telegramState}
        onClose={() => setTelegramDialogOpen(false)}
        onSubmitTdlibParameters={onSubmitTelegramTdlibParameters}
        onSubmitPhoneNumber={onSubmitTelegramPhoneNumber}
        onSubmitCode={onSubmitTelegramCode}
        onSubmitPassword={onSubmitTelegramPassword}
      />
    </Box>
  );
}
