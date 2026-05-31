export const MAX_EMOJI_SELECTION = 20;

export interface EmojiPickerDialogProps {
  open: boolean;
  title: string;
  initialEmojis: string[];
  onConfirm: (emojis: string[]) => void | Promise<unknown>;
  onClose: () => void;
}

export type ToggleEmoji = (emoji: string) => void;
