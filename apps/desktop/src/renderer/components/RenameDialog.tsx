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
  onConfirm: (value: string) => void;
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

  useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) onConfirm(trimmed);
    else onClose();
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
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button size="small" onClick={onClose}>
            {appTokens.copy.actions.cancel}
          </Button>
          <Button
            size="small"
            type="submit"
            variant="contained"
            disabled={!value.trim()}
          >
            {appTokens.copy.actions.confirm}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
