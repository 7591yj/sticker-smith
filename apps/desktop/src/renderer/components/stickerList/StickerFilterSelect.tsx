import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import { appTokens } from "../../../theme/appTokens";
import { stickerFilterMeta } from "./stickerStatusMeta";
import type { FilterCounts, StickerFilter } from "./types";

const stickerFilterOptions: StickerFilter[] = [
  "all",
  "draft",
  "ready",
  "synced",
  "modified",
  "failed",
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
      {stickerFilterOptions.map((value) => {
        const option = stickerFilterMeta[value];
        const Icon = option.Icon;
        return (
          <MenuItem key={value} value={value}>
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
                <Icon />
              </Box>
              <Box component="span" sx={{ flex: 1, minWidth: 0 }}>
                {option.label}
              </Box>
              <Box component="span" sx={{ color: "text.secondary" }}>
                {filterCounts[value]}
              </Box>
            </Box>
          </MenuItem>
        );
      })}
    </TextField>
  );
}
