import type { MouseEvent, ReactNode } from "react";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import StarIcon from "@mui/icons-material/Star";
import ViewListIcon from "@mui/icons-material/ViewList";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
import Box from "@mui/material/Box";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { appTokens } from "../../theme/appTokens";
import { toFileUrl } from "../utils/fileUrl";

export type BrowserView = "gallery" | "list";

const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "bmp",
  "tiff",
]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm"]);

interface PreviewProps {
  absolutePath: string;
  relativePath: string;
  kind?: string;
}

interface BrowserViewToggleProps {
  ariaLabel: string;
  view: BrowserView;
  onChange: (nextView: BrowserView) => void;
  compact?: boolean;
}

interface BrowserGalleryCardProps {
  title: string;
  filename: string;
  isPinned?: boolean;
  preview: ReactNode;
  metadata: ReactNode;
  onContextMenu?: (event: MouseEvent<HTMLDivElement>) => void;
}

interface BrowserListRowProps {
  title: string;
  filename: string;
  isPinned?: boolean;
  preview: ReactNode;
  metadata: ReactNode;
  onContextMenu?: (event: MouseEvent<HTMLDivElement>) => void;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function getFileExtension(relativePath: string) {
  return relativePath.split(".").pop()?.toLowerCase() ?? "";
}

export function sortItemsWithPinnedFirst<T>(
  items: readonly T[],
  options: {
    getLabel: (item: T) => string;
    isPinned: (item: T) => boolean;
  },
) {
  const pinned: T[] = [];
  const rest: T[] = [];

  for (const item of items) {
    if (options.isPinned(item)) {
      pinned.push(item);
      continue;
    }

    rest.push(item);
  }

  const byLabel = (left: T, right: T) =>
    options.getLabel(left).localeCompare(options.getLabel(right));

  return [...pinned.sort(byLabel), ...rest.sort(byLabel)];
}

export function FilePreview({ absolutePath, relativePath, kind }: PreviewProps) {
  const filename = relativePath.split("/").pop() ?? relativePath;
  const extension = (kind ?? getFileExtension(relativePath)).toLowerCase();
  const fileUrl = toFileUrl(absolutePath);

  if (IMAGE_EXTENSIONS.has(extension)) {
    return (
      <Box
        component="img"
        src={fileUrl}
        alt={filename}
        sx={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
        }}
      />
    );
  }

  if (VIDEO_EXTENSIONS.has(extension)) {
    return (
      <Box
        component="video"
        src={fileUrl}
        muted
        autoPlay
        loop
        playsInline
        preload="metadata"
        sx={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
        }}
      />
    );
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 0.5,
      }}
    >
      <InsertDriveFileIcon
        sx={{ fontSize: appTokens.sizes.fileTypeIcon, color: "text.disabled" }}
      />
      <Typography
        variant="caption"
        sx={{
          fontWeight: appTokens.typography.fontWeights.bold,
          textTransform: "uppercase",
          fontSize: appTokens.typography.fontSizes.assetKind,
          color: "text.secondary",
        }}
      >
        {extension || "file"}
      </Typography>
    </Box>
  );
}

export function BrowserViewToggle({
  ariaLabel,
  view,
  onChange,
  compact = false,
}: BrowserViewToggleProps) {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "flex-end",
        px: compact ? 0 : 2.5,
        pt: compact ? 0 : 1.5,
        pb: compact ? 0 : 1,
      }}
    >
      <ToggleButtonGroup
        size="small"
        value={view}
        exclusive
        onChange={(_event, nextView: BrowserView | null) => {
          if (nextView) {
            onChange(nextView);
          }
        }}
        aria-label={ariaLabel}
        sx={{ height: appTokens.sizes.toggleHeight }}
      >
        <ToggleButton
          value="gallery"
          aria-label={appTokens.copy.labels.galleryView}
        >
          <ViewModuleIcon sx={{ fontSize: appTokens.sizes.actionIcon }} />
        </ToggleButton>
        <ToggleButton value="list" aria-label={appTokens.copy.labels.listView}>
          <ViewListIcon sx={{ fontSize: appTokens.sizes.actionIcon }} />
        </ToggleButton>
      </ToggleButtonGroup>
    </Box>
  );
}

export function BrowserGalleryCard({
  title,
  filename,
  isPinned = false,
  preview,
  metadata,
  onContextMenu,
}: BrowserGalleryCardProps) {
  return (
    <Box
      onContextMenu={onContextMenu}
      title={title}
      sx={{
        position: "relative",
        borderRadius: appTokens.radii.card / 8,
        overflow: "hidden",
        border: "1px solid",
        borderColor: isPinned ? "primary.main" : "divider",
        bgcolor: "action.hover",
        cursor: "default",
        transition: "border-color 0.15s, background-color 0.15s",
        "&:hover": {
          bgcolor: "action.selected",
          borderColor: isPinned ? "primary.light" : "action.selected",
        },
      }}
    >
      {isPinned ? <PinnedBadge /> : null}
      <Box
        sx={{
          aspectRatio: appTokens.layout.squareAspectRatio,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "background.paper",
        }}
      >
        {preview}
      </Box>
      <Box sx={{ px: 1, py: 0.9 }}>
        <Typography
          variant="body2"
          noWrap
          title={title}
          sx={{
            fontSize: appTokens.typography.fontSizes.bodyCompact,
            mb: 0.75,
            pr: isPinned ? 2.25 : 0,
          }}
        >
          {filename}
        </Typography>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            flexWrap: "wrap",
          }}
        >
          {metadata}
        </Box>
      </Box>
    </Box>
  );
}

export function BrowserListRow({
  title,
  filename,
  isPinned = false,
  preview,
  metadata,
  onContextMenu,
}: BrowserListRowProps) {
  return (
    <Box
      onContextMenu={onContextMenu}
      title={title}
      sx={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 1.25,
        px: 1,
        py: 0.85,
        borderRadius: appTokens.radii.panel / 8,
        border: "1px solid",
        borderColor: isPinned ? "primary.main" : "divider",
        bgcolor: "action.hover",
        cursor: "default",
        transition: "border-color 0.15s, background-color 0.15s",
        "&:hover": {
          bgcolor: "action.selected",
          borderColor: isPinned ? "primary.light" : "action.selected",
        },
      }}
    >
      {isPinned ? <PinnedBadge /> : null}
      <Box
        sx={{
          width: 54,
          minWidth: 54,
          aspectRatio: appTokens.layout.squareAspectRatio,
          borderRadius: appTokens.radii.control,
          overflow: "hidden",
          bgcolor: "background.paper",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {preview}
      </Box>
      <Box sx={{ minWidth: 0, flex: 1, pr: isPinned ? 2.25 : 0 }}>
        <Typography
          variant="body2"
          noWrap
          sx={{
            fontFamily: appTokens.typography.monoFontFamily,
            fontSize: appTokens.typography.fontSizes.bodyCompact,
            mb: 0.4,
          }}
        >
          {filename}
        </Typography>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            flexWrap: "wrap",
          }}
        >
          {metadata}
        </Box>
      </Box>
    </Box>
  );
}

function PinnedBadge() {
  return (
    <Box
      sx={{
        position: "absolute",
        top: 4,
        right: 4,
        zIndex: 1,
        bgcolor: "primary.main",
        borderRadius: appTokens.radii.round,
        width: appTokens.sizes.badge,
        height: appTokens.sizes.badge,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <StarIcon
        sx={{
          fontSize: appTokens.sizes.badgeIcon,
          color: appTokens.colors.text.contrast,
        }}
      />
    </Box>
  );
}
