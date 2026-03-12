import { useState, useEffect } from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";
import { appTokens } from "../../theme/appTokens";

interface Props {
  open: boolean;
  title: string;
  label?: string;
  initialValue: string;
  onConfirm: (value: string) => void | Promise<unknown>;
  onClose: () => void;
}

export function RenameDialog({
  open,
  title,
  label,
  initialValue,
  onConfirm,
  onClose,
}: Props) {
  const [value, setValue] = useState(initialValue);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      setSubmitting(false);
      setErrorMessage(null);
    }
  }, [open, initialValue]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      onClose();
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      await onConfirm(trimmed);
    } catch (error) {
      setErrorMessage((error as Error)?.message ?? "Unable to save changes.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle
          sx={{
            fontSize: appTokens.typography.fontSizes.dialogTitle,
            fontWeight: appTokens.typography.fontWeights.medium,
            pb: 1,
          }}
        >
          {title}
        </DialogTitle>
        <DialogContent sx={{ pt: "8px !important" }}>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label={label}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (errorMessage) {
                setErrorMessage(null);
              }
            }}
            error={Boolean(errorMessage)}
            helperText={errorMessage ?? " "}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button size="small" onClick={onClose} disabled={submitting}>
            {appTokens.copy.actions.cancel}
          </Button>
          <Button
            size="small"
            type="submit"
            variant="contained"
            disabled={!value.trim() || submitting}
          >
            {appTokens.copy.actions.confirm}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
