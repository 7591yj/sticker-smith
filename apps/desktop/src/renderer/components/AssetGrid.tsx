import { useState, useCallback } from "react";
import type { MouseEvent } from "react";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import InsertEmoticonIcon from "@mui/icons-material/InsertEmoticon";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
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
import {
  BrowserGalleryCard,
  BrowserListRow,
  type BrowserView,
  FilePreview,
  sortItemsWithPinnedFirst,
} from "./fileBrowser";

interface Props {
  assets: SourceAsset[];
  pack: StickerPack;
  view: BrowserView;
  refreshDetails: () => Promise<StickerPackDetails>;
}

export function AssetGrid({ assets, pack, view, refreshDetails }: Props) {
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
    asset: SourceAsset;
  } | null>(null);
  const [renameAsset, setRenameAsset] = useState<SourceAsset | null>(null);
  const [emojiAsset, setEmojiAsset] = useState<SourceAsset | null>(null);
  const sortedAssets = sortItemsWithPinnedFirst(assets, {
    getLabel: (asset) => asset.relativePath,
    isPinned: (asset) => pack.iconAssetId === asset.id,
  });
  const standaloneTelegramIconPath =
    pack.source === "telegram" &&
    pack.thumbnailPath &&
    !assets.some((asset) => asset.absolutePath === pack.thumbnailPath)
      ? pack.thumbnailPath
      : null;
  const standaloneTelegramIconRelativePath =
    standaloneTelegramIconPath?.split("/").pop() ?? "telegram-pack-icon";

  const handleContextMenu = useCallback(
    (e: MouseEvent, asset: SourceAsset) => {
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

  const handleEmojiOpen = useCallback(() => {
    if (!contextMenu) return;
    setEmojiAsset(contextMenu.asset);
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

  const handleEmojiConfirm = useCallback(
    async (value: string) => {
      if (!emojiAsset) {
        return;
      }

      const emojis = parseEmojiInput(value);
      if (emojis.length === 0) {
        return;
      }

      await window.stickerSmith.assets.setEmojis({
        packId: pack.id,
        assetId: emojiAsset.id,
        emojis,
      });
      setEmojiAsset(null);
      await refreshDetails();
    },
    [emojiAsset, pack.id, refreshDetails],
  );

  if (assets.length === 0 && !standaloneTelegramIconPath) {
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
      <Box sx={{ pb: 2.5 }}>
        {view === "list" ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75, px: 2.5 }}>
            {standaloneTelegramIconPath ? (
              <BrowserListRow
                key="telegram-pack-icon"
                title={standaloneTelegramIconRelativePath}
                filename={standaloneTelegramIconRelativePath}
                isPinned
                preview={
                  <FilePreview
                    absolutePath={standaloneTelegramIconPath}
                    relativePath={standaloneTelegramIconRelativePath}
                  />
                }
                metadata={
                  <Box sx={fileMetadataRowSx}>
                    <Chip label="icon" size="small" sx={fileMetaChipSx} />
                    <Chip label="ready" size="small" sx={fileMetaChipSx} />
                  </Box>
                }
              />
            ) : null}
            {sortedAssets.map((asset) => {
              const isIcon = pack.iconAssetId === asset.id;
              const filename =
                asset.relativePath.split("/").pop() ?? asset.relativePath;

              return (
                <BrowserListRow
                  key={asset.id}
                  title={asset.relativePath}
                  filename={filename}
                  isPinned={isIcon}
                  onContextMenu={(event) => handleContextMenu(event, asset)}
                  preview={
                    <FilePreview
                      absolutePath={asset.absolutePath}
                      relativePath={asset.relativePath}
                      kind={asset.kind}
                      placeholderLabel={`Telegram media ${formatDownloadSummary(asset)}`}
                    />
                  }
                  metadata={
                    <Box sx={fileMetadataRowSx}>
                      <Chip
                        label={asset.kind}
                        size="small"
                        sx={fileMetaChipSx}
                      />
                      <Chip
                        label={formatEmojiSummary(asset)}
                        size="small"
                        sx={emojiMetaChipSx(asset.emojiList.length === 0)}
                      />
                      {pack.source === "telegram" ? (
                        <Chip label={formatDownloadSummary(asset)} size="small" sx={fileMetaChipSx} />
                      ) : null}
                    </Box>
                  }
                />
              );
            })}
          </Box>
        ) : (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: `repeat(auto-fill, minmax(${appTokens.layout.fileGridMinWidth}px, 1fr))`,
              gap: 1.5,
              px: 2.5,
            }}
          >
            {standaloneTelegramIconPath ? (
              <BrowserGalleryCard
                key="telegram-pack-icon"
                title={standaloneTelegramIconRelativePath}
                filename={standaloneTelegramIconRelativePath}
                isPinned
                preview={
                  <FilePreview
                    absolutePath={standaloneTelegramIconPath}
                    relativePath={standaloneTelegramIconRelativePath}
                  />
                }
                metadata={
                  <Box sx={fileMetadataRowSx}>
                    <Chip label="icon" size="small" sx={fileMetaChipSx} />
                    <Chip label="ready" size="small" sx={fileMetaChipSx} />
                  </Box>
                }
              />
            ) : null}
            {sortedAssets.map((asset) => {
              const isIcon = pack.iconAssetId === asset.id;
              const filename =
                asset.relativePath.split("/").pop() ?? asset.relativePath;

              return (
                <BrowserGalleryCard
                  key={asset.id}
                  title={asset.relativePath}
                  filename={filename}
                  isPinned={isIcon}
                  onContextMenu={(event) => handleContextMenu(event, asset)}
                  preview={
                    <FilePreview
                      absolutePath={asset.absolutePath}
                      relativePath={asset.relativePath}
                      kind={asset.kind}
                      placeholderLabel={`Telegram media ${formatDownloadSummary(asset)}`}
                    />
                  }
                  metadata={
                    <Box sx={fileMetadataRowSx}>
                      <Chip
                        label={asset.kind}
                        size="small"
                        sx={fileMetaChipSx}
                      />
                      <Chip
                        label={formatEmojiSummary(asset)}
                        size="small"
                        sx={emojiMetaChipSx(asset.emojiList.length === 0)}
                      />
                      {pack.source === "telegram" ? (
                        <Chip label={formatDownloadSummary(asset)} size="small" sx={fileMetaChipSx} />
                      ) : null}
                    </Box>
                  }
                />
              );
            })}
          </Box>
        )}
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
        <MenuItem onClick={handleEmojiOpen} dense>
          <InsertEmoticonIcon
            sx={{ mr: 1.5, fontSize: appTokens.sizes.actionIcon }}
          />
          {appTokens.copy.actions.editEmojis}
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

      {emojiAsset && (
        <RenameDialog
          open
          title={appTokens.copy.dialogs.editEmojis}
          label={appTokens.copy.labels.emojiList}
          initialValue={emojiAsset.emojiList.join(" ")}
          onConfirm={handleEmojiConfirm}
          onClose={() => setEmojiAsset(null)}
        />
      )}
    </>
  );
}

