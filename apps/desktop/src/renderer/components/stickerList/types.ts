import type { Dispatch, MouseEvent, SetStateAction } from "react";
import type { StickerItem } from "@sticker-smith/shared";

export type StickerContextMenuState = {
  mouseX: number;
  mouseY: number;
  stickerIds: string[];
} | null;

export type StickerFilter =
  | "all"
  | "draft"
  | "ready"
  | "modified"
  | "failed"
  | "telegram";
export type StickerSort = "index" | "emoji" | "size";
export type FilterCounts = Record<StickerFilter, number>;

export interface StickerSelectionState {
  selectedStickerIds: string[];
  selectionAnchorId: string | null;
  setSelectedStickerIds: Dispatch<SetStateAction<string[]>>;
  setSelectionAnchorId: Dispatch<SetStateAction<string | null>>;
  selectOnly: (stickerId: string) => void;
  handleStickerClick: (
    event: MouseEvent<HTMLDivElement>,
    sticker: StickerItem,
  ) => void;
}

export interface StickerDataState {
  sortedStickers: StickerItem[];
  stickerById: ReadonlyMap<string, StickerItem>;
  stickerIds: string[];
}
