import ClearIcon from "@mui/icons-material/Clear";
import SearchIcon from "@mui/icons-material/Search";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import { appTokens } from "../../../theme/appTokens";

export function StickerSearchField({
  query,
  setQuery,
}: {
  query: string;
  setQuery: (query: string) => void;
}) {
  return (
    <TextField
      size="small"
      value={query}
      onChange={(event) => setQuery(event.target.value)}
      placeholder="Search stickers..."
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon sx={{ fontSize: appTokens.sizes.icon.action }} />
            </InputAdornment>
          ),
          endAdornment: query ? (
            <InputAdornment position="end">
              <Tooltip title="Clear search">
                <IconButton
                  aria-label="Clear search"
                  edge="end"
                  size="small"
                  onClick={() => setQuery("")}
                  sx={{
                    mr: -0.5,
                    color: "text.secondary",
                    "&:hover": { color: "text.primary" },
                    "& svg": { fontSize: appTokens.sizes.icon.action },
                  }}
                >
                  <ClearIcon />
                </IconButton>
              </Tooltip>
            </InputAdornment>
          ) : null,
        },
      }}
      sx={{
        width: { xs: "100%", md: 250 },
        "& .MuiInputBase-root": {
          height: 34,
          fontSize: appTokens.typography.fontSizes.bodyCompact,
        },
      }}
    />
  );
}
