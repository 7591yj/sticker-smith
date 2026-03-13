import { useEffect, useMemo, useState } from "react";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { unicodeEmojiCatalog } from "@sticker-smith/shared";
import { appTokens } from "../../theme/appTokens";

interface Props {
  open: boolean;
  title: string;
  initialEmojis: string[];
  onConfirm: (emojis: string[]) => void | Promise<unknown>;
  onClose: () => void;
}

export function EmojiPickerDialog({
  open,
  title,
  initialEmojis,
  onConfirm,
  onClose,
}: Props) {
  const [selectedEmojis, setSelectedEmojis] = useState<string[]>(initialEmojis);
  const [searchQuery, setSearchQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setSelectedEmojis(initialEmojis);
    setSearchQuery("");
    setSubmitting(false);
  }, [initialEmojis, open]);

  const filteredEntries = useMemo(() => {
    const queryTerms = normalizeSearch(searchQuery)
      .split(/\s+/)
      .filter((term) => term.length > 0);

    if (queryTerms.length === 0) {
      return unicodeEmojiCatalog;
    }

    return unicodeEmojiCatalog.filter((entry) =>
      queryTerms.every((term) => entry.searchText.includes(term)),
    );
  }, [searchQuery]);

  const toggleEmoji = (emoji: string) => {
    setSelectedEmojis((current) => {
      if (current.includes(emoji)) {
        return current.filter((item) => item !== emoji);
      }

      if (current.length >= 20) {
        return current;
      }

      return [...current, emoji];
    });
  };

  const handleConfirm = async () => {
    if (submitting) {
      return;
    }

    setSubmitting(true);

    try {
      await onConfirm(selectedEmojis);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle
        sx={{
          fontSize: appTokens.typography.fontSizes.dialogTitle,
          fontWeight: appTokens.typography.fontWeights.medium,
          pb: 1,
        }}
      >
        {title}
      </DialogTitle>
      <DialogContent sx={{ pt: "8px !important" }}>
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
            {selectedEmojis.length > 0 ? (
              selectedEmojis.map((emoji) => (
                <Chip
                  key={emoji}
                  label={emoji}
                  onDelete={() => toggleEmoji(emoji)}
                  size="small"
                />
              ))
            ) : (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ fontSize: appTokens.typography.fontSizes.bodyDefault }}
              >
                {appTokens.copy.labels.noEmoji}
              </Typography>
            )}
          </Stack>
          <TextField
            size="small"
            fullWidth
            label="Search emojis"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by name, group, or subgroup"
          />
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: appTokens.typography.fontSizes.caption }}
          >
            Pick up to 20 emjis from the list.
          </Typography>
          {filteredEntries.length > 0 ? (
            <Stack
              direction="row"
              spacing={0.75}
              useFlexGap
              flexWrap="wrap"
              sx={{ maxHeight: 320, overflowY: "auto", pr: 0.5 }}
            >
              {filteredEntries.map((entry) => {
                const selected = selectedEmojis.includes(entry.emoji);
                return (
                  <Button
                    key={entry.emoji}
                    size="small"
                    variant={selected ? "contained" : "outlined"}
                    onClick={() => toggleEmoji(entry.emoji)}
                    title={entry.name}
                    sx={{
                      minWidth: 40,
                      px: 0.75,
                      fontSize: "1rem",
                    }}
                  >
                    {entry.emoji}
                  </Button>
                );
              })}
            </Stack>
          ) : (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ fontSize: appTokens.typography.fontSizes.bodyDefault }}
            >
              No matching emojis.
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button size="small" onClick={onClose} disabled={submitting}>
          {appTokens.copy.actions.cancel}
        </Button>
        <Button
          size="small"
          onClick={() => setSelectedEmojis([])}
          disabled={submitting || selectedEmojis.length === 0}
        >
          {appTokens.copy.actions.clear}
        </Button>
        <Button
          size="small"
          variant="contained"
          onClick={() => void handleConfirm()}
          disabled={submitting}
        >
          {appTokens.copy.actions.apply}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\uFE0F/g, "")
    .toLowerCase()
    .trim();
}
