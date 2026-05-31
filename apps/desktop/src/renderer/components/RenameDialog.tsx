import { useState, useEffect } from "react";
import type { ChangeEvent, FormEvent, KeyboardEvent } from "react";
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

interface RenameDialogState {
  value: string;
  submitting: boolean;
  errorMessage: string | null;
  handleChange: (event: ChangeEvent<HTMLInputElement>) => void;
  handleSubmit: (event: FormEvent) => Promise<void>;
}

interface RenameDialogFieldsProps {
  label?: string;
  onClose: () => void;
  state: RenameDialogState;
}

interface RenameDialogActionsProps {
  submitting: boolean;
  value: string;
  onClose: () => void;
}

function useRenameDialogState({
  open,
  initialValue,
  onConfirm,
  onClose,
}: Pick<Props, "open" | "initialValue" | "onConfirm" | "onClose">): RenameDialogState {
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

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setValue(event.target.value);
    if (errorMessage) setErrorMessage(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
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

  return { value, submitting, errorMessage, handleChange, handleSubmit };
}

function RenameDialogFields({ label, onClose, state }: RenameDialogFieldsProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") onClose();
  };

  return (
    <DialogContent sx={{ pt: "8px !important" }}>
      <TextField
        autoFocus
        fullWidth
        size="small"
        label={label}
        value={state.value}
        onChange={state.handleChange}
        error={Boolean(state.errorMessage)}
        helperText={state.errorMessage ?? " "}
        onKeyDown={handleKeyDown}
      />
    </DialogContent>
  );
}

function RenameDialogActions({ submitting, value, onClose }: RenameDialogActionsProps) {
  return (
    <DialogActions sx={{ px: 3, pb: 2 }}>
      <Button size="small" onClick={onClose} disabled={submitting}>
        {appTokens.copy.actions.cancel}
      </Button>
      <Button size="small" type="submit" variant="contained" disabled={!value.trim() || submitting}>
        {appTokens.copy.actions.confirm}
      </Button>
    </DialogActions>
  );
}

export function RenameDialog(props: Props) {
  const { open, title, label, onClose } = props;
  const state = useRenameDialogState(props);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <form onSubmit={state.handleSubmit}>
        <DialogTitle
          sx={{
            fontSize: appTokens.typography.fontSizes.dialogTitle,
            fontWeight: appTokens.typography.fontWeights.medium,
            pb: 1,
          }}
        >
          {title}
        </DialogTitle>
        <RenameDialogFields label={label} onClose={onClose} state={state} />
        <RenameDialogActions submitting={state.submitting} value={state.value} onClose={onClose} />
      </form>
    </Dialog>
  );
}
