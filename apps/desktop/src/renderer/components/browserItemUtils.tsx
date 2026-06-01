import type { ReactNode } from "react";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { StickerItem } from "@sticker-smith/shared";
import { appTokens } from "../../theme/appTokens";
import {
  BrowserGalleryCard,
  BrowserListRow,
  type BrowserItemProps,
  type BrowserView,
} from "./fileBrowser";

export interface BrowserItemDescriptor extends BrowserItemProps {
  key: string;
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
  return `#${order + 1}`;
}

export function StickerStatusIcon({
  sticker,
  color,
  size = 14,
}: {
  sticker: StickerItem;
  color?: string;
  size?: number;
}) {
  const failed = sticker.downloadState === "failed";
  const attention =
    !failed && (!sticker.absolutePath || sticker.emojiList.length === 0);
  const iconColor =
    color ??
    (failed ? "error.main" : attention ? "warning.main" : "success.main");
  const sx = { fontSize: size, color: iconColor };
  if (failed) {
    return (
      <Tooltip title="Failed">
        <ErrorOutlineIcon sx={sx} />
      </Tooltip>
    );
  }
  if (attention) {
    return (
      <Tooltip title="Needs attention">
        <WarningAmberIcon sx={sx} />
      </Tooltip>
    );
  }
  return (
    <Tooltip title="Ready">
      <CheckCircleOutlineIcon sx={sx} />
    </Tooltip>
  );
}

export function formatStickerLabel(sticker: StickerItem) {
  return formatOrderLabel(sticker.order);
}

export function buildStickerTitle(sticker: StickerItem) {
  return [
    formatStickerLabel(sticker),
    sticker.originalFileName ? `Original: ${sticker.originalFileName}` : null,
    `Stored: webm/${sticker.relativePath}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildStickerOverlay(sticker: StickerItem) {
  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        bgcolor: "background.paper",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: "5px",
        px: 0.35,
        py: 0.2,
      }}
    >
      <Typography
        sx={{
          fontSize: appTokens.typography.fontSizes.assetLabel,
          fontFamily: appTokens.typography.monoFontFamily,
          letterSpacing: appTokens.typography.letterSpacing.chip,
          color: "text.secondary",
          lineHeight: 1,
        }}
      >
        {formatOrderLabel(sticker.order)}
      </Typography>
      <StickerStatusIcon sticker={sticker} size={11} />
    </Box>
  );
}

function formatEmojiSummary(sticker: StickerItem) {
  if (sticker.emojiList.length === 0) return appTokens.copy.labels.noEmoji;
  const head = sticker.emojiList.slice(0, 3).join(" ");
  const tail = sticker.emojiList.length - 3;
  return tail > 0 ? `${head} +${tail}` : head;
}

export function buildStickerMetadata(sticker: StickerItem) {
  return (
    <Chip
      label={formatEmojiSummary(sticker)}
      size="small"
      sx={emojiMetaChipSx(sticker.emojiList.length === 0)}
    />
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
