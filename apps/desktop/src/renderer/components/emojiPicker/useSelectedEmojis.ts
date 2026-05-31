import { useEffect, useState } from "react";
import type { EmojiPickerDialogProps, ToggleEmoji } from "./types";
import { MAX_EMOJI_SELECTION } from "./types";

function toggleEmojiInSelection(current: string[], emoji: string) {
  if (current.includes(emoji)) {
    return current.filter((item) => item !== emoji);
  }

  if (current.length >= MAX_EMOJI_SELECTION) {
    return current;
  }

  return [...current, emoji];
}

export function useSelectedEmojis({
  open,
  initialEmojis,
  onConfirm,
}: Pick<EmojiPickerDialogProps, "open" | "initialEmojis" | "onConfirm">) {
  const [selectedEmojis, setSelectedEmojis] = useState<string[]>(initialEmojis);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;

    setSelectedEmojis(initialEmojis);
    setSubmitting(false);
  }, [initialEmojis, open]);

  const toggleEmoji: ToggleEmoji = (emoji) => {
    setSelectedEmojis((current) => toggleEmojiInSelection(current, emoji));
  };

  const confirmSelection = async () => {
    if (submitting) return;

    setSubmitting(true);

    try {
      await onConfirm(selectedEmojis);
    } finally {
      setSubmitting(false);
    }
  };

  return {
    clearSelection: () => setSelectedEmojis([]),
    confirmSelection,
    selectedEmojis,
    submitting,
    toggleEmoji,
  };
}
