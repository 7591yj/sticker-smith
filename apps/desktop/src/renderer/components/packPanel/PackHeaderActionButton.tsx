import type { ReactNode } from "react";
import Button from "@mui/material/Button";
import Tooltip from "@mui/material/Tooltip";
import { appTokens } from "../../../theme/appTokens";
import {
  panelPrimaryButtonSx,
  panelSecondaryButtonSx,
} from "./packPanelStyles";

export function HeaderActionButton({
  label,
  tooltip,
  icon,
  disabled,
  onClick,
  variant = "contained",
}: {
  label: string;
  tooltip: string | null;
  icon: ReactNode;
  disabled: boolean;
  onClick: () => void;
  variant?: "contained" | "outlined";
}) {
  return (
    <Tooltip title={tooltip}>
      <span>
        <Button
          size="small"
          variant={variant}
          startIcon={icon}
          disabled={disabled}
          onClick={onClick}
          sx={{
            ...(variant === "contained"
              ? panelPrimaryButtonSx
              : panelSecondaryButtonSx),
            minHeight: 34,
            borderRadius: appTokens.shape.radius.control,
            boxShadow: "none",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </Button>
      </span>
    </Tooltip>
  );
}
