import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";

type StickerKeyboardShortcutsOptions = {
  selectedStickerIds: string[];
  visibleStickerIds: string[];
  setSelectedStickerIds: Dispatch<SetStateAction<string[]>>;
  setSelectionAnchorId: Dispatch<SetStateAction<string | null>>;
};

export function useStickerKeyboardShortcuts({
  selectedStickerIds,
  visibleStickerIds,
  setSelectedStickerIds,
  setSelectionAnchorId,
}: StickerKeyboardShortcutsOptions) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableShortcutTarget(event.target)) return;

      // ^A
      if (isSelectAllShortcut(event)) {
        event.preventDefault();
        setSelectedStickerIds(visibleStickerIds);
        setSelectionAnchorId(visibleStickerIds[0] ?? null);
        return;
      }

      if (event.key === "Escape" && selectedStickerIds.length > 0) {
        event.preventDefault();
        setSelectedStickerIds([]);
        setSelectionAnchorId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    selectedStickerIds.length,
    setSelectedStickerIds,
    setSelectionAnchorId,
    visibleStickerIds,
  ]);
}

function isSelectAllShortcut(event: KeyboardEvent) {
  return (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a";
}

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}
