import AddIcon from "@mui/icons-material/Add";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import IosShareIcon from "@mui/icons-material/IosShare";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { appTokens } from "../../../theme/appTokens";
import { actionIconSx, formatCountLabel } from "../browserStyles";
import { panelSecondaryButtonSx } from "./packPanelStyles";

export function PackStickerToolbar({
  stickerCount,
  converting,
  onImportFiles,
  onImportDir,
  onOpenStickers,
  onExportStickers,
}: {
  stickerCount: number;
  converting: boolean;
  onImportFiles: () => void;
  onImportDir: () => void;
  onOpenStickers: () => void;
  onExportStickers: () => void;
}) {
  return (
    <Box
      sx={{
        px: appTokens.layout.spacing.panelPaddingX,
        py: 0.75,
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 1,
        borderBottom: 1,
        borderColor: "divider",
      }}
    >
      <Button
        size="small"
        variant="outlined"
        startIcon={
          <AddIcon sx={actionIconSx(appTokens.sizes.icon.compactAction)} />
        }
        onClick={onImportFiles}
        disabled={converting}
        sx={panelSecondaryButtonSx}
      >
        {appTokens.copy.actions.addFiles}
      </Button>
      <Button
        size="small"
        variant="outlined"
        startIcon={
          <CreateNewFolderIcon
            sx={actionIconSx(appTokens.sizes.icon.compactAction)}
          />
        }
        onClick={onImportDir}
        disabled={converting}
        sx={panelSecondaryButtonSx}
      >
        {appTokens.copy.actions.addFolder}
      </Button>
      <Box
        sx={{
          ml: "auto",
          display: "flex",
          alignItems: "center",
          gap: 1,
          flexWrap: "wrap",
          justifyContent: "flex-end",
        }}
      >
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontSize: appTokens.typography.fontSizes.caption }}
        >
          {formatCountLabel(stickerCount, "sticker")}
        </Typography>
        <Button
          size="small"
          variant="outlined"
          startIcon={
            <FolderOpenIcon
              sx={actionIconSx(appTokens.sizes.icon.compactAction)}
            />
          }
          onClick={onOpenStickers}
          sx={{ ...panelSecondaryButtonSx, whiteSpace: "nowrap" }}
        >
          {appTokens.copy.actions.openFolder}
        </Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={
            <IosShareIcon
              sx={actionIconSx(appTokens.sizes.icon.compactAction)}
            />
          }
          onClick={onExportStickers}
          disabled={stickerCount === 0}
          sx={{ ...panelSecondaryButtonSx, whiteSpace: "nowrap" }}
        >
          {appTokens.copy.actions.export}
        </Button>
      </Box>
    </Box>
  );
}
