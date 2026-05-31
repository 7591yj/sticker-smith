import type { ReactNode } from "react";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import type { StickerItem } from "@sticker-smith/shared";
import { appTokens } from "../../theme/appTokens";
import { browserMetaChipSx } from "./browserStyles";
import {
  BrowserGalleryCard,
  BrowserListRow,
  type BrowserItemProps,
  type BrowserView,
  formatBytes,
} from "./fileBrowser";

export interface BrowserItemDescriptor extends BrowserItemProps {
  key: string;
}

export function renderBrowserItem(view: BrowserView, item: BrowserItemDescriptor) {
  const Component = view === "list" ? BrowserListRow : BrowserGalleryCard;
  const { key, ...props } = item;
  return <Component {...props} key={key} />;
}

export function formatOrderLabel(order: number) {
  return String(order + 1).padStart(3, "0");
}

function formatDownloadSummary(sticker: StickerItem) {
  if (sticker.absolutePath) return "ready";
  switch (sticker.downloadState) {
    case "queued": return "queued";
    case "downloading": return "downloading";
    case "failed": return "failed";
    default: return "missing";
  }
}

export function formatStickerLabel(sticker: StickerItem) {
  return formatOrderLabel(sticker.order);
}

export function buildStickerTitle(sticker: StickerItem) {
  return [
    formatStickerLabel(sticker),
    sticker.originalFileName ? `Original: ${sticker.originalFileName}` : null,
    `Stored: webm/${sticker.relativePath}`,
  ].filter(Boolean).join("\n");
}

function formatEmojiSummary(sticker: StickerItem) {
  return sticker.emojiList.length > 0 ? sticker.emojiList.join(" ") : appTokens.copy.labels.noEmoji;
}

export function buildStickerMetadata(sticker: StickerItem) {
  return <>
    <Chip label="sticker" size="small" sx={browserMetaChipSx} />
    {sticker.telegram ? <Chip label={formatDownloadSummary(sticker)} size="small" sx={browserMetaChipSx} /> : null}
    <Chip label={formatEmojiSummary(sticker)} size="small" sx={emojiMetaChipSx(sticker.emojiList.length === 0)} />
    <Typography variant="caption" color="text.secondary" sx={{ fontSize: appTokens.typography.fontSizes.secondaryCaption }}>
      {formatBytes(sticker.sizeBytes)}
    </Typography>
  </>;
}

const emojiMetaChipSx = (missingEmoji: boolean) => ({
  height: appTokens.sizes.chip.compactHeight,
  fontSize: appTokens.typography.fontSizes.assetKind,
  letterSpacing: appTokens.typography.letterSpacing.chip,
  color: missingEmoji ? "error.main" : "text.secondary",
  borderColor: missingEmoji ? "error.main" : "divider",
}) as const;
