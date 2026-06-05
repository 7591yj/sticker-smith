import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import InsertEmoticonIcon from "@mui/icons-material/InsertEmoticon";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { StickerItem } from "@sticker-smith/shared";
import { appTokens } from "../../../theme/appTokens";
import { formatOrderLabel } from "../browserItemUtils";
import { InspectorRows } from "./StickerInspectorRows";
import {
  MultiStickerPreview,
  SingleStickerPreview,
} from "./StickerInspectorPreview";

const inspectorActionButtonSx = {
  height: 34,
  minHeight: 34,
  borderRadius: appTokens.shape.radius.control,
  textTransform: "none",
} as const;

const inspectorDeleteButtonSx = {
  ...inspectorActionButtonSx,
  width: 34,
  minWidth: 34,
  color: "error.main",
  border: 1,
  borderColor: "error.main",
  p: 0,
  "&:hover": {
    borderColor: "error.main",
    bgcolor: "error.main",
    color: "error.contrastText",
  },
} as const;

export function StickerInspector({
  selectedStickers,
  onEditEmoji,
  onDelete,
}: {
  selectedStickers: StickerItem[];
  onEditEmoji: () => void;
  onDelete: () => void;
}) {
  const selectedSticker =
    selectedStickers.length === 1 ? selectedStickers[0] : null;
  const title = selectedSticker
    ? formatOrderLabel(selectedSticker.order)
    : selectedStickers.length > 1
      ? `${selectedStickers.length} selected`
      : "No selection";

  return (
    <Box
      sx={{
        minHeight: 0,
        bgcolor: "rgba(255,255,255,0.012)",
        p: 1.5,
        display: { xs: "none", lg: "flex" },
        flexDirection: "column",
        gap: 1.5,
      }}
    >
      <Box
        sx={{
          position: "relative",
          aspectRatio: "1 / 1",
          borderRadius: appTokens.shape.radius.thumbnail,
          overflow: "hidden",
          bgcolor: "background.paper",
          border: 1,
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {selectedSticker ? (
          <SingleStickerPreview sticker={selectedSticker} title={title} />
        ) : selectedStickers.length > 1 ? (
          <MultiStickerPreview stickers={selectedStickers} title={title} />
        ) : (
          <Typography
            variant="subtitle2"
            color="text.secondary"
            sx={{
              fontSize: appTokens.typography.fontSizes.subtitle,
              fontFamily: appTokens.typography.monoFontFamily,
            }}
          >
            {title}
          </Typography>
        )}
      </Box>
      {selectedSticker ? (
        <>
          <InspectorRows sticker={selectedSticker} />
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={
                <InsertEmoticonIcon
                  sx={{ fontSize: appTokens.sizes.icon.compactAction }}
                />
              }
              onClick={onEditEmoji}
              sx={{ ...inspectorActionButtonSx, flex: 1 }}
            >
              {appTokens.copy.actions.editEmojis}
            </Button>
            <Tooltip title={appTokens.copy.actions.delete}>
              <IconButton
                size="small"
                aria-label={appTokens.copy.actions.delete}
                onClick={onDelete}
                sx={inspectorDeleteButtonSx}
              >
                <DeleteOutlineIcon
                  sx={{ fontSize: appTokens.sizes.icon.compactAction }}
                />
              </IconButton>
            </Tooltip>
          </Box>
        </>
      ) : selectedStickers.length > 1 ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Button
            size="small"
            variant="outlined"
            onClick={onEditEmoji}
            sx={{ ...inspectorActionButtonSx, flex: 1 }}
          >
            {appTokens.copy.dialogs.editSelectedEmojis}
          </Button>
          <Tooltip title={appTokens.copy.actions.delete}>
            <IconButton
              size="small"
              aria-label={appTokens.copy.actions.delete}
              onClick={onDelete}
              sx={inspectorDeleteButtonSx}
            >
              <DeleteOutlineIcon
                sx={{ fontSize: appTokens.sizes.icon.compactAction }}
              />
            </IconButton>
          </Tooltip>
        </Box>
      ) : null}
    </Box>
  );
}
