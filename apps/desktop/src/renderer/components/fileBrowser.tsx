import type { DragEvent, MouseEvent, ReactNode } from "react";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import StarIcon from "@mui/icons-material/Star";
import ViewListIcon from "@mui/icons-material/ViewList";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
import Box from "@mui/material/Box";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { appTokens } from "../../theme/appTokens";
import { getFileExtension, getLeafName } from "../utils/pathDisplay";
import { toFileUrl } from "../utils/fileUrl";
import { browserMetadataRowSx } from "./browserStyles";

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
  absolutePath: string | null;
  relativePath: string;
  kind?: string;
  placeholderLabel?: string;
}

interface BrowserViewToggleProps {
  ariaLabel: string;
  view: BrowserView;
  onChange: (nextView: BrowserView) => void;
  compact?: boolean;
}

export interface BrowserItemProps {
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

type BrowserItemFrameProps = Omit<
  BrowserItemProps,
  "label" | "preview" | "metadata"
> & {
  frameSx: object;
  children: ReactNode;
};

type BrowserItemStateInput = {
  isPinned: boolean;
  selected: boolean;
  isDragOver: boolean;
  draggable: boolean;
};

function browserItemBorderColor(input: BrowserItemStateInput) {
  if (input.isDragOver) return "primary.light";
  if (input.selected || input.isPinned) return "primary.main";
  return "divider";
}

function browserItemHoverBorderColor(input: BrowserItemStateInput) {
  return input.selected || input.isPinned ? "primary.light" : "action.selected";
}

function browserItemShadow(input: BrowserItemStateInput) {
  return input.isDragOver || input.selected
    ? "0 0 0 1px rgba(96,165,250,0.35)"
    : "none";
}

function browserItemActiveSx(input: BrowserItemStateInput) {
  return input.draggable ? { cursor: "grabbing" } : undefined;
}

function browserItemStateSx(input: BrowserItemStateInput) {
  return {
    position: "relative",
    border: "1px solid",
    borderColor: browserItemBorderColor(input),
    bgcolor: input.selected ? "action.selected" : "action.hover",
    cursor: input.draggable ? "grab" : "default",
    userSelect: "none",
    WebkitUserSelect: "none",
    transition: "border-color 0.15s, background-color 0.15s, box-shadow 0.15s",
    boxShadow: browserItemShadow(input),
    "&:hover": {
      bgcolor: "action.selected",
      borderColor: browserItemHoverBorderColor(input),
    },
    "&:active": browserItemActiveSx(input),
  } as const;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function sortItemsWithPinnedFirst<T>(
  items: readonly T[],
  options: {
    getOrder: (item: T) => number;
    isPinned: (item: T) => boolean;
  },
) {
  return [...items]
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const leftPinned = options.isPinned(left.item);
      const rightPinned = options.isPinned(right.item);

      if (leftPinned !== rightPinned) {
        return leftPinned ? -1 : 1;
      }

      return (
        options.getOrder(left.item) - options.getOrder(right.item) ||
        left.index - right.index
      );
    })
    .map(({ item }) => item);
}

interface PlaceholderPreviewProps {
  label?: string;
}

interface MediaPreviewProps {
  fileUrl: string;
  filename: string;
}

interface GenericFilePreviewProps {
  extension: string;
}

function PlaceholderPreview({ label }: PlaceholderPreviewProps) {
  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "action.hover",
        color: "text.secondary",
        textAlign: "center",
        px: 1,
      }}
    >
      <Typography
        variant="caption"
        sx={{ fontSize: appTokens.typography.fontSizes.caption }}
      >
        {label ?? "Waiting for Telegram media"}
      </Typography>
    </Box>
  );
}

function ImagePreview({ fileUrl, filename }: MediaPreviewProps) {
  return (
    <Box
      component="img"
      src={fileUrl}
      alt={filename}
      draggable={false}
      sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
    />
  );
}

function VideoPreview({ fileUrl }: Pick<MediaPreviewProps, "fileUrl">) {
  return (
    <Box
      component="video"
      src={fileUrl}
      draggable={false}
      muted
      autoPlay
      loop
      playsInline
      preload="metadata"
      sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
    />
  );
}

