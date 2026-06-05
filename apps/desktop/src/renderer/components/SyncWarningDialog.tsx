import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import { appTokens } from "../../theme/appTokens";

interface Props {
  open: boolean;
  packs: { packId: string; name: string }[];
  onConfirm: () => void;
  onCancel: () => void;
}

export function SyncWarningDialog({ open, packs, onConfirm, onCancel }: Props) {
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle
        sx={{
          fontSize: appTokens.typography.fontSizes.dialogTitle,
          fontWeight: appTokens.typography.fontWeights.medium,
          pb: 1,
        }}
      >
        {appTokens.copy.dialogs.syncWarningTitle}
      </DialogTitle>
      <DialogContent sx={{ pt: "8px !important" }}>
        <Typography
          variant="body2"
          sx={{ fontSize: appTokens.typography.fontSizes.bodyDefault, mb: 1.5 }}
        >
          {appTokens.copy.dialogs.syncWarningDescription}
        </Typography>
        <List dense disablePadding>
          {packs.map((pack) => (
            <ListItem key={pack.packId} disablePadding sx={{ py: 0.25 }}>
              <ListItemText
                primary={pack.name}
                primaryTypographyProps={{
                  variant: "body2",
                  sx: { fontSize: appTokens.typography.fontSizes.bodyDefault },
                }}
              />
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button size="small" onClick={onCancel}>
          {appTokens.copy.actions.cancel}
        </Button>
        <Button size="small" variant="contained" color="error" onClick={onConfirm}>
          {appTokens.copy.actions.sync}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
