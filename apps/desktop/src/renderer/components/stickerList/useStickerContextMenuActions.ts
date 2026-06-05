import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { StickerItem } from "@sticker-smith/shared";

export type StickerContextMenuActionsInput = {
  contextStickers: StickerItem[];
  onClose: () => void;
  onDeleteStickers: (stickerIds: string[]) => void;
  setEmojiEditStickerIds: Dispatch<SetStateAction<string[] | null>>;
};

export function useStickerContextMenuActions({
  contextStickers,
  onClose,
  onDeleteStickers,
  setEmojiEditStickerIds,
}: StickerContextMenuActionsInput) {
  const stickerIds = contextStickers.map((sticker) => sticker.id);

  const editEmojis = useCallback(() => {
    setEmojiEditStickerIds(stickerIds);
    onClose();
  }, [onClose, setEmojiEditStickerIds, stickerIds]);

  const deleteStickers = useCallback(() => {
    if (stickerIds.length === 0) return;
    onClose();
    onDeleteStickers(stickerIds);
  }, [onClose, onDeleteStickers, stickerIds]);

  return {
    stickerIds,
    editEmojis,
    deleteStickers,
  };
}