function parseEmojiInput(value: string) {
  return Array.from(
    new Set(value.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean)),
  ).slice(0, 20);
}

function formatEmojiSummary(asset: SourceAsset) {
  return asset.emojiList.length > 0
    ? asset.emojiList.join(" ")
    : appTokens.copy.labels.stickersNeedEmoji;
}

function formatDownloadSummary(asset: SourceAsset) {
  if (asset.absolutePath) {
    return "ready";
  }

  switch (asset.downloadState) {
    case "queued":
      return "queued";
    case "downloading":
      return "downloading";
    case "failed":
      return "failed";
    default:
      return "missing";
  }
}

const fileMetadataRowSx = {
  display: "flex",
  alignItems: "center",
  gap: 0.75,
  flexWrap: "wrap",
} as const;

const fileMetaChipSx = {
  height: 18,
  fontSize: appTokens.typography.fontSizes.assetKind,
  textTransform: "uppercase",
  letterSpacing: appTokens.typography.letterSpacing.chip,
} as const;

const emojiMetaChipSx = (missingEmoji: boolean) =>
  ({
    height: 18,
    fontSize: appTokens.typography.fontSizes.assetKind,
    letterSpacing: appTokens.typography.letterSpacing.chip,
    color: missingEmoji ? "error.main" : "text.secondary",
    borderColor: missingEmoji ? "error.main" : "divider",
  }) as const;
