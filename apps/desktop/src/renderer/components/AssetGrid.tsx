import { useCallback, useEffect, useMemo, useState } from "react";
import type { MouseEvent } from "react";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
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
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
    assetIds: string[];
    primaryAssetId: string;
  } | null>(null);
  const [renameAsset, setRenameAsset] = useState<SourceAsset | null>(null);
  const [batchRenameAssetIds, setBatchRenameAssetIds] = useState<string[] | null>(
    null,
  );
  const sortedAssets = useMemo(
    () =>
      sortItemsWithPinnedFirst(assets, {
        getLabel: (asset) => asset.relativePath,
        isPinned: (asset) => pack.iconAssetId === asset.id,
      }),
    [assets, pack.iconAssetId],
  );
  const assetById = useMemo(
    () => new Map(sortedAssets.map((asset) => [asset.id, asset])),
    [sortedAssets],
  );
  const standaloneTelegramIconPath =
    pack.source === "telegram" &&
    pack.thumbnailPath &&
    !assets.some((asset) => asset.absolutePath === pack.thumbnailPath)
      ? pack.thumbnailPath
      : null;
  const standaloneTelegramIconRelativePath =
    standaloneTelegramIconPath?.split("/").pop() ?? "telegram-pack-icon";
  const selectableAssetIds = useMemo(
    () =>
      sortedAssets
        .filter((asset) => asset.id !== pack.iconAssetId)
        .map((asset) => asset.id),
    [pack.iconAssetId, sortedAssets],
  );
  const selectedContainsIcon =
    pack.iconAssetId !== null && selectedAssetIds.includes(pack.iconAssetId);
  const batchActionAssetIds = selectedContainsIcon
    ? []
    : sortedAssets
        .filter((asset) => selectedAssetIds.includes(asset.id))
        .map((asset) => asset.id);
  const hasBatchActions = batchActionAssetIds.length > 0;
  const contextAssets = (contextMenu?.assetIds ?? [])
    .map((assetId) => assetById.get(assetId))
    .filter((asset): asset is SourceAsset => asset !== undefined);
  const contextPrimaryAsset =
    contextMenu?.primaryAssetId !== undefined
      ? assetById.get(contextMenu.primaryAssetId) ?? null
      : null;

  useEffect(() => {
    setSelectedAssetIds([]);
    setSelectionAnchorId(null);
    setContextMenu(null);
  }, [pack.id]);

  useEffect(() => {
    setSelectedAssetIds((current) =>
      current.filter((assetId) => assetById.has(assetId)),
    );
    setSelectionAnchorId((current) =>
      current && assetById.has(current) ? current : null,
    );
  }, [assetById]);

  const selectOnly = useCallback((assetId: string) => {
    setSelectedAssetIds([assetId]);
    setSelectionAnchorId(assetId);
  }, []);

  const handleAssetClick = useCallback(
    (event: MouseEvent<HTMLDivElement>, asset: SourceAsset) => {
      const isIcon = pack.iconAssetId === asset.id;
      const modifierPressed = event.metaKey || event.ctrlKey;

      if (
        event.shiftKey &&
        !isIcon &&
        selectionAnchorId &&
        selectionAnchorId !== pack.iconAssetId
      ) {
        const anchorIndex = selectableAssetIds.indexOf(selectionAnchorId);
        const currentIndex = selectableAssetIds.indexOf(asset.id);

        if (anchorIndex !== -1 && currentIndex !== -1) {
          const [start, end] =
            anchorIndex < currentIndex
              ? [anchorIndex, currentIndex]
              : [currentIndex, anchorIndex];
          setSelectedAssetIds(selectableAssetIds.slice(start, end + 1));
          return;
        }
      }

      if (modifierPressed && !isIcon) {
        setSelectedAssetIds((current) => {
          const next = current.filter((assetId) => assetId !== pack.iconAssetId);
          return next.includes(asset.id)
            ? next.filter((assetId) => assetId !== asset.id)
            : [...next, asset.id];
        });
        setSelectionAnchorId(asset.id);
        return;
      }

      selectOnly(asset.id);
    },
    [pack.iconAssetId, selectableAssetIds, selectOnly, selectionAnchorId],
  );

  const handleContextMenu = useCallback(
    (event: MouseEvent, asset: SourceAsset) => {
      event.preventDefault();

      const isSelected = selectedAssetIds.includes(asset.id);
      const nextSelected = isSelected ? selectedAssetIds : [asset.id];

      if (!isSelected) {
        selectOnly(asset.id);
      }

      setContextMenu({
        mouseX: event.clientX,
        mouseY: event.clientY,
        assetIds: nextSelected,
        primaryAssetId: asset.id,
      });
    },
    [selectOnly, selectedAssetIds],
  );

  const handleCloseContextMenu = useCallback(() => setContextMenu(null), []);

  const handleSetIcon = useCallback(async () => {
    if (!contextPrimaryAsset) return;
    const isCurrentIcon = pack.iconAssetId === contextPrimaryAsset.id;
    await window.stickerSmith.packs.setIcon({
      packId: pack.id,
      assetId: isCurrentIcon ? null : contextPrimaryAsset.id,
    });
    handleCloseContextMenu();
    selectOnly(contextPrimaryAsset.id);
    await refreshDetails();
  }, [
    contextPrimaryAsset,
    pack.iconAssetId,
    pack.id,
    handleCloseContextMenu,
    refreshDetails,
    selectOnly,
  ]);

  const handleDelete = useCallback(async () => {
    if (contextAssets.length === 0) {
      return;
    }

    if (contextAssets.length === 1) {
      await window.stickerSmith.assets.delete({
        packId: pack.id,
        assetId: contextAssets[0]!.id,
      });
    } else {
      await window.stickerSmith.assets.deleteMany({
        packId: pack.id,
        assetIds: contextAssets.map((asset) => asset.id),
      });
    }

    handleCloseContextMenu();
    setSelectedAssetIds([]);
    setSelectionAnchorId(null);
    await refreshDetails();
  }, [contextAssets, handleCloseContextMenu, pack.id, refreshDetails]);

  const handleRenameConfirm = useCallback(
    async (nextRelativePath: string) => {
      if (!renameAsset) return;

      await window.stickerSmith.assets.rename({
        packId: pack.id,
        assetId: renameAsset.id,
        nextRelativePath,
      });
      setRenameAsset(null);
      selectOnly(renameAsset.id);
      await refreshDetails();
    },
    [pack.id, refreshDetails, renameAsset, selectOnly],
  );

  const handleBatchRenameConfirm = useCallback(
    async (baseName: string) => {
      if (!batchRenameAssetIds || batchRenameAssetIds.length === 0) {
        return;
      }

      await window.stickerSmith.assets.renameMany({
        packId: pack.id,
        assetIds: batchRenameAssetIds,
        baseName,
      });
      setBatchRenameAssetIds(null);
      setSelectedAssetIds(batchRenameAssetIds);
      setSelectionAnchorId(batchRenameAssetIds[0] ?? null);
      await refreshDetails();
    },
    [batchRenameAssetIds, pack.id, refreshDetails],
  );

  const handleSelectAll = useCallback(() => {
    setSelectedAssetIds(selectableAssetIds);
    setSelectionAnchorId(selectableAssetIds[0] ?? null);
  }, [selectableAssetIds]);

  const handleClearSelection = useCallback(() => {
    setSelectedAssetIds([]);
    setSelectionAnchorId(null);
  }, []);

  const openSingleRename = useCallback(() => {
    if (!contextPrimaryAsset) return;
    setRenameAsset(contextPrimaryAsset);
    handleCloseContextMenu();
  }, [contextPrimaryAsset, handleCloseContextMenu]);

  const openBatchRenameDialog = useCallback(() => {
    if (!hasBatchActions) return;
    setBatchRenameAssetIds(batchActionAssetIds);
    handleCloseContextMenu();
  }, [batchActionAssetIds, handleCloseContextMenu, hasBatchActions]);

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
      <Box
        sx={{
          px: 2.5,
          pt: 1.25,
          pb: 1,
          display: "flex",
          alignItems: "center",
          gap: 1,
          flexWrap: "wrap",
        }}
      >
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontSize: appTokens.typography.fontSizes.caption }}
        >
          {selectedAssetIds.length > 0
            ? `${selectedAssetIds.length} selected asset${selectedAssetIds.length !== 1 ? "s" : ""}`
            : `${sortedAssets.length} asset${sortedAssets.length !== 1 ? "s" : ""}`}
        </Typography>
        <Button
          size="small"
          variant="outlined"
          onClick={handleSelectAll}
          disabled={selectableAssetIds.length === 0}
          sx={{ textTransform: "none" }}
        >
          {appTokens.copy.actions.selectAll}
        </Button>
        <Button
          size="small"
          variant="outlined"
          onClick={handleClearSelection}
          disabled={selectedAssetIds.length === 0}
          sx={{ textTransform: "none" }}
        >
          {appTokens.copy.actions.clearSelection}
        </Button>
        {hasBatchActions ? (
          <>
            <Button
              size="small"
              variant="outlined"
              onClick={openBatchRenameDialog}
              sx={{ textTransform: "none" }}
            >
              {appTokens.copy.actions.batchRename}
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="error"
              onClick={async () => {
                await window.stickerSmith.assets.deleteMany({
                  packId: pack.id,
                  assetIds: batchActionAssetIds,
                });
                handleClearSelection();
                await refreshDetails();
              }}
              sx={{ textTransform: "none" }}
            >
              {appTokens.copy.actions.delete}
            </Button>
          </>
        ) : null}
      </Box>

      <Box sx={{ pb: 2.5 }}>
        {view === "list" ? (
          <Box
            sx={{ display: "flex", flexDirection: "column", gap: 0.75, px: 2.5 }}
          >
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
                  selected={selectedAssetIds.includes(asset.id)}
                  onClick={(event) => handleAssetClick(event, asset)}
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
                      <Chip label={asset.kind} size="small" sx={fileMetaChipSx} />
                      {pack.source === "telegram" ? (
                        <Chip
                          label={formatDownloadSummary(asset)}
                          size="small"
                          sx={fileMetaChipSx}
                        />
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
                  selected={selectedAssetIds.includes(asset.id)}
                  onClick={(event) => handleAssetClick(event, asset)}
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
                      <Chip label={asset.kind} size="small" sx={fileMetaChipSx} />
                      {pack.source === "telegram" ? (
                        <Chip
                          label={formatDownloadSummary(asset)}
                          size="small"
                          sx={fileMetaChipSx}
                        />
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
        onClose={handleCloseContextMenu}
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
        {contextAssets.length > 0 ? (
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
            {contextAssets.length === 1
              ? contextAssets[0]!.relativePath.split("/").pop()
              : `${contextAssets.length} selected asset${contextAssets.length !== 1 ? "s" : ""}`}
          </MenuItem>
        ) : null}
        <Divider />
        {contextAssets.length === 1 ? (
          <MenuItem onClick={handleSetIcon} dense>
            {contextPrimaryAsset && pack.iconAssetId === contextPrimaryAsset.id ? (
              <>
                <StarBorderIcon
                  sx={{ mr: 1.5, fontSize: appTokens.sizes.actionIcon }}
                />
                {appTokens.copy.actions.removeIcon}
              </>
            ) : (
              <>
                <StarIcon
                  sx={{ mr: 1.5, fontSize: appTokens.sizes.actionIcon }}
                />
                {appTokens.copy.actions.setAsIcon}
              </>
            )}
          </MenuItem>
        ) : null}
        <MenuItem
          onClick={
            contextAssets.length === 1
              ? openSingleRename
              : openBatchRenameDialog
          }
          dense
        >
          <EditIcon sx={{ mr: 1.5, fontSize: appTokens.sizes.actionIcon }} />
          {contextAssets.length === 1
            ? appTokens.copy.actions.rename
            : appTokens.copy.actions.batchRename}
        </MenuItem>
        <MenuItem onClick={() => void handleDelete()} dense sx={{ color: "error.light" }}>
          <DeleteIcon sx={{ mr: 1.5, fontSize: appTokens.sizes.actionIcon }} />
          {appTokens.copy.actions.delete}
        </MenuItem>
      </Menu>

      {renameAsset ? (
        <RenameDialog
          open
          title={appTokens.copy.dialogs.renameAsset}
          initialValue={renameAsset.relativePath}
          onConfirm={handleRenameConfirm}
          onClose={() => setRenameAsset(null)}
        />
      ) : null}

      {batchRenameAssetIds ? (
        <RenameDialog
          open
          title={appTokens.copy.dialogs.batchRenameAssets}
          label={appTokens.copy.labels.baseName}
          initialValue="sticker"
          onConfirm={handleBatchRenameConfirm}
          onClose={() => setBatchRenameAssetIds(null)}
        />
      ) : null}
    </>
  );
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