function GenericFilePreview({ extension }: GenericFilePreviewProps) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.5 }}>
      <InsertDriveFileIcon
        sx={{ fontSize: appTokens.sizes.preview.fileTypeIcon, color: "text.disabled" }}
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

export function FilePreview({
  absolutePath,
  relativePath,
  kind,
  placeholderLabel,
}: PreviewProps) {
  const extension = (kind ?? getFileExtension(relativePath)).toLowerCase();

  if (!absolutePath) {
    return <PlaceholderPreview label={placeholderLabel} />;
  }

  const fileUrl = toFileUrl(absolutePath);

  if (IMAGE_EXTENSIONS.has(extension)) {
    return <ImagePreview fileUrl={fileUrl} filename={getLeafName(relativePath)} />;
  }

  if (VIDEO_EXTENSIONS.has(extension)) {
    return <VideoPreview fileUrl={fileUrl} />;
  }

  return <GenericFilePreview extension={extension} />;
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
        sx={{ height: appTokens.sizes.controls.toggleHeight }}
      >
        <ToggleButton
          value="gallery"
          aria-label={appTokens.copy.labels.galleryView}
        >
          <ViewModuleIcon sx={{ fontSize: appTokens.sizes.icon.action }} />
        </ToggleButton>
        <ToggleButton value="list" aria-label={appTokens.copy.labels.listView}>
          <ViewListIcon sx={{ fontSize: appTokens.sizes.icon.action }} />
        </ToggleButton>
      </ToggleButtonGroup>
    </Box>
  );
}

function BrowserItemFrame({
  title,
  isPinned = false,
  selected = false,
  isDragOver = false,
  draggable = false,
  onClick,
  onDoubleClick,
  onContextMenu,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  frameSx,
  children,
}: BrowserItemFrameProps) {
  return (
    <Box
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      draggable={draggable}
      title={title}
      sx={{
        ...frameSx,
        ...browserItemStateSx({
          isPinned,
          selected,
          isDragOver,
          draggable,
        }),
      }}
    >
      {isPinned ? <PinnedBadge /> : null}
      {children}
    </Box>
  );
}

export function BrowserGalleryCard({
  title,
  label,
  isPinned = false,
  preview,
  metadata,
  ...frameProps
}: BrowserItemProps) {
  return (
    <BrowserItemFrame
      {...frameProps}
      title={title}
      isPinned={isPinned}
      frameSx={{
        borderRadius: appTokens.shape.radius.card,
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          aspectRatio: appTokens.sizes.preview.aspectRatio,
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
          {label}
        </Typography>
        <Box
          sx={browserMetadataRowSx}
        >
          {metadata}
        </Box>
      </Box>
    </BrowserItemFrame>
  );
}

export function BrowserListRow({
  title,
  label,
  isPinned = false,
  preview,
  metadata,
  ...frameProps
}: BrowserItemProps) {
  return (
    <BrowserItemFrame
      {...frameProps}
      title={title}
      isPinned={isPinned}
      frameSx={{
        display: "flex",
        alignItems: "center",
        gap: 1.25,
        px: 1,
        py: 0.85,
        borderRadius: appTokens.shape.radius.panel,
      }}
    >
      <Box
        sx={{
          width: appTokens.sizes.preview.listRow,
          minWidth: appTokens.sizes.preview.listRow,
          height: appTokens.sizes.preview.listRow,
          overflow: "hidden",
          bgcolor: "background.paper",
          display: "block",
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
          {label}
        </Typography>
        <Box
          sx={browserMetadataRowSx}
        >
          {metadata}
        </Box>
      </Box>
    </BrowserItemFrame>
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
        borderRadius: appTokens.shape.radius.round,
        width: appTokens.sizes.preview.badge,
        height: appTokens.sizes.preview.badge,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <StarIcon
        sx={{
          fontSize: appTokens.sizes.preview.badgeIcon,
          color: appTokens.colors.text.contrast,
        }}
      />
    </Box>
  );
}
