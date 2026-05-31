import EmojiPicker, {
  EmojiClickData,
  EmojiStyle,
  SkinTonePickerLocation,
  SuggestionMode,
  Theme,
} from "emoji-picker-react";
import Chip from "@mui/material/Chip";
import DialogContent from "@mui/material/DialogContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { appTokens } from "../../../theme/appTokens";
import { useEmojiPickerStyle } from "./emojiPickerStyles";
import type { ToggleEmoji } from "./types";

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

export function EmojiPickerDialogBody({
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
