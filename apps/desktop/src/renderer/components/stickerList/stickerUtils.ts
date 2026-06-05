import { hashEmojiList, type StickerItem } from "@sticker-smith/shared";
import { formatCountLabel } from "../browserStyles";
import { sortItemsWithPinnedFirst } from "../fileBrowser";
import { formatOrderLabel } from "../browserItemUtils";
import type {
  FilterCounts,
  StickerContextMenuState,
  StickerFilter,
  StickerSort,
} from "./types";

export function sortStickers(
  stickers: StickerItem[],
  iconStickerId: string | null,
) {
  return sortItemsWithPinnedFirst(stickers, {
    getOrder: (sticker) => sticker.order,
    isPinned: (sticker) => sticker.id === iconStickerId,
  });
}

export function filterAndSortStickers(
  stickers: StickerItem[],
  filter: StickerFilter,
  query: string,
  sort: StickerSort,
) {
  const normalizedQuery = query.trim().toLowerCase();
  return stickers
    .filter((sticker) => matchesFilter(sticker, filter))
    .filter(
      (sticker) =>
        !normalizedQuery ||
        [
          formatOrderLabel(sticker.order),
          sticker.relativePath,
          sticker.originalFileName,
          sticker.emojiList.join(" "),
        ]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(normalizedQuery)),
    )
    .sort((left, right) => compareStickers(left, right, sort));
}

function compareStickers(
  left: StickerItem,
  right: StickerItem,
  sort: StickerSort,
) {
  switch (sort) {
    case "emoji":
      return (
        left.emojiList.join(" ").localeCompare(right.emojiList.join(" ")) ||
        left.order - right.order
      );
    case "size":
      return right.sizeBytes - left.sizeBytes || left.order - right.order;
    default:
      return left.order - right.order;
  }
}

export function matchesFilter(sticker: StickerItem, filter: StickerFilter) {
  switch (filter) {
    case "draft":
      return isDraft(sticker);
    case "ready":
      return getStickerStatus(sticker) === "ready";
    case "synced":
      return getStickerStatus(sticker) === "synced";
    case "modified":
      return getStickerStatus(sticker) === "modified";
    case "failed":
      return isFailed(sticker);
    default:
      return true;
  }
}

export function summarizeFilterCounts(stickers: StickerItem[]): FilterCounts {
  return stickers.reduce<FilterCounts>(
    (summary, sticker) => {
      summary.all += 1;
      if (isDraft(sticker)) summary.draft += 1;
      if (getStickerStatus(sticker) === "ready") summary.ready += 1;
      if (getStickerStatus(sticker) === "synced") summary.synced += 1;
      if (getStickerStatus(sticker) === "modified") summary.modified += 1;
      if (isFailed(sticker)) summary.failed += 1;
      return summary;
    },
    { all: 0, draft: 0, ready: 0, synced: 0, modified: 0, failed: 0 },
  );
}

export function formatResultCountLabel(
  visibleCount: number,
  totalCount: number,
  filter: StickerFilter,
  query: string,
) {
  return filter === "all" && query.trim().length === 0
    ? formatCountLabel(totalCount, "sticker")
    : `${visibleCount} of ${formatCountLabel(totalCount, "sticker")}`;
}

export type StickerStatus = "draft" | "ready" | "synced" | "modified" | "failed";

export function getStickerStatus(sticker: StickerItem): StickerStatus {
  if (isFailed(sticker)) return "failed";
  if (isDraft(sticker)) return "draft";
  if (isModified(sticker)) return "modified";
  if (isSynced(sticker)) return "synced";
  return "ready";
}


export function summarizeStickerStatuses(stickers: StickerItem[]) {
  return stickers.reduce(
    (summary, sticker) => {
      summary[getStickerStatus(sticker)] += 1;
      return summary;
    },
    { draft: 0, ready: 0, synced: 0, modified: 0, failed: 0 },
  );
}

export function isReady(sticker: StickerItem) {
  return getStickerStatus(sticker) === "ready";
}

export function isFailed(sticker: StickerItem) {
  return sticker.downloadState === "failed";
}

export function isDraft(sticker: StickerItem) {
  return !isFailed(sticker) && (!sticker.absolutePath || sticker.emojiList.length === 0);
}

function getBaselineEmojiHash(sticker: StickerItem) {
  return sticker.telegram?.baselineEmojiHash ?? hashEmojiList(sticker.emojiList);
}

function isModified(sticker: StickerItem) {
  if (!sticker.telegram) return false;
  return (
    sticker.sha256 !== sticker.telegram.baselineStickerHash ||
    hashEmojiList(sticker.emojiList) !== getBaselineEmojiHash(sticker) ||
    sticker.order !== sticker.telegram.position
  );
}

function isSynced(sticker: StickerItem) {
  if (!sticker.telegram) return false;
  return (
    sticker.sha256 === sticker.telegram.baselineStickerHash &&
    hashEmojiList(sticker.emojiList) === getBaselineEmojiHash(sticker) &&
    sticker.order === sticker.telegram.position
  );
}

export function getContextStickers(
  contextMenu: StickerContextMenuState,
  stickerById: ReadonlyMap<string, StickerItem>,
) {
  return (contextMenu?.stickerIds ?? [])
    .map((stickerId) => stickerById.get(stickerId))
    .filter((sticker): sticker is StickerItem => sticker !== undefined);
}

export function initialEmojiSelection(
  stickerIds: string[],
  stickerById: ReadonlyMap<string, StickerItem>,
) {
  const current = stickerIds
    .map((id) => stickerById.get(id))
    .filter((sticker): sticker is StickerItem => sticker !== undefined);
  if (current.length === 0) return [];
  const [first, ...rest] = current;
  const firstValue = first.emojiList.join(" ");
  return rest.every((sticker) => sticker.emojiList.join(" ") === firstValue)
    ? [...first.emojiList]
    : [];
}
