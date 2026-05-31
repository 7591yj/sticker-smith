import ViewListIcon from "@mui/icons-material/ViewList";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
import Box from "@mui/material/Box";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import { appTokens } from "../../../theme/appTokens";
import type { BrowserView, BrowserViewToggleProps } from "./types";

export function BrowserViewToggle({
  ariaLabel,
  view,
  onChange,
  compact = false,
}: BrowserViewToggleProps) {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "flex-end",
        px: compact ? 0 : 2.5,
        pt: compact ? 0 : 1.5,
        pb: compact ? 0 : 1,
      }}
    >
      <ToggleButtonGroup
        size="small"
        value={view}
        exclusive
        onChange={(_event, nextView: BrowserView | null) => {
          if (nextView) onChange(nextView);
        }}
        aria-label={ariaLabel}
        sx={{ height: appTokens.sizes.controls.toggleHeight }}
      >
        <ToggleButton
          value="gallery"
          aria-label={appTokens.copy.labels.galleryView}
        >
          <ViewModuleIcon sx={{ fontSize: appTokens.sizes.icon.action }} />
        </ToggleButton>
        <ToggleButton value="list" aria-label={appTokens.copy.labels.listView}>
          <ViewListIcon sx={{ fontSize: appTokens.sizes.icon.action }} />
        </ToggleButton>
      </ToggleButtonGroup>
    </Box>
  );
}
