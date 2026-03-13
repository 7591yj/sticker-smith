import { useCallback, useEffect, useMemo, useState } from "react";
import type { MouseEvent } from "react";
import InsertEmoticonIcon from "@mui/icons-material/InsertEmoticon";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import type {
  OutputArtifact,
  SourceAsset,
  StickerPackDetails,
} from "@sticker-smith/shared";
import { appTokens } from "../../theme/appTokens";
import { EmojiPickerDialog } from "./EmojiPickerDialog";
import {
  BrowserGalleryCard,
  BrowserListRow,
  type BrowserView,
  FilePreview,
  formatBytes,
  sortItemsWithPinnedFirst,
} from "./fileBrowser";

interface Props {
  packId: string;
  outputs: OutputArtifact[];
  assets: SourceAsset[];
  view: BrowserView;
  refreshDetails: () => Promise<StickerPackDetails>;
}

export function OutputsList({
  packId,
  outputs,
  assets,
  view,
  refreshDetails,
}: Props) {
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
    assetIds: string[];
    primaryAssetId: string;
  } | null>(null);
  const [emojiEditAssetIds, setEmojiEditAssetIds] = useState<string[] | null>(null);

  const sortedOutputs = useMemo(
    () =>
      sortItemsWithPinnedFirst(outputs, {
        getLabel: (output) => output.relativePath,
        isPinned: (output) => output.mode === "icon",
      }),
    [outputs],
  );
  const assetById = useMemo(
    () => new Map(assets.map((asset) => [asset.id, asset])),
    [assets],
  );
  const selectableAssetIds = useMemo(
    () =>
      sortedOutputs
        .filter((output) => output.mode === "sticker" && assetById.has(output.sourceAssetId))
        .map((output) => output.sourceAssetId),
    [assetById, sortedOutputs],
  );
  const contextAssets = (contextMenu?.assetIds ?? [])
    .map((assetId) => assetById.get(assetId))
    .filter((asset): asset is SourceAsset => asset !== undefined);

  useEffect(() => {
    setSelectedAssetIds([]);
    setSelectionAnchorId(null);
    setContextMenu(null);
  }, [packId]);

  useEffect(() => {
    const selectableIds = new Set(selectableAssetIds);
    setSelectedAssetIds((current) =>
      current.filter((assetId) => selectableIds.has(assetId)),
    );
    setSelectionAnchorId((current) =>
      current && selectableIds.has(current) ? current : null,
    );
  }, [selectableAssetIds]);

  const selectOnly = useCallback((assetId: string) => {
    setSelectedAssetIds([assetId]);
    setSelectionAnchorId(assetId);
  }, []);

  const handleOutputClick = useCallback(
    (event: MouseEvent<HTMLDivElement>, output: OutputArtifact) => {
      if (output.mode !== "sticker" || !assetById.has(output.sourceAssetId)) {
        return;
      }

      const assetId = output.sourceAssetId;
      const modifierPressed = event.metaKey || event.ctrlKey;

      if (event.shiftKey && selectionAnchorId) {
        const anchorIndex = selectableAssetIds.indexOf(selectionAnchorId);
        const currentIndex = selectableAssetIds.indexOf(assetId);

        if (anchorIndex !== -1 && currentIndex !== -1) {
          const [start, end] =
            anchorIndex < currentIndex
              ? [anchorIndex, currentIndex]
              : [currentIndex, anchorIndex];
          setSelectedAssetIds(selectableAssetIds.slice(start, end + 1));
          return;
        }
      }

      if (modifierPressed) {
        setSelectedAssetIds((current) =>
          current.includes(assetId)
            ? current.filter((currentAssetId) => currentAssetId !== assetId)
            : [...current, assetId],
        );
        setSelectionAnchorId(assetId);
        return;
      }

      selectOnly(assetId);
    },
    [assetById, selectableAssetIds, selectOnly, selectionAnchorId],
  );

  const handleOutputDoubleClick = useCallback(
    (_event: MouseEvent<HTMLDivElement>, output: OutputArtifact) => {
      if (output.mode !== "sticker" || !assetById.has(output.sourceAssetId)) {
        return;
      }

      const assetId = output.sourceAssetId;
      selectOnly(assetId);
      setEmojiEditAssetIds([assetId]);
    },
    [assetById, selectOnly],
  );

  const handleContextMenu = useCallback(
    (event: MouseEvent, output: OutputArtifact) => {
      if (output.mode !== "sticker" || !assetById.has(output.sourceAssetId)) {
        return;
      }

      event.preventDefault();

      const assetId = output.sourceAssetId;
      const isSelected = selectedAssetIds.includes(assetId);
      const nextSelected = isSelected ? selectedAssetIds : [assetId];

      if (!isSelected) {
        selectOnly(assetId);
      }

      setContextMenu({
        mouseX: event.clientX,
        mouseY: event.clientY,
        assetIds: nextSelected,
        primaryAssetId: assetId,
      });
    },
    [assetById, selectOnly, selectedAssetIds],
  );

  const handleCloseContextMenu = useCallback(() => setContextMenu(null), []);

  const handleSelectAll = useCallback(() => {
    setSelectedAssetIds(selectableAssetIds);
    setSelectionAnchorId(selectableAssetIds[0] ?? null);
  }, [selectableAssetIds]);

  const handleClearSelection = useCallback(() => {
    setSelectedAssetIds([]);
    setSelectionAnchorId(null);
  }, []);

  const handleEmojiConfirm = useCallback(
    async (emojis: string[]) => {
      if (!emojiEditAssetIds || emojiEditAssetIds.length === 0) {
        return;
      }

      if (emojiEditAssetIds.length === 1) {
        await window.stickerSmith.assets.setEmojis({
          packId,
          assetId: emojiEditAssetIds[0]!,
          emojis,
        });
      } else {
        await window.stickerSmith.assets.setEmojisMany({
          packId,
          assetIds: emojiEditAssetIds,
          emojis,
        });
      }

      setEmojiEditAssetIds(null);
      setSelectedAssetIds(emojiEditAssetIds);
      setSelectionAnchorId(emojiEditAssetIds[0] ?? null);
      await refreshDetails();
    },
    [emojiEditAssetIds, packId, refreshDetails],
  );

  const openContextEmojiEditor = useCallback(() => {
    if (contextAssets.length === 0) {
      return;
    }

    setEmojiEditAssetIds(contextAssets.map((asset) => asset.id));
    handleCloseContextMenu();
  }, [contextAssets, handleCloseContextMenu]);

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
            ? `${selectedAssetIds.length} selected output${selectedAssetIds.length !== 1 ? "s" : ""}`
            : `${sortedOutputs.length} output${sortedOutputs.length !== 1 ? "s" : ""}`}
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
        {selectedAssetIds.length > 0 ? (
          <Button
            size="small"
            variant="outlined"
            onClick={() => setEmojiEditAssetIds(selectedAssetIds)}
            sx={{ textTransform: "none" }}
          >
            {appTokens.copy.actions.editEmojis}
          </Button>
        ) : null}
      </Box>

      <Box sx={{ pb: 2.5 }}>
        {view === "list" ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75, px: 2.5 }}>
            {sortedOutputs.map((out) => {
              const sourceAsset = assetById.get(out.sourceAssetId) ?? null;
              const selectable = out.mode === "sticker" && sourceAsset !== null;
              const showEmojiMetadata =
                out.mode === "sticker" && sourceAsset !== null;

              return (
                <BrowserListRow
                  key={out.relativePath}
                  title={out.relativePath}
                  filename={out.relativePath.split("/").pop() ?? out.relativePath}
                  isPinned={out.mode === "icon"}
                  selected={selectable && selectedAssetIds.includes(out.sourceAssetId)}
                  onClick={
                    selectable ? (event) => handleOutputClick(event, out) : undefined
                  }
                  onDoubleClick={
                    selectable
                      ? (event) => handleOutputDoubleClick(event, out)
                      : undefined
                  }
                  onContextMenu={
                    selectable ? (event) => handleContextMenu(event, out) : undefined
                  }
                  preview={
                    <FilePreview
                      absolutePath={out.absolutePath}
                      relativePath={out.relativePath}
                    />
                  }
                  metadata={
                    <>
                      <Chip
                        label={out.mode}
                        size="small"
                        sx={fileMetaChipSx}
                      />
                      {showEmojiMetadata ? (
                        <Chip
                          label={formatEmojiSummary(sourceAsset)}
                          size="small"
                          sx={emojiMetaChipSx(sourceAsset.emojiList.length === 0)}
                        />
                      ) : null}
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          fontSize: appTokens.typography.fontSizes.secondaryCaption,
                        }}
                      >
                        {formatBytes(out.sizeBytes)}
                      </Typography>
                    </>
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
            {sortedOutputs.map((out) => {
              const filename =
                out.relativePath.split("/").pop() ?? out.relativePath;
              const sourceAsset = assetById.get(out.sourceAssetId) ?? null;
              const selectable = out.mode === "sticker" && sourceAsset !== null;
              const showEmojiMetadata =
                out.mode === "sticker" && sourceAsset !== null;

              return (
                <BrowserGalleryCard
                  key={out.relativePath}
                  title={out.relativePath}
                  filename={filename}
                  isPinned={out.mode === "icon"}
                  selected={selectable && selectedAssetIds.includes(out.sourceAssetId)}
                  onClick={
                    selectable ? (event) => handleOutputClick(event, out) : undefined
                  }
                  onDoubleClick={
                    selectable
                      ? (event) => handleOutputDoubleClick(event, out)
                      : undefined
                  }
                  onContextMenu={
                    selectable ? (event) => handleContextMenu(event, out) : undefined
                  }
                  preview={
                    <FilePreview
                      absolutePath={out.absolutePath}
                      relativePath={out.relativePath}
                    />
                  }
                  metadata={
                    <>
                      <Chip label={out.mode} size="small" sx={fileMetaChipSx} />
                      {showEmojiMetadata ? (
                        <Chip
                          label={formatEmojiSummary(sourceAsset)}
                          size="small"
                          sx={emojiMetaChipSx(sourceAsset.emojiList.length === 0)}
                        />
                      ) : null}
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          fontSize: appTokens.typography.fontSizes.secondaryCaption,
                        }}
                      >
                        {formatBytes(out.sizeBytes)}
                      </Typography>
                    </>
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
              : `${contextAssets.length} selected output${contextAssets.length !== 1 ? "s" : ""}`}
          </MenuItem>
        ) : null}
        <Divider />
        <MenuItem onClick={openContextEmojiEditor} dense>
          <InsertEmoticonIcon
            sx={{ mr: 1.5, fontSize: appTokens.sizes.actionIcon }}
          />
          {appTokens.copy.actions.editEmojis}
        </MenuItem>
      </Menu>

      {emojiEditAssetIds ? (
        <EmojiPickerDialog
          open
          title={
            emojiEditAssetIds.length === 1
              ? appTokens.copy.dialogs.editEmojis
              : appTokens.copy.dialogs.editSelectedEmojis
          }
          initialEmojis={initialEmojiSelection(emojiEditAssetIds, assetById)}
          onConfirm={handleEmojiConfirm}
          onClose={() => setEmojiEditAssetIds(null)}
        />
      ) : null}
    </>
  );
}

function initialEmojiSelection(
  assetIds: string[],
  assetById: ReadonlyMap<string, SourceAsset>,
) {
  const currentAssets = assetIds
    .map((assetId) => assetById.get(assetId))
    .filter((asset): asset is SourceAsset => asset !== undefined);

  if (currentAssets.length === 0) {
    return [];
  }

  const [firstAsset, ...rest] = currentAssets;
  const firstValue = firstAsset.emojiList.join(" ");
  return rest.every((asset) => asset.emojiList.join(" ") === firstValue)
    ? [...firstAsset.emojiList]
    : [];
}

function formatEmojiSummary(asset: SourceAsset) {
  return asset.emojiList.length > 0
    ? asset.emojiList.join(" ")
    : appTokens.copy.labels.noEmoji;
}

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
