import { useState, useCallback } from "react";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import DriveFileMoveIcon from "@mui/icons-material/DriveFileMove";
import EditIcon from "@mui/icons-material/Edit";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import IosShareIcon from "@mui/icons-material/IosShare";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import LayersIcon from "@mui/icons-material/Layers";
import Box from "@mui/material/Box";
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
import type { StickerPack } from "@sticker-smith/shared";
import { appTokens } from "../../theme/appTokens";
import { RenameDialog } from "./RenameDialog";
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
  selectedPackId: string | null;
  onSelect: (id: string) => void;
  refreshPacks: () => Promise<StickerPack[]>;
  setSelectedPackId: (id: string | null) => void;
}

export function Sidebar({
  packs,
  selectedPackId,
  onSelect,
  refreshPacks,
  setSelectedPackId,
}: Props) {
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
    pack: StickerPack;
  } | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [renamePack, setRenamePack] = useState<StickerPack | null>(null);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, pack: StickerPack) => {
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
        {packs.length === 0 ? (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              px: 2,
              py: 3,
              textAlign: "center",
              fontSize: appTokens.typography.fontSizes.body,
            }}
          >
            {appTokens.copy.emptyStates.noPacks}
          </Typography>
        ) : (
          packs.map((pack) => (
            <ListItemButton
              key={pack.id}
              selected={pack.id === selectedPackId}
              onClick={() => onSelect(pack.id)}
              onContextMenu={(e) => handleContextMenu(e, pack)}
              dense
              sx={{ borderRadius: appTokens.radii.panel / 8 }}
            >
              <PackThumbnail
                name={pack.name}
                thumbnailPath={pack.thumbnailPath}
              />
              <ListItemText
                primary={pack.name}
                primaryTypographyProps={{
                  variant: "body2",
                  noWrap: true,
                  fontWeight: pack.id === selectedPackId ? 600 : 400,
                  fontSize: appTokens.typography.fontSizes.bodyDefault,
                }}
              />
            </ListItemButton>
          ))
        )}
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
          paper: { sx: { minWidth: appTokens.sizes.contextMenuNarrow } },
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
        <MenuItem onClick={handleOpenOutputs} dense>
          <FolderOpenIcon
            fontSize="small"
            sx={{ mr: 1.5, fontSize: appTokens.sizes.actionIcon }}
          />
          {appTokens.copy.actions.openOutputs}
        </MenuItem>
        <MenuItem onClick={handleExportOutputs} dense>
          <IosShareIcon
            fontSize="small"
            sx={{ mr: 1.5, fontSize: appTokens.sizes.actionIcon }}
          />
          {appTokens.copy.actions.export}
        </MenuItem>
        <MenuItem onClick={handleRenameOpen} dense>
          <EditIcon
            fontSize="small"
            sx={{ mr: 1.5, fontSize: appTokens.sizes.actionIcon }}
          />
          {appTokens.copy.actions.rename}
        </MenuItem>
        <MenuItem onClick={handleDelete} dense sx={{ color: "error.light" }}>
          <DeleteIcon
            fontSize="small"
            sx={{ mr: 1.5, fontSize: appTokens.sizes.actionIcon }}
          />
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
    </Box>
  );
}
