import InsertEmoticonIcon from "@mui/icons-material/InsertEmoticon";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import type { StickerItem } from "@sticker-smith/shared";
import { appTokens } from "../../../theme/appTokens";
import { formatOrderLabel } from "../browserItemUtils";
import { InspectorRows } from "./StickerInspectorRows";
import {
  MultiStickerPreview,
  SingleStickerPreview,
} from "./StickerInspectorPreview";

export function StickerInspector({
  selectedStickers,
  onEditEmoji,
}: {
  selectedStickers: StickerItem[];
  onEditEmoji: () => void;
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
          <Button
            size="small"
            variant="outlined"
            startIcon={
              <InsertEmoticonIcon
                sx={{ fontSize: appTokens.sizes.icon.compactAction }}
              />
            }
            onClick={onEditEmoji}
            sx={{ textTransform: "none" }}
          >
            {appTokens.copy.actions.editEmojis}
          </Button>
        </>
      ) : selectedStickers.length > 1 ? (
        <Button
          size="small"
          variant="outlined"
          onClick={onEditEmoji}
          sx={{ textTransform: "none" }}
        >
          {appTokens.copy.dialogs.editSelectedEmojis}
        </Button>
      ) : null}
    </Box>
  );
}
