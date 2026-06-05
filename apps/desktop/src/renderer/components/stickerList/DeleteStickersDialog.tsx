import { useState } from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import { appTokens } from "../../../theme/appTokens";
import { formatCountLabel } from "../browserStyles";

export function DeleteStickersDialog({
  stickerIds,
  onClose,
  onConfirm,
}: {
  stickerIds: string[] | null;
  onClose: () => void;
  onConfirm: (stickerIds: string[]) => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const count = stickerIds?.length ?? 0;

  const handleConfirm = async () => {
    if (!stickerIds?.length) return;
    setSubmitting(true);
    try {
      await onConfirm(stickerIds);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={Boolean(stickerIds)} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle
        sx={{
          fontSize: appTokens.typography.fontSizes.dialogTitle,
          fontWeight: appTokens.typography.fontWeights.medium,
          pb: 1,
        }}
      >
        Delete {formatCountLabel(count, "sticker")}?
      </DialogTitle>
      <DialogContent sx={{ pt: "8px !important" }}>
        <DialogContentText>
          This removes the selected sticker file from the pack.
        </DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button size="small" onClick={onClose} disabled={submitting}>
          {appTokens.copy.actions.cancel}
        </Button>
        <Button
          size="small"
          variant="contained"
          color="error"
          onClick={handleConfirm}
          disabled={count === 0 || submitting}
        >
          {appTokens.copy.actions.delete}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
