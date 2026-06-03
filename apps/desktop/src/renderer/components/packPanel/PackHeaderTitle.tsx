import type { ReactNode } from "react";
import ChangeCircleIcon from "@mui/icons-material/ChangeCircle";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import CreateIcon from "@mui/icons-material/Create";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { StickerItem, StickerPack } from "@sticker-smith/shared";
import { appTokens } from "../../../theme/appTokens";
import { toFileUrl } from "../../utils/fileUrl";
import { isVideoPath } from "../../utils/pathDisplay";
import {
  formatTelegramSyncStateLabel,
  telegramSyncStateChipSx,
} from "../../utils/telegramSyncState";
import { getStickerStatus } from "../stickerList/stickerUtils";

export function PackHeroThumbnail({ pack }: { pack: StickerPack }) {
  return (
    <Box
      sx={{
        width: 86,
        height: 86,
        flex: "0 0 auto",
        borderRadius: appTokens.shape.radius.panel,
        border: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {pack.thumbnailPath ? (
        <Box
          {...packThumbnailMediaProps(pack.name, pack.thumbnailPath)}
          sx={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      ) : (
        <Inventory2OutlinedIcon
          sx={{ fontSize: 34, color: "text.secondary" }}
        />
      )}
    </Box>
  );
}

function packThumbnailMediaProps(name: string, thumbnailPath: string) {
  const isVideo = isVideoPath(thumbnailPath);
  return {
    component: isVideo ? "video" : "img",
    src: toFileUrl(thumbnailPath),
    alt: isVideo ? undefined : name,
    "aria-label": isVideo ? `${name} icon preview` : undefined,
    muted: isVideo ? true : undefined,
    autoPlay: isVideo ? true : undefined,
    loop: isVideo ? true : undefined,
    playsInline: isVideo ? true : undefined,
    preload: isVideo ? "metadata" : undefined,
  } as const;
}

export function PackHeaderTitle({
  pack,
  stickers,
}: {
  pack: StickerPack;
  stickers: StickerItem[];
}) {
  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
        <Typography
          variant="subtitle1"
          fontWeight={appTokens.typography.fontWeights.medium}
          sx={{ fontSize: appTokens.typography.fontSizes.subtitle }}
          noWrap
        >
          {pack.name}
        </Typography>
        {pack.telegram ? (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              flex: "0 0 auto",
              fontSize: appTokens.typography.fontSizes.caption,
            }}
          >
            {pack.telegram.shortName}
          </Typography>
        ) : null}
      </Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: appTokens.layout.spacing.metadataGap,
          flexWrap: "wrap",
          mt: 0.75,
        }}
      >
        {pack.telegram ? (
          <Chip
            size="small"
            label={formatTelegramSyncStateLabel(pack.telegram.syncState)}
            sx={{
              height: 20,
              fontSize: appTokens.typography.fontSizes.caption,
              ...telegramSyncStateChipSx(pack.telegram.syncState),
            }}
          />
        ) : null}
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            flex: "0 0 auto",
            fontSize: appTokens.typography.fontSizes.caption,
          }}
        >
          {pack.source === "telegram" ? "Telegram linked" : "Local pack"}
        </Typography>
      </Box>
      <PackHeaderStats stickers={stickers} />
    </Box>
  );
}

function PackHeaderStats({ stickers }: { stickers: StickerItem[] }) {
  const stats = summarizeStickers(stickers);
  return (
    <Box
      sx={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 1,
        flexWrap: "wrap",
        mt: 1.25,
      }}
    >
      {stats.failed > 0 ? (
        <StatusChipGroup>
          <HeaderStatChip
            icon={<ErrorOutlineIcon />}
            label={appTokens.copy.labels.stickerStatusFailed}
            value={stats.failed}
            color="error.main"
            description="Download or conversion failed"
          />
        </StatusChipGroup>
      ) : null}
      <StatusChipGroup>
        <HeaderStatChip
          icon={<CreateIcon />}
          label={appTokens.copy.labels.stickerStatusDraft}
          value={stats.draft}
          color="warning.main"
          description="Missing file or emoji"
        />
        <HeaderStatChip
          icon={<CheckCircleOutlineIcon />}
          label={appTokens.copy.labels.stickerStatusReady}
          value={stats.ready}
          color="success.main"
          description="Complete locally, not published"
        />
      </StatusChipGroup>
      <StatusGroupDivider />
      <StatusChipGroup>
        <HeaderStatChip
          icon={<ChangeCircleIcon />}
          label={appTokens.copy.labels.stickerStatusModified}
          value={stats.modified}
          color="warning.main"
          description="Published with pending local edits"
        />
        <HeaderStatChip
          icon={<CheckCircleIcon />}
          label={appTokens.copy.labels.stickerStatusSynced}
          value={stats.synced}
          color="primary.main"
          description="Published and clean"
        />
      </StatusChipGroup>
    </Box>
  );
}

function StatusChipGroup({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.75,
        flexWrap: "wrap",
      }}
    >
      {children}
    </Box>
  );
}

function StatusGroupDivider() {
  return (
    <Box
      aria-hidden="true"
      sx={{
        alignSelf: "stretch",
        width: "1px",
        minHeight: 24,
        bgcolor: "divider",
        opacity: 0.55,
      }}
    />
  );
}

function HeaderStatChip({
  icon,
  label,
  value,
  color,
  description,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  color: string;
  description?: string;
}) {
  const chip = (
    <Box
      sx={{
        height: 28,
        px: 1,
        border: 1,
        borderColor: "divider",
        borderRadius: appTokens.shape.radius.control,
        bgcolor: value > 0 ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)",
        opacity: value > 0 ? 1 : 0.62,
        display: "flex",
        alignItems: "center",
        gap: 0.6,
        color: "text.secondary",
      }}
    >
      <Box sx={{ color, display: "flex", "& svg": { fontSize: 15 } }}>
        {icon}
      </Box>
      <Typography
        variant="caption"
        sx={{
          fontSize: appTokens.typography.fontSizes.caption,
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </Typography>
      <Typography
        variant="caption"
        sx={{
          color: "text.primary",
          fontWeight: appTokens.typography.fontWeights.medium,
          fontSize: appTokens.typography.fontSizes.caption,
          lineHeight: 1,
        }}
      >
        {value}
      </Typography>
    </Box>
  );

  if (!description) return chip;
  return <Tooltip title={description}>{chip}</Tooltip>;
}

function summarizeStickers(stickers: StickerItem[]) {
  return stickers.reduce(
    (summary, sticker) => {
      const status = getStickerStatus(sticker);
      return {
        total: summary.total + 1,
        draft: summary.draft + (status === "draft" ? 1 : 0),
        ready: summary.ready + (status === "ready" ? 1 : 0),
        synced: summary.synced + (status === "synced" ? 1 : 0),
        modified: summary.modified + (status === "modified" ? 1 : 0),
        failed: summary.failed + (status === "failed" ? 1 : 0),
      };
    },
    { total: 0, draft: 0, ready: 0, synced: 0, modified: 0, failed: 0 },
  );
}
