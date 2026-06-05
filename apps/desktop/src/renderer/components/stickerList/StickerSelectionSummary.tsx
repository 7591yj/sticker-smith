import CheckBoxIcon from "@mui/icons-material/CheckBox";
import CheckBoxOutlineBlankIcon from "@mui/icons-material/CheckBoxOutlineBlank";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { appTokens } from "../../../theme/appTokens";
import { browserCountLabelSx } from "../browserStyles";

export function StickerSelectionSummary({
  hasSelection,
  resultLabel,
  selectableCount,
  onToggleSelection,
}: {
  hasSelection: boolean;
  resultLabel: string;
  selectableCount: number;
  onToggleSelection: () => void;
}) {
  const selectionToggleLabel = hasSelection
    ? appTokens.copy.actions.clearSelection
    : appTokens.copy.actions.selectAll;

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
      <Tooltip title={selectionToggleLabel}>
        <span>
          <IconButton
            size="small"
            aria-label={selectionToggleLabel}
            aria-pressed={hasSelection}
            disabled={selectableCount === 0}
            onClick={onToggleSelection}
            sx={{
              width: 28,
              height: 28,
              p: 0.25,
              borderRadius: appTokens.shape.radius.small,
              bgcolor: "transparent",
              color: hasSelection ? "primary.main" : "text.secondary",
              "&:hover": {
                bgcolor: "transparent",
                color: hasSelection ? "primary.light" : "text.primary",
              },
              "& svg": { fontSize: 20 },
            }}
          >
            {hasSelection ? <CheckBoxIcon /> : <CheckBoxOutlineBlankIcon />}
          </IconButton>
        </span>
      </Tooltip>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ ...browserCountLabelSx, mx: 0.5 }}
      >
        {resultLabel}
      </Typography>
    </Box>
  );
}
