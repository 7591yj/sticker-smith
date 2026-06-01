import type { Dispatch, MouseEvent, SetStateAction } from "react";
import type { StickerItem } from "@sticker-smith/shared";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { appTokens } from "../../../theme/appTokens";
import { browserGridContainerSx } from "../browserStyles";
import { BrowserGalleryCard, FilePreview } from "../fileBrowser";
import {
  buildStickerMetadata,
  buildStickerOverlay,
  buildStickerTitle,
} from "../browserItemUtils";

const contentsGridContainerSx = {
  ...browserGridContainerSx,
  px: 0,
  gap: 0.6,
  gridTemplateColumns: {
    xs: "repeat(auto-fill, minmax(88px, 1fr))",
    xl: "repeat(7, minmax(0, 1fr))",
  },
} as const;

export function StickerBrowser({
  stickers,
  iconStickerId,
  selectedStickerIds,
  selectOnly,
  onStickerClick,
  onContextMenu,
  setEmojiEditStickerIds,
}: {
  stickers: StickerItem[];
  iconStickerId: string | null;
  selectedStickerIds: string[];
  selectOnly: (stickerId: string) => void;
  onStickerClick: (
    event: MouseEvent<HTMLDivElement>,
    sticker: StickerItem,
  ) => void;
  onContextMenu: (event: MouseEvent, sticker: StickerItem) => void;
  setEmojiEditStickerIds: Dispatch<SetStateAction<string[] | null>>;
}) {
  return (
    <Box sx={{ minHeight: 0, overflowY: "auto", p: 0.75 }}>
      {stickers.length === 0 ? (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            px: 2.5,
            py: 3,
            fontSize: appTokens.typography.fontSizes.bodyDefault,
          }}
        >
          {appTokens.copy.emptyStates.noStickers}
        </Typography>
      ) : (
        <Box sx={contentsGridContainerSx}>
          {stickers.map((sticker) => (
            <BrowserGalleryCard
              key={sticker.id}
              title={buildStickerTitle(sticker)}
              label={null}
              overlay={buildStickerOverlay(sticker)}
              isPinned={sticker.id === iconStickerId}
              selected={selectedStickerIds.includes(sticker.id)}
              onClick={(event) => onStickerClick(event, sticker)}
              onDoubleClick={() => {
                selectOnly(sticker.id);
                setEmojiEditStickerIds([sticker.id]);
              }}
              onContextMenu={(event) => onContextMenu(event, sticker)}
              preview={
                <FilePreview
                  absolutePath={sticker.absolutePath}
                  relativePath={sticker.relativePath}
                />
              }
              metadata={buildStickerMetadata(sticker)}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}
