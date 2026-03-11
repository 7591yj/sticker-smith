import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import type { OutputArtifact } from "@sticker-smith/shared";
import { appTokens } from "../../theme/appTokens";
import {
  BrowserGalleryCard,
  BrowserListRow,
  type BrowserView,
  FilePreview,
  formatBytes,
  sortItemsWithPinnedFirst,
} from "./fileBrowser";

interface Props {
  outputs: OutputArtifact[];
  view: BrowserView;
}

export function OutputsList({ outputs, view }: Props) {
  const sortedOutputs = sortItemsWithPinnedFirst(outputs, {
    getLabel: (output) => output.relativePath,
    isPinned: (output) => output.mode === "icon",
  });

  return (
    <Box sx={{ pb: 2.5 }}>
      {view === "list" ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75, px: 2.5 }}>
          {sortedOutputs.map((out) => (
            <BrowserListRow
              key={out.relativePath}
              title={out.relativePath}
              filename={out.relativePath.split("/").pop() ?? out.relativePath}
              isPinned={out.mode === "icon"}
              preview={
                <FilePreview
                  absolutePath={out.absolutePath}
                  relativePath={out.relativePath}
                />
              }
              metadata={
                <>
                  <Chip
                    label={out.mode}
                    size="small"
                    sx={fileMetaChipSx}
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
                </>
              }
            />
          ))}
        </Box>
      ) : (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: `repeat(auto-fill, minmax(${appTokens.layout.fileGridMinWidth}px, 1fr))`,
            gap: 1.5,
            px: 2.5,
          }}
        >
          {sortedOutputs.map((out) => {
            const filename =
              out.relativePath.split("/").pop() ?? out.relativePath;

            return (
              <BrowserGalleryCard
                key={out.relativePath}
                title={out.relativePath}
                filename={filename}
                isPinned={out.mode === "icon"}
                preview={
                  <FilePreview
                    absolutePath={out.absolutePath}
                    relativePath={out.relativePath}
                  />
                }
                metadata={
                  <>
                    <Chip label={out.mode} size="small" sx={fileMetaChipSx} />
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{
                        fontSize: appTokens.typography.fontSizes.secondaryCaption,
                      }}
                    >
                      {formatBytes(out.sizeBytes)}
                    </Typography>
                  </>
                }
              />
            );
          })}
        </Box>
      )}
    </Box>
  );
}

const fileMetaChipSx = {
  height: 18,
  fontSize: appTokens.typography.fontSizes.assetKind,
  textTransform: "uppercase",
  letterSpacing: appTokens.typography.letterSpacing.chip,
} as const;
