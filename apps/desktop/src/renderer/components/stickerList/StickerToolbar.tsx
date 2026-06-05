import type { Dispatch, SetStateAction } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { appTokens } from "../../../theme/appTokens";
import { StickerFilterSelect } from "./StickerFilterSelect";
import { StickerSearchField } from "./StickerSearchField";
import { StickerSelectionSummary } from "./StickerSelectionSummary";
import { StickerSortSelect } from "./StickerSortSelect";
import { formatResultCountLabel } from "./stickerUtils";
import type { FilterCounts, StickerFilter, StickerSort } from "./types";

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
        borderColor: appTokens.colors.status.modified.border,
        borderRadius: appTokens.shape.radius.control,
        bgcolor: appTokens.colors.status.modified.background,
      }}
    >
      <Typography
        variant="caption"
        sx={{
          color: appTokens.colors.status.modified.contrast,
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
      <StickerSelectionSummary
        hasSelection={hasSelection}
        resultLabel={resultLabel}
        selectableCount={selectableStickerIds.length}
        onToggleSelection={toggleSelection}
      />
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          flexWrap: "wrap",
          ml: "auto",
        }}
      >
        <StickerSearchField query={query} setQuery={setQuery} />
        <StickerFilterSelect
          filter={filter}
          setFilter={setFilter}
          filterCounts={filterCounts}
        />
        <StickerSortSelect sort={sort} setSort={setSort} />
      </Box>
    </Box>
  );
}
