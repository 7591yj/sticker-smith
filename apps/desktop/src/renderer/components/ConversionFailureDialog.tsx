import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";
import type { ConversionMode } from "@sticker-smith/shared";
import { appTokens } from "../../theme/appTokens";

export interface ConversionFailureItem {
  assetLabel: string;
  error: string;
  mode?: ConversionMode;
}

export interface ConversionFailureDialogState {
  packName: string | null;
  successCount: number;
  failureCount: number;
  failures: ConversionFailureItem[];
}

interface Props {
  open: boolean;
  packName: string | null;
  successCount: number;
  failureCount: number;
  failures: ConversionFailureItem[];
  onClose: () => void;
}

export function ConversionFailureDialog({
  open,
  packName,
  successCount,
  failureCount,
  failures,
  onClose,
}: Props) {
  const jobLabel = packName ? `"${packName}"` : "the current pack";

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle
        sx={{
          fontSize: appTokens.typography.fontSizes.dialogTitle,
          fontWeight: appTokens.typography.fontWeights.medium,
          pb: 1,
        }}
      >
        {appTokens.copy.dialogs.conversionFailed}
      </DialogTitle>
      <DialogContent sx={{ pt: "8px !important" }}>
        <Typography
          variant="body2"
          sx={{ fontSize: appTokens.typography.fontSizes.bodyDefault, mb: 0.75 }}
        >
          Sticker Smith finished converting {jobLabel} in the background, but{" "}
          {failureCount} asset{failureCount !== 1 ? "s" : ""} failed.
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            display: "block",
            fontSize: appTokens.typography.fontSizes.caption,
            mb: 1.5,
          }}
        >
          {successCount > 0
            ? `${successCount} asset${successCount !== 1 ? "s" : ""} converted successfully.`
            : "No assets were converted successfully."}
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {failures.map((failure, index) => (
            <Box
              key={`${failure.assetLabel}-${index}`}
              sx={{
                px: appTokens.layout.spacing.failureCardX,
                py: appTokens.layout.spacing.failureCardY,
                borderRadius: appTokens.shape.radius.panel,
                border: "1px solid",
                borderColor: "divider",
                bgcolor: "action.hover",
              }}
            >
              <Typography
                variant="body2"
                sx={{
                  fontSize: appTokens.typography.fontSizes.bodyCompact,
                  fontWeight: appTokens.typography.fontWeights.medium,
                  mb: 0.25,
                }}
              >
                {failure.assetLabel}
              </Typography>
              {failure.mode ? (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    display: "block",
                    textTransform: "uppercase",
                    letterSpacing: appTokens.typography.letterSpacing.chip,
                    fontSize: appTokens.typography.fontSizes.assetKind,
                    mb: 0.4,
                  }}
                >
                  {failure.mode}
                </Typography>
              ) : null}
              <Typography
                variant="caption"
                sx={{
                  display: "block",
                  color: "error.main",
                  fontSize: appTokens.typography.fontSizes.caption,
                }}
              >
                {failure.error}
              </Typography>
            </Box>
          ))}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button size="small" variant="contained" onClick={onClose}>
          {appTokens.copy.actions.close}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
