import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import InsertEmoticonIcon from "@mui/icons-material/InsertEmoticon";
import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { StickerItem } from "@sticker-smith/shared";
import { appTokens } from "../../../theme/appTokens";
import { formatOrderLabel } from "../stickerOrder";
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
  totalStickers,
  onEditEmoji,
  onDelete,
  onMoveToIndex,
}: {
  selectedStickers: StickerItem[];
  totalStickers: number;
  onEditEmoji: () => void;
  onDelete: () => void;
  onMoveToIndex: (sticker: StickerItem, index: number) => void;
}) {
  const [indexValue, setIndexValue] = useState("");
  const selectedSticker =
    selectedStickers.length === 1 ? selectedStickers[0] : null;
  const title = selectedSticker
    ? formatOrderLabel(selectedSticker.order)
    : selectedStickers.length > 1
      ? `${selectedStickers.length} selected`
      : "No selection";

  useEffect(() => {
    setIndexValue(selectedSticker ? String(selectedSticker.order + 1) : "");
  }, [selectedSticker]);

  const commitIndex = () => {
    if (!selectedSticker) return;
    const nextIndex = Number.parseInt(indexValue, 10);
    if (
      Number.isNaN(nextIndex) ||
      nextIndex < 1 ||
      nextIndex > totalStickers ||
      nextIndex === selectedSticker.order + 1
    ) {
      setIndexValue(String(selectedSticker.order + 1));
      return;
    }
    onMoveToIndex(selectedSticker, nextIndex - 1);
  };

  return (
    <Box
      sx={{
        minHeight: 0,
        bgcolor: "oklch(0.91 0.018 255 / 0.012)",
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
          <SingleStickerPreview sticker={selectedSticker} />
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
          <TextField
            size="small"
            label="Index"
            type="number"
            value={indexValue}
            onChange={(event) => setIndexValue(event.target.value)}
            onBlur={commitIndex}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
              if (event.key === "Escape") {
                setIndexValue(String(selectedSticker.order + 1));
                event.currentTarget.blur();
              }
            }}
            slotProps={{
              htmlInput: { min: 1, max: totalStickers, step: 1 },
            }}
            helperText={`1 to ${totalStickers}`}
          />
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
