import type { Dispatch, SetStateAction } from "react";

type PendingGRef = { current: boolean };
type PendingGTimeoutRef = { current: number | null };

type StickerSelectionMovement =
  | "left"
  | "right"
  | "up"
  | "down"
  | "rowStart"
  | "rowEnd";

export function getStickerSelectionJumpTargetId({
  event,
  pendingGRef,
  pendingGTimeoutRef,
  visibleStickerIds,
}: {
  event: KeyboardEvent;
  pendingGRef: PendingGRef;
  pendingGTimeoutRef: PendingGTimeoutRef;
  visibleStickerIds: string[];
}) {
  if (event.metaKey || event.ctrlKey || event.altKey) return null;
  if (visibleStickerIds.length === 0) return null;

  if (event.key === "G") {
    clearPendingGShortcut(pendingGRef, pendingGTimeoutRef);
    return visibleStickerIds.at(-1) ?? null;
  }

  if (event.key === "g") {
    if (pendingGRef.current) {
      clearPendingGShortcut(pendingGRef, pendingGTimeoutRef);
      return visibleStickerIds[0] ?? null;
    }

    pendingGRef.current = true;
    pendingGTimeoutRef.current = window.setTimeout(() => {
      pendingGRef.current = false;
      pendingGTimeoutRef.current = null;
    }, 600);
    event.preventDefault();
  }

  return null;
}

export function clearPendingGShortcut(
  pendingGRef: PendingGRef,
  pendingGTimeoutRef: PendingGTimeoutRef,
) {
  pendingGRef.current = false;
  if (pendingGTimeoutRef.current !== null) {
    window.clearTimeout(pendingGTimeoutRef.current);
    pendingGTimeoutRef.current = null;
  }
}

export function isVisualSelectionToggle(event: KeyboardEvent) {
  return (
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    event.key.toLowerCase() === "v"
  );
}

export function isFocusSearchShortcut(event: KeyboardEvent) {
  return !event.metaKey && !event.ctrlKey && !event.altKey && event.key === "/";
}

export function isToggleCurrentSelectionShortcut(event: KeyboardEvent) {
  return !event.metaKey && !event.ctrlKey && !event.altKey && event.key === " ";
}

export function isReorderShortcut(event: KeyboardEvent) {
  return (
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    (event.key === "[" || event.key === "]")
  );
}

export function isEditEmojiShortcut(event: KeyboardEvent) {
  return (
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    (event.key.toLowerCase() === "e" || event.key === "Enter")
  );
}

export function isDeleteShortcut(event: KeyboardEvent) {
  return (
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    ["backspace", "delete", "d"].includes(event.key.toLowerCase())
  );
}

export function getStickerSelectionMovement(
  event: KeyboardEvent,
): StickerSelectionMovement | null {
  if (event.metaKey || event.ctrlKey || event.altKey) return null;

  switch (event.key.toLowerCase()) {
    case "arrowleft":
    case "h":
      return "left";
    case "arrowright":
    case "l":
      return "right";
    case "arrowup":
    case "k":
      return "up";
    case "arrowdown":
    case "j":
      return "down";
    case "0":
    case "home":
      return "rowStart";
    case "$":
    case "end":
      return "rowEnd";
    default:
      return null;
  }
}

export function getNextStickerId({
  movement,
  selectedStickerIds,
  visibleStickerIds,
  visualCursorId,
  columnCount,
}: {
  movement: StickerSelectionMovement;
  selectedStickerIds: string[];
  visibleStickerIds: string[];
  visualCursorId: string | null;
  columnCount: number;
}) {
  if (visibleStickerIds.length === 0) return null;

  const activeStickerId = visualCursorId ?? selectedStickerIds.at(-1);
  const activeIndex = activeStickerId
    ? visibleStickerIds.indexOf(activeStickerId)
    : -1;
  const currentIndex = activeIndex >= 0 ? activeIndex : 0;
  const nextIndex = getNextStickerIndex({
    columnCount: Math.max(1, columnCount),
    currentIndex,
    movement,
    stickerCount: visibleStickerIds.length,
  });

  return visibleStickerIds[nextIndex] ?? null;
}

function getNextStickerIndex({
  columnCount,
  currentIndex,
  movement,
  stickerCount,
}: {
  columnCount: number;
  currentIndex: number;
  movement: StickerSelectionMovement;
  stickerCount: number;
}) {
  if (movement === "rowStart") {
    return Math.floor(currentIndex / columnCount) * columnCount;
  }

  if (movement === "rowEnd") {
    const rowEndIndex =
      Math.floor(currentIndex / columnCount) * columnCount + columnCount - 1;
    return Math.min(stickerCount - 1, rowEndIndex);
  }

  const deltaByMovement = {
    left: -1,
    right: 1,
    up: -columnCount,
    down: columnCount,
  } satisfies Record<
    Exclude<StickerSelectionMovement, "rowStart" | "rowEnd">,
    number
  >;

  return Math.min(
    stickerCount - 1,
    Math.max(0, currentIndex + deltaByMovement[movement]),
  );
}

export function getStickerIdRange(
  anchorId: string,
  stickerId: string,
  visibleStickerIds: string[],
) {
  const anchorIndex = visibleStickerIds.indexOf(anchorId);
  const stickerIndex = visibleStickerIds.indexOf(stickerId);
  if (anchorIndex === -1 || stickerIndex === -1) return [stickerId];

  const [start, end] =
    anchorIndex < stickerIndex
      ? [anchorIndex, stickerIndex]
      : [stickerIndex, anchorIndex];
  return visibleStickerIds.slice(start, end + 1);
}

export function getStickerGalleryGrid() {
  return document.querySelector<HTMLElement>(
    '[data-sticker-gallery-grid="true"]',
  );
}

export function getStickerGalleryColumnCount(grid: HTMLElement) {
  const templateColumns = window.getComputedStyle(grid).gridTemplateColumns;
  const columnCount = templateColumns
    .split(" ")
    .filter((column) => column.trim().length > 0).length;

  return Math.max(1, columnCount);
}

export function scrollStickerIntoGalleryView(stickerId: string) {
  window.requestAnimationFrame(() => {
    const stickerElement = document.querySelector<HTMLElement>(
      `[data-sticker-gallery-item-id="${CSS.escape(stickerId)}"]`,
    );
    stickerElement?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
}

export function focusStickerSearchField() {
  document
    .querySelector<HTMLInputElement>('[data-sticker-search-field="true"] input')
    ?.focus();
}

export function toggleStickerSelection(
  stickerId: string,
  selectedStickerIds: string[],
  setSelectedStickerIds: Dispatch<SetStateAction<string[]>>,
) {
  setSelectedStickerIds(
    selectedStickerIds.includes(stickerId)
      ? selectedStickerIds.filter((selectedId) => selectedId !== stickerId)
      : [...selectedStickerIds, stickerId],
  );
}

export function isSelectAllShortcut(event: KeyboardEvent) {
  return (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a";
}

export function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

export function isOverlayShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      '[role="dialog"], [role="alertdialog"], [role="menu"], .MuiPopover-root, .MuiModal-root',
    ),
  );
}
