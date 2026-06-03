import type { Dispatch, SetStateAction } from "react";
import ChangeCircleIcon from "@mui/icons-material/ChangeCircle";
import CheckBoxIcon from "@mui/icons-material/CheckBox";
import CheckBoxOutlineBlankIcon from "@mui/icons-material/CheckBoxOutlineBlank";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import CreateIcon from "@mui/icons-material/Create";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import FilterListIcon from "@mui/icons-material/FilterList";
import SearchIcon from "@mui/icons-material/Search";
import SortIcon from "@mui/icons-material/Sort";
import TelegramIcon from "@mui/icons-material/Telegram";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { appTokens } from "../../../theme/appTokens";
import { browserCountLabelSx } from "../browserStyles";
import { formatResultCountLabel } from "./stickerUtils";
import type { FilterCounts, StickerFilter, StickerSort } from "./types";

const filterOptions: Array<{
  value: StickerFilter;
  label: string;
  icon: React.ReactElement;
}> = [
  {
    value: "all",
    label: appTokens.copy.labels.stickerStatusAll,
    icon: <FilterListIcon />,
  },
  {
    value: "draft",
    label: appTokens.copy.labels.stickerStatusDraft,
    icon: <CreateIcon />,
  },
  {
    value: "ready",
    label: appTokens.copy.labels.stickerStatusReady,
    icon: <CheckCircleOutlineIcon />,
  },
  {
    value: "modified",
    label: appTokens.copy.labels.stickerStatusModified,
    icon: <ChangeCircleIcon />,
  },
  {
    value: "failed",
    label: appTokens.copy.labels.stickerStatusFailed,
    icon: <ErrorOutlineIcon />,
  },
  {
    value: "telegram",
    label: appTokens.copy.labels.stickerStatusTelegram,
    icon: <TelegramIcon />,
  },
];

export function StickerToolbarNotice({ message }: { message: string }) {
  return (
    <Box
      sx={{
        minHeight: 34,
        display: "flex",
        alignItems: "center",
        px: 1.25,
        py: 0.75,
        border: 1,
        borderColor: "warning.dark",
        borderRadius: appTokens.shape.radius.control,
        bgcolor: "rgba(251, 191, 36, 0.08)",
      }}
    >
      <Typography
        variant="caption"
        color="warning.light"
        sx={{
          fontSize: appTokens.typography.fontSizes.caption,
          lineHeight: 1.35,
        }}
      >
        {message}
      </Typography>
    </Box>
  );
}

export function StickerToolbar({
  filter,
  setFilter,
  query,
  setQuery,
  sort,
  setSort,
  filterCounts,
  visibleCount,
  selectedStickerIds,
  totalCount,
  selectableStickerIds,
  setSelectedStickerIds,
  setSelectionAnchorId,
}: {
  filter: StickerFilter;
  setFilter: (filter: StickerFilter) => void;
  query: string;
  setQuery: (query: string) => void;
  sort: StickerSort;
  setSort: (sort: StickerSort) => void;
  filterCounts: FilterCounts;
  visibleCount: number;
  selectedStickerIds: string[];
  totalCount: number;
  selectableStickerIds: string[];
  setSelectedStickerIds: Dispatch<SetStateAction<string[]>>;
  setSelectionAnchorId: Dispatch<SetStateAction<string | null>>;
}) {
  const hasSelection = selectedStickerIds.length > 0;
  const selectionToggleLabel = hasSelection
    ? appTokens.copy.actions.clearSelection
    : appTokens.copy.actions.selectAll;
  const resultLabel = hasSelection
    ? `${selectedStickerIds.length} selected sticker${selectedStickerIds.length === 1 ? "" : "s"} \u30FB ${totalCount} sticker${totalCount === 1 ? "" : "s"}`
    : formatResultCountLabel(visibleCount, totalCount, filter, query);

  const toggleSelection = () => {
    setSelectedStickerIds(hasSelection ? [] : selectableStickerIds);
    setSelectionAnchorId(
      hasSelection ? null : (selectableStickerIds[0] ?? null),
    );
  };

  return (
    <Box
      sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}
    >
      <Box
        sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}
      >
        <Tooltip title={selectionToggleLabel}>
          <span>
            <IconButton
              size="small"
              aria-label={selectionToggleLabel}
              aria-pressed={hasSelection}
              disabled={selectableStickerIds.length === 0}
              onClick={toggleSelection}
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
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          flexWrap: "wrap",
          ml: "auto",
        }}
      >
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
          {filterOptions.map((option) => (
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
                    color: "text.primary",
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
          <MenuItem value="index">Index</MenuItem>
          <MenuItem value="emoji">Emoji</MenuItem>
          <MenuItem value="size">Size</MenuItem>
        </TextField>
      </Box>
    </Box>
  );
}
