import { useCallback, useEffect, useMemo, useState } from "react";
import type { DragEvent, MouseEvent } from "react";
import DeleteIcon from "@mui/icons-material/Delete";
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
import {
  browserCountLabelSx,
  browserGridContainerSx,
  browserListContainerSx,
  browserMenuIconSx,
  browserMenuPaperSx,
  browserMenuTitleSx,
  browserMetaChipSx,
  browserMetadataRowSx,
  browserToolbarSx,
  formatCountLabel,
} from "./browserStyles";
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
  const [draggedAssetId, setDraggedAssetId] = useState<string | null>(null);
  const [dragOverAssetId, setDragOverAssetId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
    assetIds: string[];
    primaryAssetId: string;
  } | null>(null);
  const sortedAssets = useMemo(
    () =>
      sortItemsWithPinnedFirst(assets, {
        getOrder: (asset) => asset.order,
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
    setDraggedAssetId(null);
    setDragOverAssetId(null);
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

  const handleSelectAll = useCallback(() => {
    setSelectedAssetIds(selectableAssetIds);
    setSelectionAnchorId(selectableAssetIds[0] ?? null);
  }, [selectableAssetIds]);

  const handleClearSelection = useCallback(() => {
    setSelectedAssetIds([]);
    setSelectionAnchorId(null);
  }, []);

  const submitReorder = useCallback(
    async (beforeAssetId: string | null) => {
      if (!draggedAssetId) {
        return;
      }

      const draggedAsset = assetById.get(draggedAssetId);
      if (!draggedAsset || pack.iconAssetId === draggedAssetId) {
        return;
      }

      if (beforeAssetId === draggedAssetId) {
        return;
      }

      await window.stickerSmith.assets.reorder({
        packId: pack.id,
        assetId: draggedAssetId,
        beforeAssetId,
      });
      setDragOverAssetId(null);
      await refreshDetails();
    },
    [assetById, draggedAssetId, pack.iconAssetId, pack.id, refreshDetails],
  );

  const handleDragStart = useCallback(
    (event: DragEvent<HTMLDivElement>, asset: SourceAsset) => {
      if (asset.id === pack.iconAssetId) {
        return;
      }

      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", asset.id);
      setDraggedAssetId(asset.id);
    },
    [pack.iconAssetId],
  );

  const handleDragEnd = useCallback(() => {
    setDraggedAssetId(null);
    setDragOverAssetId(null);
  }, []);

  const handleDragOverAsset = useCallback(
    (event: DragEvent<HTMLDivElement>, asset: SourceAsset) => {
      if (!draggedAssetId || asset.id === pack.iconAssetId || asset.id === draggedAssetId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      setDragOverAssetId(asset.id);
    },
    [draggedAssetId, pack.iconAssetId],
  );

  const handleDropBeforeAsset = useCallback(
    async (event: DragEvent<HTMLDivElement>, asset: SourceAsset) => {
      if (!draggedAssetId || asset.id === pack.iconAssetId || asset.id === draggedAssetId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      await submitReorder(asset.id);
      setDraggedAssetId(null);
    },
    [draggedAssetId, pack.iconAssetId, submitReorder],
  );

  const handleDragOverEnd = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!draggedAssetId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      setDragOverAssetId("__end__");
    },
    [draggedAssetId],
  );

  const handleDropToEnd = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      if (!draggedAssetId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      await submitReorder(null);
      setDraggedAssetId(null);
    },
    [draggedAssetId, submitReorder],
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
      <Box
        sx={browserToolbarSx}
      >
        <Typography
          variant="caption"
          color="text.secondary"
          sx={browserCountLabelSx}
        >
          {selectedAssetIds.length > 0
            ? `${formatCountLabel(selectedAssetIds.length, "selected asset")}`
            : formatCountLabel(sortedAssets.length, "asset")}
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
        ) : null}
      </Box>

      <Box sx={{ pb: 2.5 }}>
        {view === "list" ? (
          <Box
            sx={browserListContainerSx}
            onDragOver={handleDragOverEnd}
            onDrop={handleDropToEnd}
          >
            {standaloneTelegramIconPath ? (
              <BrowserListRow
                key="telegram-pack-icon"
                title={buildStandaloneIconTitle(standaloneTelegramIconRelativePath)}
                label="Icon"
                isPinned
                preview={
                  <FilePreview
                    absolutePath={standaloneTelegramIconPath}
                    relativePath={standaloneTelegramIconRelativePath}
                  />
                }
                metadata={
                  <Box sx={browserMetadataRowSx}>
                    <Chip label="icon" size="small" sx={browserMetaChipSx} />
                    <Chip label="ready" size="small" sx={browserMetaChipSx} />
                  </Box>
                }
              />
            ) : null}
            {sortedAssets.map((asset) => {
              const isIcon = pack.iconAssetId === asset.id;
              const label = formatAssetLabel(asset, isIcon);

              return (
                <BrowserListRow
                  key={asset.id}
                  title={buildAssetTitle(asset, label, isIcon)}
                  label={label}
                  isPinned={isIcon}
                  isDragOver={dragOverAssetId === asset.id}
                  draggable={!isIcon}
                  selected={selectedAssetIds.includes(asset.id)}
                  onClick={(event) => handleAssetClick(event, asset)}
                  onContextMenu={(event) => handleContextMenu(event, asset)}
                  onDragStart={(event) => handleDragStart(event, asset)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(event) => handleDragOverAsset(event, asset)}
                  onDrop={(event) => void handleDropBeforeAsset(event, asset)}
                  preview={
                    <FilePreview
                      absolutePath={asset.absolutePath}
                      relativePath={asset.relativePath}
                      kind={asset.kind}
                      placeholderLabel={`Telegram media ${formatDownloadSummary(asset)}`}
                    />
                  }
                  metadata={
                    <Box sx={browserMetadataRowSx}>
                      <Chip label={asset.kind} size="small" sx={browserMetaChipSx} />
                      {pack.source === "telegram" ? (
                        <Chip
                          label={formatDownloadSummary(asset)}
                          size="small"
                          sx={browserMetaChipSx}
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
            sx={browserGridContainerSx}
            onDragOver={handleDragOverEnd}
            onDrop={handleDropToEnd}
          >
            {standaloneTelegramIconPath ? (
              <BrowserGalleryCard
                key="telegram-pack-icon"
                title={buildStandaloneIconTitle(standaloneTelegramIconRelativePath)}
                label="Icon"
                isPinned
                preview={
                  <FilePreview
                    absolutePath={standaloneTelegramIconPath}
                    relativePath={standaloneTelegramIconRelativePath}
                  />
                }
                metadata={
                  <Box sx={browserMetadataRowSx}>
                    <Chip label="icon" size="small" sx={browserMetaChipSx} />
                    <Chip label="ready" size="small" sx={browserMetaChipSx} />
                  </Box>
                }
              />
            ) : null}
            {sortedAssets.map((asset) => {
              const isIcon = pack.iconAssetId === asset.id;
              const label = formatAssetLabel(asset, isIcon);

              return (
                <BrowserGalleryCard
                  key={asset.id}
                  title={buildAssetTitle(asset, label, isIcon)}
                  label={label}
                  isPinned={isIcon}
                  isDragOver={dragOverAssetId === asset.id}
                  draggable={!isIcon}
                  selected={selectedAssetIds.includes(asset.id)}
                  onClick={(event) => handleAssetClick(event, asset)}
                  onContextMenu={(event) => handleContextMenu(event, asset)}
                  onDragStart={(event) => handleDragStart(event, asset)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(event) => handleDragOverAsset(event, asset)}
                  onDrop={(event) => void handleDropBeforeAsset(event, asset)}
                  preview={
                    <FilePreview
                      absolutePath={asset.absolutePath}
                      relativePath={asset.relativePath}
                      kind={asset.kind}
                      placeholderLabel={`Telegram media ${formatDownloadSummary(asset)}`}
                    />
                  }
                  metadata={
                    <Box sx={browserMetadataRowSx}>
                      <Chip label={asset.kind} size="small" sx={browserMetaChipSx} />
                      {pack.source === "telegram" ? (
                        <Chip
                          label={formatDownloadSummary(asset)}
                          size="small"
                          sx={browserMetaChipSx}
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
          paper: { sx: browserMenuPaperSx },
        }}
      >
        {contextAssets.length > 0 ? (
          <MenuItem
            disabled
            dense
            sx={browserMenuTitleSx}
          >
            {contextAssets.length === 1
              ? formatAssetLabel(
                  contextAssets[0]!,
                  pack.iconAssetId === contextAssets[0]!.id,
                )
              : formatCountLabel(contextAssets.length, "selected asset")}
          </MenuItem>
        ) : null}
        <Divider />
        {contextAssets.length === 1 ? (
          <MenuItem onClick={handleSetIcon} dense>
            {contextPrimaryAsset && pack.iconAssetId === contextPrimaryAsset.id ? (
              <>
                <StarBorderIcon sx={browserMenuIconSx} />
                {appTokens.copy.actions.removeIcon}
              </>
            ) : (
              <>
                <StarIcon sx={browserMenuIconSx} />
                {appTokens.copy.actions.setAsIcon}
              </>
            )}
          </MenuItem>
        ) : null}
        <MenuItem onClick={() => void handleDelete()} dense sx={{ color: "error.light" }}>
          <DeleteIcon sx={browserMenuIconSx} />
          {appTokens.copy.actions.delete}
        </MenuItem>
      </Menu>
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

function formatAssetLabel(asset: SourceAsset, isIcon: boolean) {
  return isIcon ? "Icon" : formatOrderLabel(asset.order);
}

function formatOrderLabel(order: number) {
  return String(order + 1).padStart(3, "0");
}

function buildAssetTitle(
  asset: SourceAsset,
  label: string,
  isIcon: boolean,
) {
  return [
    label,
    asset.originalFileName ? `Original: ${asset.originalFileName}` : null,
    `Stored: source/${asset.relativePath}`,
    isIcon ? "Role: icon" : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildStandaloneIconTitle(relativePath: string) {
  return ["Icon", `Stored: source/${relativePath}`].join("\n");
}
