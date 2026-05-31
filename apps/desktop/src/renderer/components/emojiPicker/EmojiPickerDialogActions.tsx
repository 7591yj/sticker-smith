import Button from "@mui/material/Button";
import DialogActions from "@mui/material/DialogActions";
import { appTokens } from "../../../theme/appTokens";

export function EmojiPickerDialogActions({
  canClear,
  clearSelection,
  confirmSelection,
  onClose,
  submitting,
}: {
  canClear: boolean;
  clearSelection: () => void;
  confirmSelection: () => Promise<void>;
  onClose: () => void;
  submitting: boolean;
}) {
  return (
    <DialogActions sx={{ px: 3, pb: 2 }}>
      <Button size="small" onClick={onClose} disabled={submitting}>
        {appTokens.copy.actions.cancel}
      </Button>
      <Button
        size="small"
        onClick={clearSelection}
        disabled={submitting || !canClear}
      >
        {appTokens.copy.actions.clear}
      </Button>
      <Button
        size="small"
        variant="contained"
        onClick={() => void confirmSelection()}
        disabled={submitting}
      >
        {appTokens.copy.actions.apply}
      </Button>
    </DialogActions>
  );
}
