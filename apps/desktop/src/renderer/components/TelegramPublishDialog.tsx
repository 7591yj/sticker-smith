import { useEffect, useState } from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { appTokens } from "../../theme/appTokens";

interface Props {
  open: boolean;
  initialTitle: string;
  initialShortName: string;
  onClose: () => void;
  onConfirm: (input: { title: string; shortName: string }) => Promise<unknown>;
}

export function TelegramPublishDialog({
  open,
  initialTitle,
  initialShortName,
  onClose,
  onConfirm,
}: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [shortName, setShortName] = useState(initialShortName);

  useEffect(() => {
    if (!open) {
      return;
    }

    setTitle(initialTitle);
    setShortName(initialShortName);
  }, [initialShortName, initialTitle, open]);

  const canSubmit =
    title.trim().length > 0 &&
    /^[A-Za-z][A-Za-z0-9_]{4,63}$/.test(shortName.trim());

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSubmit) {
            return;
          }
          void onConfirm({
            title: title.trim(),
            shortName: shortName.trim(),
          });
        }}
      >
        <DialogTitle>{appTokens.copy.dialogs.telegramPublish}</DialogTitle>
        <DialogContent sx={{ pt: "8px !important" }}>
          <Stack spacing={1.5}>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ fontSize: appTokens.typography.fontSizes.bodyDefault }}
            >
              Telegram creates a separate mirror pack. The local pack stays in the Local section.
            </Typography>
            <TextField
              autoFocus
              size="small"
              label={appTokens.copy.labels.telegramTitle}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <TextField
              size="small"
              label={appTokens.copy.labels.telegramShortName}
              value={shortName}
              onChange={(event) => setShortName(event.target.value.replace(/-/g, "_"))}
              helperText="Start with a letter and use only letters, numbers, or underscores."
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button size="small" onClick={onClose}>
            {appTokens.copy.actions.cancel}
          </Button>
          <Button size="small" type="submit" variant="contained" disabled={!canSubmit}>
            {appTokens.copy.actions.upload}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
