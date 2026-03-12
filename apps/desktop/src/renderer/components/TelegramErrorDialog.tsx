import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";
import { appTokens } from "../../theme/appTokens";

interface Props {
  open: boolean;
  title: string;
  message: string;
  onClose: () => void;
}

export function TelegramErrorDialog({
  open,
  title,
  message,
  onClose,
}: Props) {
  return (
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
      <DialogContent sx={{ pt: "8px !important" }}>
        <Typography
          variant="body2"
          sx={{ fontSize: appTokens.typography.fontSizes.bodyDefault }}
        >
          {message}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button size="small" variant="contained" onClick={onClose}>
          {appTokens.copy.actions.close}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
