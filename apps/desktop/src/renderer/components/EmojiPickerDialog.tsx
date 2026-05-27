import { type CSSProperties, useEffect, useMemo, useState } from "react";
import EmojiPicker, {
  EmojiClickData,
  EmojiStyle,
  SkinTonePickerLocation,
  SuggestionMode,
  Theme,
} from "emoji-picker-react";
import { alpha, useTheme } from "@mui/material/styles";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import GlobalStyles from "@mui/material/GlobalStyles";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { appTokens } from "../../theme/appTokens";

const MAX_EMOJI_SELECTION = 20;

interface Props {
  open: boolean;
  title: string;
  initialEmojis: string[];
  onConfirm: (emojis: string[]) => void | Promise<unknown>;
  onClose: () => void;
}

type ToggleEmoji = (emoji: string) => void;

function useSelectedEmojis({
  open,
  initialEmojis,
  onConfirm,
}: Pick<Props, "open" | "initialEmojis" | "onConfirm">) {
  const [selectedEmojis, setSelectedEmojis] = useState<string[]>(initialEmojis);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setSelectedEmojis(initialEmojis);
    setSubmitting(false);
  }, [initialEmojis, open]);

  const toggleEmoji: ToggleEmoji = (emoji) => {
    setSelectedEmojis((current) => toggleEmojiInSelection(current, emoji));
  };

  const confirmSelection = async () => {
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

  return {
    clearSelection: () => setSelectedEmojis([]),
    confirmSelection,
    selectedEmojis,
    submitting,
    toggleEmoji,
  };
}

function toggleEmojiInSelection(current: string[], emoji: string) {
  if (current.includes(emoji)) {
    return current.filter((item) => item !== emoji);
  }

  if (current.length >= MAX_EMOJI_SELECTION) {
    return current;
  }

  return [...current, emoji];
}

function useEmojiPickerStyle() {
  const theme = useTheme();

  return useMemo(() => {
    const dialogBackground = "#38383D";
    const dialogInputBackground = "#303035";
    const dialogBorder = alpha(theme.palette.common.white, 0.12);

    return {
      "--epr-bg-color": dialogBackground,
      "--epr-picker-border-color": "transparent",
      "--epr-highlight-color": theme.palette.primary.main,
      "--epr-text-color": theme.palette.text.primary,
      "--epr-hover-bg-color": alpha(theme.palette.primary.main, 0.14),
      "--epr-focus-bg-color": alpha(theme.palette.primary.main, 0.2),
      "--epr-search-input-bg-color": dialogInputBackground,
      "--epr-search-input-bg-color-active": dialogInputBackground,
      "--epr-search-input-text-color": theme.palette.text.primary,
      "--epr-search-input-placeholder-color": theme.palette.text.secondary,
      "--epr-search-border-color": dialogBorder,
      "--epr-search-border-color-active": theme.palette.primary.main,
      "--epr-category-label-bg-color": alpha(dialogBackground, 0.94),
      "--epr-category-label-text-color": theme.palette.text.secondary,
      "--epr-category-icon-active-color": theme.palette.primary.main,
      "--epr-horizontal-padding": "0px",
      "--epr-header-padding": "0 0 8px 0",
      "--epr-category-padding": "0px",
      "--epr-category-label-padding": "0px",
      "--epr-picker-border-radius": `${appTokens.shape.radiusPx.panel}px`,
      "--epr-search-input-border-radius": `${appTokens.shape.radiusPx.control}px`,
      "--epr-search-input-padding": "0 30px",
      "--epr-search-bar-inner-padding": "8px",
      "--epr-search-input-height": "34px",
      "--epr-category-label-height": "28px",
      "--epr-category-navigation-button-size": "26px",
      "--epr-preview-text-size": appTokens.typography.fontSizes.caption,
      "--epr-emoji-size": "24px",
      "--epr-emoji-padding": "4px",
      fontFamily: theme.typography.fontFamily,
      fontSize: appTokens.typography.fontSizes.caption,
      border: 0,
      boxShadow: "none",
    } as CSSProperties;
  }, [theme]);
}

