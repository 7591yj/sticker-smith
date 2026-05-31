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

function getJobLabel(packName: string | null): string {
  return packName ? `"${packName}"` : "the current pack";
}

function getSuccessSummary(successCount: number): string {
  return successCount > 0
    ? `${successCount} sticker${successCount !== 1 ? "s" : ""} added.`
    : "No stickers were added.";
}

interface FailureSummaryProps {
  packName: string | null;
  successCount: number;
  failureCount: number;
}

function FailureSummary({
  packName,
  successCount,
  failureCount,
}: FailureSummaryProps) {
  return (
    <>
      <Typography
        variant="body2"
        sx={{ fontSize: appTokens.typography.fontSizes.bodyDefault, mb: 0.75 }}
      >
        Sticker Smith tried to add files to {getJobLabel(packName)}, but {failureCount} file
        {failureCount !== 1 ? "s" : ""} failed.
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
        {getSuccessSummary(successCount)}
      </Typography>
    </>
  );
}

function FailureCard({ failure }: { failure: ConversionFailureItem }) {
  return (
    <Box
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
      {failure.mode ? <FailureMode mode={failure.mode} /> : null}
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
  );
}

function FailureMode({ mode }: { mode: ConversionMode }) {
  return (
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
      {mode}
    </Typography>
  );
}

function FailureList({ failures }: { failures: ConversionFailureItem[] }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {failures.map((failure, index) => (
        <FailureCard key={`${failure.assetLabel}-${index}`} failure={failure} />
      ))}
    </Box>
  );
}

export function ConversionFailureDialog({
  open,
  packName,
  successCount,
  failureCount,
  failures,
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
        {appTokens.copy.dialogs.conversionFailed}
      </DialogTitle>
      <DialogContent sx={{ pt: "8px !important" }}>
        <FailureSummary
          packName={packName}
          successCount={successCount}
          failureCount={failureCount}
        />
        <FailureList failures={failures} />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button size="small" variant="contained" onClick={onClose}>
          {appTokens.copy.actions.close}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
