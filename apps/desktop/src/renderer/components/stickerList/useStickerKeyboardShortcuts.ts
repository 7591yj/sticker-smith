import { useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";

import {
  clearPendingGShortcut,
  focusStickerSearchField,
  getNextStickerId,
  getStickerGalleryColumnCount,
  getStickerGalleryGrid,
  getStickerIdRange,
  getStickerSelectionJumpTargetId,
  getStickerSelectionMovement,
  isDeleteShortcut,
  isEditableShortcutTarget,
  isEditEmojiShortcut,
  isFocusSearchShortcut,
  isOverlayShortcutTarget,
  isReorderShortcut,
  isSelectAllShortcut,
  isToggleCurrentSelectionShortcut,
  isVisualSelectionToggle,
  scrollStickerIntoGalleryView,
  toggleStickerSelection,
} from "./stickerKeyboardShortcutHelpers";

type StickerKeyboardShortcutsOptions = {
  selectedStickerIds: string[];
  visibleStickerIds: string[];
  setSelectedStickerIds: Dispatch<SetStateAction<string[]>>;
  setSelectionAnchorId: Dispatch<SetStateAction<string | null>>;
  onAppendEmojis: (stickerIds: string[]) => void;
  onDeleteStickers: (stickerIds: string[]) => void;
  onMoveSelectedStickers: (direction: -1 | 1) => void;
};

export function useStickerKeyboardShortcuts({
  selectedStickerIds,
  visibleStickerIds,
  setSelectedStickerIds,
  setSelectionAnchorId,
  onAppendEmojis,
  onDeleteStickers,
  onMoveSelectedStickers,
}: StickerKeyboardShortcutsOptions) {
  const pendingGTimeoutRef = useRef<number | null>(null);
  const pendingGRef = useRef(false);
  const visualAnchorIdRef = useRef<string | null>(null);
  const visualCursorIdRef = useRef<string | null>(null);
  const galleryColumnCountRef = useRef(1);

  useEffect(() => {
    const grid = getStickerGalleryGrid();
    if (!grid) return;

    const updateColumnCount = () => {
      galleryColumnCountRef.current = getStickerGalleryColumnCount(grid);
    };

    updateColumnCount();
    const resizeObserver = new ResizeObserver(updateColumnCount);
    resizeObserver.observe(grid);
    return () => resizeObserver.disconnect();
  }, [visibleStickerIds.length]);

  useEffect(() => {
    const clearPendingG = () => {
      clearPendingGShortcut(pendingGRef, pendingGTimeoutRef);
    };

    const exitVisualSelection = () => {
      visualAnchorIdRef.current = null;
      visualCursorIdRef.current = null;
    };

    const selectSticker = (stickerId: string) => {
      setSelectedStickerIds([stickerId]);
      setSelectionAnchorId(stickerId);
      visualCursorIdRef.current = stickerId;
      scrollStickerIntoGalleryView(stickerId);
    };

    const selectVisualRange = (stickerId: string) => {
      const anchorId =
        visualAnchorIdRef.current ?? selectedStickerIds.at(-1) ?? stickerId;
      visualAnchorIdRef.current = anchorId;
      visualCursorIdRef.current = stickerId;
      setSelectedStickerIds(
        getStickerIdRange(anchorId, stickerId, visibleStickerIds),
      );
      setSelectionAnchorId(anchorId);
      scrollStickerIntoGalleryView(stickerId);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        isEditableShortcutTarget(event.target) ||
        isOverlayShortcutTarget(event.target)
      )
        return;

      // ^A
      if (isSelectAllShortcut(event)) {
        event.preventDefault();
        setSelectedStickerIds(visibleStickerIds);
        setSelectionAnchorId(visibleStickerIds[0] ?? null);
        return;
      }

      if (isVisualSelectionToggle(event)) {
        event.preventDefault();
        clearPendingG();
        if (visualAnchorIdRef.current !== null) {
          exitVisualSelection();
          return;
        }

        const anchorId =
          selectedStickerIds.at(-1) ?? visibleStickerIds[0] ?? null;
        if (anchorId) {
          visualAnchorIdRef.current = anchorId;
          visualCursorIdRef.current = anchorId;
          selectSticker(anchorId);
        }
        return;
      }

      if (isFocusSearchShortcut(event)) {
        event.preventDefault();
        clearPendingG();
        focusStickerSearchField();
        return;
      }

      if (isToggleCurrentSelectionShortcut(event)) {
        const currentStickerId =
          visualCursorIdRef.current ??
          selectedStickerIds.at(-1) ??
          visibleStickerIds[0];
        if (currentStickerId) {
          event.preventDefault();
          clearPendingG();
          exitVisualSelection();
          toggleStickerSelection(
            currentStickerId,
            selectedStickerIds,
            setSelectedStickerIds,
          );
          setSelectionAnchorId(currentStickerId);
        }
        return;
      }

      if (isReorderShortcut(event)) {
        event.preventDefault();
        clearPendingG();
        exitVisualSelection();
        onMoveSelectedStickers(event.key === "[" ? -1 : 1);
        return;
      }

      if (isEditEmojiShortcut(event) && selectedStickerIds.length > 0) {
        event.preventDefault();
        clearPendingG();
        onAppendEmojis(selectedStickerIds);
        return;
      }

      if (isDeleteShortcut(event) && selectedStickerIds.length > 0) {
        event.preventDefault();
        clearPendingG();
        exitVisualSelection();
        onDeleteStickers(selectedStickerIds);
        return;
      }

      const jumpTargetId = getStickerSelectionJumpTargetId({
        event,
        pendingGRef,
        pendingGTimeoutRef,
        visibleStickerIds,
      });
      if (jumpTargetId !== null) {
        event.preventDefault();
        if (visualAnchorIdRef.current !== null) {
          selectVisualRange(jumpTargetId);
        } else {
          selectSticker(jumpTargetId);
        }
        return;
      }

      const movement = getStickerSelectionMovement(event);
      if (movement !== null) {
        const nextStickerId = getNextStickerId({
          movement,
          selectedStickerIds,
          visibleStickerIds,
          visualCursorId: visualCursorIdRef.current,
          columnCount: galleryColumnCountRef.current,
        });
        if (nextStickerId) {
          event.preventDefault();
          clearPendingG();
          if (visualAnchorIdRef.current !== null) {
            selectVisualRange(nextStickerId);
          } else {
            exitVisualSelection();
            selectSticker(nextStickerId);
          }
        }
        return;
      }

      if (event.key === "Escape" && selectedStickerIds.length > 0) {
        event.preventDefault();
        exitVisualSelection();
        setSelectedStickerIds([]);
        setSelectionAnchorId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      clearPendingG();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    selectedStickerIds,
    onAppendEmojis,
    onDeleteStickers,
    onMoveSelectedStickers,
    setSelectedStickerIds,
    setSelectionAnchorId,
    visibleStickerIds,
  ]);
}