function EmojiPickerDialogGlobalStyles() {
  const theme = useTheme();

  return (
    <GlobalStyles
      styles={{
        ".EmojiPickerReact, .EmojiPickerReact input, .EmojiPickerReact button:not(.epr-emoji), .EmojiPickerReact .epr-emoji-category-label":
          {
            fontFamily: `${theme.typography.fontFamily} !important`,
          },
        ".EmojiPickerReact input": {
          fontSize: `${appTokens.typography.fontSizes.caption} !important`,
        },
        ".EmojiPickerReact .epr-emoji-category-label": {
          fontSize: `${appTokens.typography.fontSizes.caption} !important`,
          fontWeight: `${appTokens.typography.fontWeights.medium} !important`,
        },
      }}
    />
  );
}

function SelectedEmojiChips({
  selectedEmojis,
  toggleEmoji,
}: {
  selectedEmojis: string[];
  toggleEmoji: ToggleEmoji;
}) {
  return (
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
  );
}

function EmojiPickerDialogBody({
  selectedEmojis,
  toggleEmoji,
}: {
  selectedEmojis: string[];
  toggleEmoji: ToggleEmoji;
}) {
  const emojiPickerStyle = useEmojiPickerStyle();
  const handleEmojiSelect = (emoji: EmojiClickData) => toggleEmoji(emoji.emoji);

  return (
    <DialogContent sx={{ pt: "8px !important" }}>
      <Stack spacing={1.5}>
        <SelectedEmojiChips
          selectedEmojis={selectedEmojis}
          toggleEmoji={toggleEmoji}
        />
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontSize: appTokens.typography.fontSizes.caption }}
        >
          Pick up to 20 emojis from the list.
        </Typography>
        <EmojiPicker
          width="100%"
          height={360}
          emojiStyle={EmojiStyle.NATIVE}
          emojiVersion="15.0"
          theme={Theme.DARK}
          style={emojiPickerStyle}
          previewConfig={{ showPreview: false }}
          skinTonePickerLocation={SkinTonePickerLocation.SEARCH}
          suggestedEmojisMode={SuggestionMode.RECENT}
          onEmojiClick={handleEmojiSelect}
        />
      </Stack>
    </DialogContent>
  );
}

function EmojiPickerDialogActions({
  canClear,
  clearSelection,
  confirmSelection,
  onClose,
  submitting,
}: {
  canClear: boolean;
  clearSelection: () => void;
  confirmSelection: () => Promise<void>;
  onClose: () => void;
  submitting: boolean;
}) {
  return (
    <DialogActions sx={{ px: 3, pb: 2 }}>
      <Button size="small" onClick={onClose} disabled={submitting}>
        {appTokens.copy.actions.cancel}
      </Button>
      <Button size="small" onClick={clearSelection} disabled={submitting || !canClear}>
        {appTokens.copy.actions.clear}
      </Button>
      <Button
        size="small"
        variant="contained"
        onClick={() => void confirmSelection()}
        disabled={submitting}
      >
        {appTokens.copy.actions.apply}
      </Button>
    </DialogActions>
  );
}

export function EmojiPickerDialog({
  open,
  title,
  initialEmojis,
  onConfirm,
  onClose,
}: Props) {
  const { clearSelection, confirmSelection, selectedEmojis, submitting, toggleEmoji } =
    useSelectedEmojis({ initialEmojis, onConfirm, open });

  return (
    <>
      <EmojiPickerDialogGlobalStyles />
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
        <EmojiPickerDialogBody
          selectedEmojis={selectedEmojis}
          toggleEmoji={toggleEmoji}
        />
        <EmojiPickerDialogActions
          canClear={selectedEmojis.length > 0}
          clearSelection={clearSelection}
          confirmSelection={confirmSelection}
          onClose={onClose}
          submitting={submitting}
        />
      </Dialog>
    </>
  );
}
