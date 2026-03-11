import { useState, useCallback } from "react";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import type {
  SourceAsset,
  StickerPack,
  StickerPackDetails,
} from "@sticker-smith/shared";
import { appTokens } from "../../theme/appTokens";
import { RenameDialog } from "./RenameDialog";
import { toFileUrl } from "../utils/fileUrl";

interface Props {
  assets: SourceAsset[];
  pack: StickerPack;
  refreshDetails: () => Promise<StickerPackDetails>;
}

const IMAGE_KINDS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "bmp",
  "tiff",
]);
const VIDEO_KINDS = new Set(["mp4"]);

export function AssetGrid({ assets, pack, refreshDetails }: Props) {
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
    asset: SourceAsset;
  } | null>(null);
  const [renameAsset, setRenameAsset] = useState<SourceAsset | null>(null);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, asset: SourceAsset) => {
      e.preventDefault();
      setContextMenu({ mouseX: e.clientX, mouseY: e.clientY, asset });
    },
    [],
  );

  const handleClose = useCallback(() => setContextMenu(null), []);

  const handleSetIcon = useCallback(async () => {
    if (!contextMenu) return;
    const isCurrentIcon = pack.iconAssetId === contextMenu.asset.id;
    await window.stickerSmith.packs.setIcon({
      packId: pack.id,
      assetId: isCurrentIcon ? null : contextMenu.asset.id,
    });
    handleClose();
    await refreshDetails();
  }, [contextMenu, pack.iconAssetId, pack.id, handleClose, refreshDetails]);

  const handleDelete = useCallback(async () => {
    if (!contextMenu) return;
    handleClose();
    await window.stickerSmith.assets.delete({
      packId: pack.id,
      assetId: contextMenu.asset.id,
    });
    await refreshDetails();
  }, [contextMenu, pack.id, handleClose, refreshDetails]);

  const handleRenameOpen = useCallback(() => {
    if (!contextMenu) return;
    setRenameAsset(contextMenu.asset);
    handleClose();
  }, [contextMenu, handleClose]);

  const handleRenameConfirm = useCallback(
    async (nextRelativePath: string) => {
      if (!renameAsset) return;
      await window.stickerSmith.assets.rename({
        packId: pack.id,
        assetId: renameAsset.id,
        nextRelativePath,
      });
      setRenameAsset(null);
      await refreshDetails();
    },
    [renameAsset, pack.id, refreshDetails],
  );

  if (assets.length === 0) {
    return (
      <Box sx={{ px: 3, py: 6, color: "text.secondary", textAlign: "center" }}>
        <Typography
          variant="body2"
          sx={{ fontSize: appTokens.typography.fontSizes.bodyDefault }}
        >
          {appTokens.copy.emptyStates.noAssets}
        </Typography>
      </Box>
    );
  }

  return (
    <>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: `repeat(auto-fill, minmax(${appTokens.layout.assetGridMinWidth}px, 1fr))`,
          gap: 1.5,
          p: 2.5,
        }}
      >
        {assets.map((asset) => {
          const isIcon = pack.iconAssetId === asset.id;
          const isImage = IMAGE_KINDS.has(asset.kind);
          const isVideo = VIDEO_KINDS.has(asset.kind);
          const filename =
            asset.relativePath.split("/").pop() ?? asset.relativePath;
          const fileUrl = toFileUrl(asset.absolutePath);

          return (
            <Box
              key={asset.id}
              onContextMenu={(e) => handleContextMenu(e, asset)}
              title={asset.relativePath}
              sx={{
                position: "relative",
                borderRadius: appTokens.radii.card / 8,
                overflow: "hidden",
                aspectRatio: appTokens.layout.squareAspectRatio,
                bgcolor: "action.hover",
                cursor: "default",
                border: "1px solid",
                borderColor: isIcon ? "primary.main" : "divider",
                transition: "border-color 0.15s",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                "&:hover": {
                  borderColor: isIcon ? "primary.light" : "action.selected",
                },
              }}
            >
              {isImage ? (
                <Box
                  component="img"
                  src={fileUrl}
                  alt={filename}
                  sx={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              ) : isVideo ? (
                <Box
                  component="video"
                  src={fileUrl}
                  muted
                  playsInline
                  preload="metadata"
                  sx={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              ) : (
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 0.5,
                  }}
                >
                  <InsertDriveFileIcon
                    sx={{
                      fontSize: appTokens.sizes.fileTypeIcon,
                      color: "text.disabled",
                    }}
                  />
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: appTokens.typography.fontWeights.bold,
                      textTransform: "uppercase",
                      fontSize: appTokens.typography.fontSizes.assetKind,
                      color: "text.secondary",
                    }}
                  >
                    {asset.kind}
                  </Typography>
                </Box>
              )}

              {isIcon && (
                <Box
                  sx={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    bgcolor: "primary.main",
                    borderRadius: appTokens.radii.round,
                    width: appTokens.sizes.badge,
                    height: appTokens.sizes.badge,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <StarIcon
                    sx={{
                      fontSize: appTokens.sizes.badgeIcon,
                      color: appTokens.colors.text.contrast,
                    }}
                  />
                </Box>
              )}

              <Box
                sx={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  bgcolor: appTokens.colors.overlay.mediaLabel,
                  px: 0.5,
                  py: 0.25,
                }}
              >
                <Typography
                  variant="caption"
                  noWrap
                  sx={{
                    fontSize: appTokens.typography.fontSizes.assetLabel,
                    color: appTokens.colors.text.inverseMuted,
                    display: "block",
                    textAlign: "center",
                  }}
                >
                  {filename}
                </Typography>
              </Box>
            </Box>
          );
        })}
      </Box>

      <Menu
        open={Boolean(contextMenu)}
        onClose={handleClose}
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
            {contextMenu.asset.relativePath.split("/").pop()}
          </MenuItem>
        )}
        <Divider />
        <MenuItem onClick={handleSetIcon} dense>
          {contextMenu && pack.iconAssetId === contextMenu.asset.id ? (
            <>
              <StarBorderIcon
                sx={{ mr: 1.5, fontSize: appTokens.sizes.actionIcon }}
              />
              {appTokens.copy.actions.removeIcon}
            </>
          ) : (
            <>
              <StarIcon sx={{ mr: 1.5, fontSize: appTokens.sizes.actionIcon }} />
              {appTokens.copy.actions.setAsIcon}
            </>
          )}
        </MenuItem>
        <MenuItem onClick={handleRenameOpen} dense>
          <EditIcon sx={{ mr: 1.5, fontSize: appTokens.sizes.actionIcon }} />
          {appTokens.copy.actions.rename}
        </MenuItem>
        <MenuItem onClick={handleDelete} dense sx={{ color: "error.light" }}>
          <DeleteIcon sx={{ mr: 1.5, fontSize: appTokens.sizes.actionIcon }} />
          {appTokens.copy.actions.delete}
        </MenuItem>
      </Menu>

      {renameAsset && (
        <RenameDialog
          open
          title={appTokens.copy.dialogs.renameAsset}
          initialValue={renameAsset.relativePath}
          onConfirm={handleRenameConfirm}
          onClose={() => setRenameAsset(null)}
        />
      )}
    </>
  );
}
