import { useState } from "react";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { appTokens } from "../../../theme/appTokens";
import { toFileUrl } from "../../utils/fileUrl";
import { getFileExtension, getLeafName } from "../../utils/pathDisplay";
import type { PreviewProps } from "./types";

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
  const [failed, setFailed] = useState(false);

  if (failed) return <GenericFilePreview extension={getFileExtension(filename)} />;

  return (
    <Box
      component="img"
      src={fileUrl}
      alt={filename}
      draggable={false}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      sx={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        display: "block",
      }}
    />
  );
}

function VideoPreview({ fileUrl, filename }: MediaPreviewProps) {
  const [failed, setFailed] = useState(false);

  if (failed) return <GenericFilePreview extension={getFileExtension(filename)} />;

  return (
    <Box
      component="video"
      src={fileUrl}
      aria-label={`${filename} preview`}
      draggable={false}
      muted
      autoPlay
      loop
      playsInline
      preload="metadata"
      onError={() => setFailed(true)}
      sx={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        display: "block",
      }}
    />
  );
}

function GenericFilePreview({ extension }: GenericFilePreviewProps) {
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
        sx={{
          fontSize: appTokens.sizes.preview.fileTypeIcon,
          color: "text.disabled",
        }}
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

  if (!absolutePath) return <PlaceholderPreview label={placeholderLabel} />;

  const fileUrl = toFileUrl(absolutePath);

  if (IMAGE_EXTENSIONS.has(extension)) {
    return (
      <ImagePreview fileUrl={fileUrl} filename={getLeafName(relativePath)} />
    );
  }

  if (VIDEO_EXTENSIONS.has(extension))
    return <VideoPreview fileUrl={fileUrl} filename={getLeafName(relativePath)} />;

  return <GenericFilePreview extension={extension} />;
}
