import type { MouseEvent } from "react";
import AddReactionOutlinedIcon from "@mui/icons-material/AddReactionOutlined";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { StickerItem } from "@sticker-smith/shared";
import { appTokens } from "../../theme/appTokens";
import { stickerStatusMeta } from "./stickerList/stickerStatusMeta";
import { getStickerStatus } from "./stickerList/stickerUtils";

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
  const status = getStickerStatus(sticker);
  const { Icon, label, color: statusColor } = stickerStatusMeta[status];
  const iconColor = color ?? statusColor;

  return (
    <Tooltip title={label}>
      <Icon sx={{ fontSize: size, color: iconColor }} />
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

export function buildStickerMetadata(
  sticker: StickerItem,
  onEditEmojis?: (event: MouseEvent<HTMLDivElement>) => void,
) {
  return (
    <Chip
      icon={<AddReactionOutlinedIcon />}
      label={formatEmojiSummary(sticker)}
      size="small"
      title={appTokens.copy.labels.editEmojisHint}
      clickable={Boolean(onEditEmojis)}
      onClick={onEditEmojis}
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
    "& .MuiChip-icon": {
      ml: 0.55,
      mr: -0.2,
      fontSize: 12,
    },
  }) as const;
