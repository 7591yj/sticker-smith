import type { DragEvent, MouseEvent, ReactNode } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import type { OutputArtifact, SourceAsset, StickerPack } from "@sticker-smith/shared";
import { appTokens } from "../../theme/appTokens";
import {
  browserMetaChipSx,
  browserMetadataRowSx,
} from "./browserStyles";
import {
  BrowserGalleryCard,
  BrowserListRow,
  type BrowserView,
  formatBytes,
} from "./fileBrowser";

export interface BrowserItemDescriptor {
  key: string;
  title: string;
  label: string;
  isPinned?: boolean;
  selected?: boolean;
  isDragOver?: boolean;
  draggable?: boolean;
  preview: ReactNode;
  metadata: ReactNode;
  onClick?: (event: MouseEvent<HTMLDivElement>) => void;
  onDoubleClick?: (event: MouseEvent<HTMLDivElement>) => void;
  onContextMenu?: (event: MouseEvent<HTMLDivElement>) => void;
  onDragStart?: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd?: (event: DragEvent<HTMLDivElement>) => void;
  onDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  onDrop?: (event: DragEvent<HTMLDivElement>) => void;
}

export function renderBrowserItem(
  view: BrowserView,
  item: BrowserItemDescriptor,
) {
  const Component = view === "list" ? BrowserListRow : BrowserGalleryCard;
  const { key, ...props } = item;

  return <Component {...props} key={key} />;
}

export function formatOrderLabel(order: number) {
  return String(order + 1).padStart(3, "0");
}

export function formatDownloadSummary(asset: SourceAsset) {
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

export function formatAssetLabel(asset: SourceAsset, isIcon: boolean) {
  return isIcon ? "Icon" : formatOrderLabel(asset.order);
}

export function buildAssetTitle(
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

export function buildStandaloneIconTitle(relativePath: string) {
  return ["Icon", `Stored: source/${relativePath}`].join("\n");
}

export function buildAssetMetadata(
  pack: StickerPack,
  asset: SourceAsset,
) {
  return (
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
  );
}

export function buildStandaloneIconMetadata() {
  return (
    <Box sx={browserMetadataRowSx}>
      <Chip label="icon" size="small" sx={browserMetaChipSx} />
      <Chip label="ready" size="small" sx={browserMetaChipSx} />
    </Box>
  );
}

export function formatEmojiSummary(asset: SourceAsset) {
  return asset.emojiList.length > 0
    ? asset.emojiList.join(" ")
    : appTokens.copy.labels.noEmoji;
}

export function formatOutputLabel(output: OutputArtifact) {
  return output.mode === "icon" ? "Icon" : formatOrderLabel(output.order);
}

export function buildOutputTitle(
  output: OutputArtifact,
  sourceAsset: SourceAsset | null,
) {
  return [
    formatOutputLabel(output),
    sourceAsset?.originalFileName ? `Original: ${sourceAsset.originalFileName}` : null,
    `Stored: webm/${output.relativePath}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildOutputMetadata(
  output: OutputArtifact,
  sourceAsset: SourceAsset | null,
) {
  const showEmojiMetadata =
    output.mode === "sticker" && sourceAsset !== null;

  return (
    <>
      <Chip label={output.mode} size="small" sx={browserMetaChipSx} />
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
        {formatBytes(output.sizeBytes)}
      </Typography>
    </>
  );
}

const emojiMetaChipSx = (missingEmoji: boolean) =>
  ({
    height: appTokens.sizes.chip.compactHeight,
    fontSize: appTokens.typography.fontSizes.assetKind,
    letterSpacing: appTokens.typography.letterSpacing.chip,
    color: missingEmoji ? "error.main" : "text.secondary",
    borderColor: missingEmoji ? "error.main" : "divider",
  }) as const;
