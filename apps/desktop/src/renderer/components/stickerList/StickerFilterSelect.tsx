import type { ReactElement } from "react";
import ChangeCircleIcon from "@mui/icons-material/ChangeCircle";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import CreateIcon from "@mui/icons-material/Create";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import FilterListIcon from "@mui/icons-material/FilterList";
import TelegramIcon from "@mui/icons-material/Telegram";
import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import { appTokens } from "../../../theme/appTokens";
import type { FilterCounts, StickerFilter } from "./types";

type StickerFilterOption = {
  value: StickerFilter;
  label: string;
  icon: ReactElement;
  color: string;
};

const stickerFilterOptions: StickerFilterOption[] = [
  {
    value: "all",
    label: appTokens.copy.labels.stickerStatusAll,
    icon: <FilterListIcon />,
    color: appTokens.colors.text.secondary,
  },
  {
    value: "draft",
    label: appTokens.copy.labels.stickerStatusDraft,
    icon: <CreateIcon />,
    color: appTokens.colors.status.draft.main,
  },
  {
    value: "ready",
    label: appTokens.copy.labels.stickerStatusReady,
    icon: <CheckCircleOutlineIcon />,
    color: appTokens.colors.status.ready.main,
  },
  {
    value: "modified",
    label: appTokens.copy.labels.stickerStatusModified,
    icon: <ChangeCircleIcon />,
    color: appTokens.colors.status.modified.main,
  },
  {
    value: "failed",
    label: appTokens.copy.labels.stickerStatusFailed,
    icon: <ErrorOutlineIcon />,
    color: appTokens.colors.status.failed.main,
  },
  {
    value: "telegram",
    label: appTokens.copy.labels.stickerStatusTelegram,
    icon: <TelegramIcon />,
    color: appTokens.colors.status.synced.main,
  },
];

export function StickerFilterSelect({
  filter,
  setFilter,
  filterCounts,
}: {
  filter: StickerFilter;
  setFilter: (filter: StickerFilter) => void;
  filterCounts: FilterCounts;
}) {
  return (
    <TextField
      select
      size="small"
      value={filter}
      onChange={(event) => setFilter(event.target.value as StickerFilter)}
      sx={{
        width: 120,
        "& .MuiInputBase-root": {
          height: 34,
          fontSize: appTokens.typography.fontSizes.bodyCompact,
        },
        "& .MuiSelect-select": {
          display: "flex",
          alignItems: "center",
          gap: 0.75,
        },
      }}
    >
      {stickerFilterOptions.map((option) => (
        <MenuItem key={option.value} value={option.value}>
          <Box
            component="span"
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              width: "100%",
              minWidth: 0,
            }}
          >
            <Box
              component="span"
              sx={{
                display: "flex",
                color: option.color,
                "& svg": { fontSize: appTokens.sizes.icon.action },
              }}
            >
              {option.icon}
            </Box>
            <Box component="span" sx={{ flex: 1, minWidth: 0 }}>
              {option.label}
            </Box>
            <Box component="span" sx={{ color: "text.secondary" }}>
              {filterCounts[option.value]}
            </Box>
          </Box>
        </MenuItem>
      ))}
    </TextField>
  );
}
