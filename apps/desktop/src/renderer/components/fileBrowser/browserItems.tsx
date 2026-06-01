import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { appTokens } from "../../../theme/appTokens";
import { browserMetadataRowSx } from "../browserStyles";
import { BrowserItemFrame } from "./browserItemFrame";
import type { BrowserItemProps } from "./types";

export function BrowserGalleryCard({
  title,
  label,
  isPinned = false,
  preview,
  metadata,
  overlay,
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
          position: "relative",
        }}
      >
        {preview}
        {overlay ? (
          <Box
            sx={{
              position: "absolute",
              top: 3.5,
              left: 3.5,
              zIndex: 1,
              display: "flex",
            }}
          >
            {overlay}
          </Box>
        ) : null}
      </Box>
      <Box sx={{ px: 1, py: 0.9 }}>
        {label != null && label !== "" ? (
          <Box
            sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.5 }}
          >
            <Typography
              variant="body2"
              noWrap
              title={title}
              sx={{
                flex: 1,
                minWidth: 0,
                fontSize: appTokens.typography.fontSizes.bodyCompact,
                pr: isPinned ? 2.25 : 0,
              }}
            >
              {label}
            </Typography>
          </Box>
        ) : null}
        <Box sx={browserMetadataRowSx}>{metadata}</Box>
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
        <Box sx={browserMetadataRowSx}>{metadata}</Box>
      </Box>
    </BrowserItemFrame>
  );
}
