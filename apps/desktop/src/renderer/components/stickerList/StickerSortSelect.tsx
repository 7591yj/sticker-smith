import SortIcon from "@mui/icons-material/Sort";
import InputAdornment from "@mui/material/InputAdornment";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import { appTokens } from "../../../theme/appTokens";
import type { StickerSort } from "./types";

const stickerSortOptions: Array<{ value: StickerSort; label: string }> = [
  { value: "index", label: "Order" },
  { value: "emoji", label: "Emoji" },
  { value: "size", label: "Size" },
];

export function StickerSortSelect({
  sort,
  setSort,
}: {
  sort: StickerSort;
  setSort: (sort: StickerSort) => void;
}) {
  return (
    <TextField
      select
      size="small"
      value={sort}
      onChange={(event) => setSort(event.target.value as StickerSort)}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SortIcon sx={{ fontSize: appTokens.sizes.icon.action }} />
            </InputAdornment>
          ),
        },
      }}
      sx={{
        width: 120,
        "& .MuiInputBase-root": {
          height: 34,
          fontSize: appTokens.typography.fontSizes.bodyCompact,
        },
        "& .MuiSelect-select": { display: "flex", alignItems: "center" },
      }}
    >
      {stickerSortOptions.map((option) => (
        <MenuItem key={option.value} value={option.value}>
          {option.label}
        </MenuItem>
      ))}
    </TextField>
  );
}
