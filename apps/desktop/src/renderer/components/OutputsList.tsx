import { useCallback, useState } from "react";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import StarIcon from "@mui/icons-material/Star";
import ViewListIcon from "@mui/icons-material/ViewList";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { OutputArtifact } from "@sticker-smith/shared";
import { appTokens } from "../../theme/appTokens";
import { toFileUrl } from "../utils/fileUrl";

interface Props {
  outputs: OutputArtifact[];
  packId: string;
}

type OutputView = "gallery" | "list";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm"]);

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getOutputExtension(relativePath: string) {
  return relativePath.split(".").pop()?.toLowerCase() ?? "";
}

function OutputPreview({ output }: { output: OutputArtifact }) {
  const filename = output.relativePath.split("/").pop() ?? output.relativePath;
  const extension = getOutputExtension(output.relativePath);
  const fileUrl = toFileUrl(output.absolutePath);

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

export function OutputsList({ outputs, packId }: Props) {
  const [view, setView] = useState<OutputView>("gallery");
  const sortedOutputs = [...outputs].sort((left, right) => {
    if (left.mode === "icon" && right.mode !== "icon") return -1;
    if (left.mode !== "icon" && right.mode === "icon") return 1;
    return left.relativePath.localeCompare(right.relativePath);
  });

  const handleReveal = useCallback((relativePath: string) => {
    void window.stickerSmith.outputs.revealInFolder({ packId, relativePath });
  }, [packId]);

  const handleViewChange = useCallback(
    (_event: React.MouseEvent<HTMLElement>, nextView: OutputView | null) => {
      if (nextView) {
        setView(nextView);
      }
    },
    [],
  );

  return (
    <Box sx={{ px: 2.5, pt: 1.5, pb: 2.5 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          mb: 0.75,
        }}
      >
        <Typography
          variant="overline"
          color="text.secondary"
          sx={{
            fontSize: appTokens.typography.fontSizes.overline,
            letterSpacing: appTokens.typography.letterSpacing.overline,
            display: "block",
          }}
        >
          {appTokens.copy.labels.outputs} ({outputs.length})
        </Typography>
        <ToggleButtonGroup
          size="small"
          value={view}
          exclusive
          onChange={handleViewChange}
          aria-label={`${appTokens.copy.labels.outputs} view`}
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

      {view === "list" ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          {sortedOutputs.map((out) => (
            <Box
              key={out.relativePath}
              title={out.relativePath}
              sx={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                gap: 1,
                px: 1.5,
                py: 0.75,
                borderRadius: appTokens.radii.panel / 8,
                border: "1px solid",
                borderColor: out.mode === "icon" ? "primary.main" : "transparent",
                bgcolor: "action.hover",
                "&:hover": {
                  bgcolor: "action.selected",
                  borderColor:
                    out.mode === "icon" ? "primary.light" : "action.selected",
                },
              }}
            >
              {out.mode === "icon" && (
                <Box
                  sx={{
                    position: "absolute",
                    top: 4,
                    right: 4,
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
              )}
              <Typography
                variant="body2"
                sx={{
                  flex: 1,
                  fontFamily: appTokens.typography.monoFontFamily,
                  fontSize: appTokens.typography.fontSizes.bodyCompact,
                }}
                noWrap
              >
                {out.relativePath.split("/").pop()}
              </Typography>
              <Chip
                label={out.mode}
                size="small"
                sx={{
                  height: 18,
                  fontSize: appTokens.typography.fontSizes.assetKind,
                  textTransform: "uppercase",
                  letterSpacing: appTokens.typography.letterSpacing.chip,
                }}
              />
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  flexShrink: 0,
                  fontSize: appTokens.typography.fontSizes.secondaryCaption,
                }}
              >
                {formatBytes(out.sizeBytes)}
              </Typography>
              <Tooltip title={appTokens.copy.labels.openContainingFolder}>
                <IconButton
                  size="small"
                  onClick={() => handleReveal(out.relativePath)}
                  sx={{ p: 0.25 }}
                >
                  <FolderOpenIcon
                    sx={{ fontSize: appTokens.sizes.compactActionIcon }}
                  />
                </IconButton>
              </Tooltip>
            </Box>
          ))}
        </Box>
      ) : (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: `repeat(auto-fill, minmax(${appTokens.layout.outputGridMinWidth}px, 1fr))`,
            gap: 1.5,
          }}
        >
          {sortedOutputs.map((out) => {
            const filename =
              out.relativePath.split("/").pop() ?? out.relativePath;

            return (
              <Box
                key={out.relativePath}
                title={out.relativePath}
                sx={{
                  position: "relative",
                  borderRadius: appTokens.radii.card / 8,
                  overflow: "hidden",
                  border: "1px solid",
                  borderColor: out.mode === "icon" ? "primary.main" : "divider",
                  bgcolor: "action.hover",
                }}
              >
                {out.mode === "icon" && (
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
                )}
                <Box
                  sx={{
                    aspectRatio: appTokens.layout.squareAspectRatio,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    bgcolor: "background.paper",
                  }}
                >
                  <OutputPreview output={out} />
                </Box>
                <Box sx={{ px: 1, py: 0.9 }}>
                  <Typography
                    variant="body2"
                    noWrap
                    title={out.relativePath}
                    sx={{
                      fontSize: appTokens.typography.fontSizes.bodyCompact,
                      mb: 0.75,
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
                    <Chip
                      label={out.mode}
                      size="small"
                      sx={{
                        height: 18,
                        fontSize: appTokens.typography.fontSizes.assetKind,
                        textTransform: "uppercase",
                        letterSpacing: appTokens.typography.letterSpacing.chip,
                      }}
                    />
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{
                        fontSize: appTokens.typography.fontSizes.secondaryCaption,
                      }}
                    >
                      {formatBytes(out.sizeBytes)}
                    </Typography>
                    <Button
                      size="small"
                      onClick={() => handleReveal(out.relativePath)}
                      startIcon={
                        <FolderOpenIcon
                          sx={{
                            fontSize: `${appTokens.sizes.compactActionIcon - 1}px !important`,
                          }}
                        />
                      }
                      sx={{
                        ml: "auto",
                        minWidth: 0,
                        px: 0.75,
                        textTransform: "none",
                        fontSize: appTokens.typography.fontSizes.secondaryCaption,
                      }}
                    >
                      {appTokens.copy.actions.open}
                    </Button>
                  </Box>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
