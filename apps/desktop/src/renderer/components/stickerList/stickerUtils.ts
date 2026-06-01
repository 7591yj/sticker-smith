import type { StickerItem } from "@sticker-smith/shared";
import { appTokens } from "../../../theme/appTokens";
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
    case "attention":
      return needsAttention(sticker);
    case "ready":
      return isReady(sticker);
    case "failed":
      return isFailed(sticker);
    case "telegram":
      return Boolean(sticker.telegram);
    default:
      return true;
  }
}

export function summarizeFilterCounts(stickers: StickerItem[]): FilterCounts {
  return stickers.reduce<FilterCounts>(
    (summary, sticker) => {
      summary.all += 1;
      if (needsAttention(sticker)) summary.attention += 1;
      if (isReady(sticker)) summary.ready += 1;
      if (isFailed(sticker)) summary.failed += 1;
      if (sticker.telegram) summary.telegram += 1;
      return summary;
    },
    { all: 0, attention: 0, ready: 0, failed: 0, telegram: 0 },
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

export function getStickerStatus(sticker: StickerItem): {
  label: string;
  color: "success" | "warning" | "error";
} {
  if (isFailed(sticker))
    return { label: appTokens.copy.labels.stickerStatusFailed, color: "error" };
  if (needsAttention(sticker))
    return {
      label: appTokens.copy.labels.stickerStatusAttention,
      color: "warning",
    };
  return { label: appTokens.copy.labels.stickerStatusReady, color: "success" };
}

export function summarizeStickerStatuses(stickers: StickerItem[]) {
  return stickers.reduce(
    (summary, sticker) => {
      if (isFailed(sticker)) summary.failed += 1;
      else if (needsAttention(sticker)) summary.attention += 1;
      else summary.ready += 1;
      return summary;
    },
    { ready: 0, attention: 0, failed: 0 },
  );
}

export function isReady(sticker: StickerItem) {
  return (
    Boolean(sticker.absolutePath) &&
    sticker.emojiList.length > 0 &&
    !isFailed(sticker)
  );
}

export function needsAttention(sticker: StickerItem) {
  return (
    !isFailed(sticker) &&
    (!sticker.absolutePath || sticker.emojiList.length === 0)
  );
}

export function isFailed(sticker: StickerItem) {
  return sticker.downloadState === "failed";
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
