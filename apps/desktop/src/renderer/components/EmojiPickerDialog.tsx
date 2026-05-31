import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import { appTokens } from "../../theme/appTokens";
import { EmojiPickerDialogActions } from "./emojiPicker/EmojiPickerDialogActions";
import { EmojiPickerDialogBody } from "./emojiPicker/EmojiPickerDialogBody";
import { EmojiPickerDialogGlobalStyles } from "./emojiPicker/emojiPickerStyles";
import type { EmojiPickerDialogProps } from "./emojiPicker/types";
import { useSelectedEmojis } from "./emojiPicker/useSelectedEmojis";

export function EmojiPickerDialog({
  open,
  title,
  initialEmojis,
  onConfirm,
  onClose,
}: EmojiPickerDialogProps) {
  const {
    clearSelection,
    confirmSelection,
    selectedEmojis,
    submitting,
    toggleEmoji,
  } = useSelectedEmojis({ initialEmojis, onConfirm, open });

  return (
    <>
      <EmojiPickerDialogGlobalStyles />
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle
          sx={{
            fontSize: appTokens.typography.fontSizes.dialogTitle,
            fontWeight: appTokens.typography.fontWeights.medium,
            pb: 1,
          }}
        >
          {title}
        </DialogTitle>
        <EmojiPickerDialogBody
          selectedEmojis={selectedEmojis}
          toggleEmoji={toggleEmoji}
        />
        <EmojiPickerDialogActions
          canClear={selectedEmojis.length > 0}
          clearSelection={clearSelection}
          confirmSelection={confirmSelection}
          onClose={onClose}
          submitting={submitting}
        />
      </Dialog>
    </>
  );
}
