import { memo, useMemo } from "react";
import type { DragEvent, MouseEvent } from "react";
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

type StickerBrowserCardProps = {
  sticker: StickerItem;
  iconStickerId: string | null;
  selected: boolean;
  selectOnly: (stickerId: string) => void;
  onStickerClick: (
    event: MouseEvent<HTMLDivElement>,
    sticker: StickerItem,
  ) => void;
  onContextMenu: (event: MouseEvent, sticker: StickerItem) => void;
  draggingStickerId: string | null;
  dragOverStickerId: string | null;
  canReorder: boolean;
  onDragStart: (event: DragEvent<HTMLDivElement>, sticker: StickerItem) => void;
  onDragEnd: () => void;
  onDragOverSticker: (
    event: DragEvent<HTMLDivElement>,
    sticker: StickerItem,
  ) => void;
  onDropSticker: (
    event: DragEvent<HTMLDivElement>,
    sticker: StickerItem,
  ) => void;
  setEmojiEditStickerIds: (stickerIds: string[]) => void;
};

const StickerBrowserCard = memo(function StickerBrowserCard({
  sticker,
  iconStickerId,
  selected,
  selectOnly,
  onStickerClick,
  onContextMenu,
  draggingStickerId,
  dragOverStickerId,
  canReorder,
  onDragStart,
  onDragEnd,
  onDragOverSticker,
  onDropSticker,
  setEmojiEditStickerIds,
}: StickerBrowserCardProps) {
  return (
    <BrowserGalleryCard
      title={buildStickerTitle(sticker)}
      label={null}
      overlay={buildStickerOverlay(sticker)}
      isPinned={sticker.id === iconStickerId}
      selected={selected}
      draggable={canReorder}
      isDragOver={
        dragOverStickerId === sticker.id && draggingStickerId !== sticker.id
      }
      onDragStart={(event) => onDragStart(event, sticker)}
      onDragEnd={onDragEnd}
      onDragOver={(event) => onDragOverSticker(event, sticker)}
      onDrop={(event) => onDropSticker(event, sticker)}
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
      metadata={buildStickerMetadata(sticker, (event) => {
        event.stopPropagation();
        selectOnly(sticker.id);
        setEmojiEditStickerIds([sticker.id]);
      })}
    />
  );
});

export function StickerBrowser({
  stickers,
  iconStickerId,
  selectedStickerIds,
  selectOnly,
  onStickerClick,
  onContextMenu,
  draggingStickerId,
  dragOverStickerId,
  canReorder,
  onDragStart,
  onDragEnd,
  onDragOverSticker,
  onDropSticker,
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
  draggingStickerId: string | null;
  dragOverStickerId: string | null;
  canReorder: boolean;
  onDragStart: (event: DragEvent<HTMLDivElement>, sticker: StickerItem) => void;
  onDragEnd: () => void;
  onDragOverSticker: (
    event: DragEvent<HTMLDivElement>,
    sticker: StickerItem,
  ) => void;
  onDropSticker: (
    event: DragEvent<HTMLDivElement>,
    sticker: StickerItem,
  ) => void;
  setEmojiEditStickerIds: (stickerIds: string[]) => void;
}) {
  const selectedStickerIdSet = useMemo(
    () => new Set(selectedStickerIds),
    [selectedStickerIds],
  );

  return (
    <Box sx={{ minHeight: 0, overflowY: "auto", p: 0.75 }}>
      {stickers.length === 0 ? (
        <Box
          sx={{
            width: "100%",
            minHeight: "100%",
            px: { xs: 2.5, md: 6 },
            py: 6,
            color: "text.secondary",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
          }}
        >
          <Typography
            variant="body2"
            color="text.primary"
            fontWeight={appTokens.typography.fontWeights.medium}
            sx={{ fontSize: appTokens.typography.fontSizes.bodyDefault }}
          >
            {appTokens.copy.emptyStates.noStickers}
          </Typography>
          <Typography
            variant="caption"
            sx={{
              display: "block",
              mt: 0.5,
              maxWidth: 720,
              fontSize: appTokens.typography.fontSizes.caption,
            }}
          >
            Add files or a folder from the pack header.
          </Typography>
        </Box>
      ) : (
        <Box data-sticker-gallery-grid="true" sx={contentsGridContainerSx}>
          {stickers.map((sticker) => (
            <Box key={sticker.id} data-sticker-gallery-item-id={sticker.id}>
              <StickerBrowserCard
                sticker={sticker}
                iconStickerId={iconStickerId}
                selected={selectedStickerIdSet.has(sticker.id)}
                selectOnly={selectOnly}
                onStickerClick={onStickerClick}
                onContextMenu={onContextMenu}
                draggingStickerId={draggingStickerId}
                dragOverStickerId={dragOverStickerId}
                canReorder={canReorder}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onDragOverSticker={onDragOverSticker}
                onDropSticker={onDropSticker}
                setEmojiEditStickerIds={setEmojiEditStickerIds}
              />
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
