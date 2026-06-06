import { lazy, Suspense } from "react";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import { appTokens } from "../../theme/appTokens";
import { EmojiPickerDialogActions } from "./emojiPicker/EmojiPickerDialogActions";
import { EmojiPickerDialogGlobalStyles } from "./emojiPicker/emojiPickerStyles";
import type { EmojiPickerDialogProps } from "./emojiPicker/types";
import { useSelectedEmojis } from "./emojiPicker/useSelectedEmojis";

const EmojiPickerDialogBody = lazy(() =>
  import("./emojiPicker/EmojiPickerDialogBody").then((module) => ({
    default: module.EmojiPickerDialogBody,
  })),
);

function EmojiPickerDialogBodyFallback() {
  return (
    <DialogContent sx={{ pt: "8px !important" }}>
      <Stack spacing={1.5}>
        <Skeleton variant="rounded" width={160} height={24} />
        <Skeleton variant="text" width={220} height={18} />
        <Skeleton variant="rounded" width="100%" height={360} />
      </Stack>
    </DialogContent>
  );
}

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
        <Suspense fallback={<EmojiPickerDialogBodyFallback />}>
          <EmojiPickerDialogBody
            selectedEmojis={selectedEmojis}
            toggleEmoji={toggleEmoji}
          />
        </Suspense>
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
