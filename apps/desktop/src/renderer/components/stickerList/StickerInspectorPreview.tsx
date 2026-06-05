import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import type { StickerItem } from "@sticker-smith/shared";
import { appTokens } from "../../../theme/appTokens";
import { FilePreview } from "../fileBrowser";
import { stickerStatusMeta } from "./stickerStatusMeta";
import { getStickerStatus, summarizeStickerStatuses } from "./stickerUtils";

export function SingleStickerPreview({
  sticker,
}: {
  sticker: StickerItem;
}) {
  return (
    <>
      <FilePreview
        absolutePath={sticker.absolutePath}
        relativePath={sticker.relativePath}
      />
      <Box
        sx={{
          position: "absolute",
          top: 8,
          left: 8,
          right: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 1,
          pointerEvents: "none",
        }}
      >
        <StatusChip sticker={sticker} />
      </Box>
    </>
  );
}

export function MultiStickerPreview({
  stickers,
  title,
}: {
  stickers: StickerItem[];
  title: string;
}) {
  const previewStickers = stickers.slice(0, 4);
  const overflowCount = Math.max(0, stickers.length - previewStickers.length);
  const statusSummary = summarizeStickerStatuses(stickers);

  return (
    <>
      <Box
        sx={{
          width: "100%",
          height: "100%",
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gridTemplateRows: "repeat(2, minmax(0, 1fr))",
          gap: 0.5,
          p: 0.5,
          bgcolor: "background.default",
        }}
      >
        {previewStickers.map((sticker) => (
          <Box
            key={sticker.id}
            sx={{
              position: "relative",
              minWidth: 0,
              minHeight: 0,
              overflow: "hidden",
              borderRadius: appTokens.shape.radius.small,
              bgcolor: "background.paper",
            }}
          >
            <FilePreview
              absolutePath={sticker.absolutePath}
              relativePath={sticker.relativePath}
            />
          </Box>
        ))}
      </Box>
      <Box
        sx={{
          position: "absolute",
          inset: 8,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          gap: 1,
          pointerEvents: "none",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
          <PreviewLabel>{title}</PreviewLabel>
          {overflowCount > 0 ? (
            <PreviewLabel>+{overflowCount}</PreviewLabel>
          ) : null}
        </Box>
        <Box
          sx={{
            alignSelf: "flex-start",
            display: "flex",
            flexWrap: "wrap",
            gap: 0.5,
          }}
        >
          {statusSummary.ready > 0 ? (
            <SummaryChip label={formatStatusCount("ready", statusSummary.ready)} />
          ) : null}
          {statusSummary.draft > 0 ? (
            <SummaryChip label={formatStatusCount("draft", statusSummary.draft)} />
          ) : null}
          {statusSummary.modified > 0 ? (
            <SummaryChip
              label={formatStatusCount("modified", statusSummary.modified)}
            />
          ) : null}
          {statusSummary.synced > 0 ? (
            <SummaryChip label={formatStatusCount("synced", statusSummary.synced)} />
          ) : null}
          {statusSummary.failed > 0 ? (
            <SummaryChip label={formatStatusCount("failed", statusSummary.failed)} />
          ) : null}
        </Box>
      </Box>
    </>
  );
}

function PreviewLabel({ children }: { children: ReactNode }) {
  return (
    <Typography
      variant="subtitle2"
      sx={{
        px: 0.75,
        py: 0.35,
        borderRadius: appTokens.shape.radius.small,
        bgcolor: appTokens.colors.overlay.mediaLabel,
        color: appTokens.colors.text.inverseMuted,
        fontSize: appTokens.typography.fontSizes.caption,
        fontFamily: appTokens.typography.monoFontFamily,
        lineHeight: 1.2,
      }}
    >
      {children}
    </Typography>
  );
}

function SummaryChip({ label }: { label: string }) {
  return (
    <Typography
      variant="caption"
      sx={{
        px: 0.75,
        py: 0.25,
        borderRadius: appTokens.shape.radius.small,
        bgcolor: appTokens.colors.overlay.mediaLabel,
        color: appTokens.colors.text.inverseMuted,
        fontSize: appTokens.typography.fontSizes.assetKind,
        lineHeight: 1.2,
      }}
    >
      {label}
    </Typography>
  );
}

function formatStatusCount(status: keyof typeof stickerStatusMeta, count: number) {
  return `${count} ${stickerStatusMeta[status].label.toLowerCase()}`;
}

function StatusChip({ sticker }: { sticker: StickerItem }) {
  const status = getStickerStatus(sticker);
  const { Icon, label } = stickerStatusMeta[status];

  return (
    <Chip
      size="small"
      icon={<Icon />}
      label={label}
      variant="filled"
      sx={{
        height: appTokens.sizes.chip.compactHeight,
        fontSize: appTokens.typography.fontSizes.assetKind,
        textTransform: "uppercase",
        letterSpacing: appTokens.typography.letterSpacing.chip,
        bgcolor: appTokens.colors.background.surface,
        backgroundImage: `linear-gradient(${appTokens.colors.status[status].background}, ${appTokens.colors.status[status].background})`,
        border: `1px solid ${appTokens.colors.status[status].border}`,
        color: appTokens.colors.status[status].contrast,
        "& .MuiChip-icon": {
          color: appTokens.colors.status[status].main,
          fontSize: 15,
          ml: 0.75,
        },
      }}
    />
  );
}
