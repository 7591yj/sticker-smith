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
import { appTokens } from "../../theme/appTokens";

interface Props {
  open: boolean;
  title: string;
  initialEmojis: string[];
  onConfirm: (emojis: string[]) => void | Promise<unknown>;
  onClose: () => void;
}

interface EmojiEntry {
  emoji: string;
  searchText: string;
}

function createEmojiEntries(
  groupKeywords: string[],
  definitions: ReadonlyArray<string | readonly [string, ...string[]]>,
): EmojiEntry[] {
  return definitions.map((definition) => {
    if (typeof definition === "string") {
      return {
        emoji: definition,
        searchText: normalizeSearch([definition, ...groupKeywords].join(" ")),
      };
    }

    const [emoji, ...keywords] = definition;
    return {
      emoji,
      searchText: normalizeSearch([emoji, ...groupKeywords, ...keywords].join(" ")),
    };
  });
}

const EMOJI_ENTRIES = [
  ...createEmojiEntries(["smile", "happy", "face"], [
    ["😀", "grinning"],
    ["😃", "smiley"],
    ["😄", "grin"],
    ["😁", "beaming"],
    ["😆", "laughing"],
    ["😂", "joy", "tears"],
    ["🤣", "rofl"],
    ["🙂", "slight"],
    ["😊", "blush"],
    ["😉", "wink"],
    ["😍", "heart eyes", "love"],
    ["🥰", "smiling hearts", "adore"],
    ["😘", "kiss"],
    ["😎", "cool", "sunglasses"],
    ["🤩", "star struck"],
    ["🥳", "party"],
    ["😇", "angel"],
    ["🤗", "hug"],
    ["🫡", "salute"],
    ["🤔", "thinking"],
    ["🫢", "surprised", "gasp"],
    ["🤫", "shh", "quiet"],
    ["🤭", "giggle"],
    ["🙃", "upside down"],
    ["😴", "sleep"],
    ["🥱", "yawn"],
    ["😮", "wow", "open mouth"],
    ["😯", "hushed"],
    ["😲", "astonished"],
    ["😳", "flushed"],
    ["🥹", "teary", "please"],
    ["😭", "cry", "sob"],
    ["😡", "angry", "mad"],
    ["🤯", "mind blown"],
    ["😱", "scream"],
    ["😈", "devil"],
    ["👀", "eyes", "look"],
  ]),
  ...createEmojiEntries(["spark", "celebration", "energy"], [
    ["💯", "hundred"],
    ["✨", "sparkles"],
    ["🔥", "fire", "lit"],
    ["⚡", "lightning", "zap"],
    ["⭐", "star"],
    ["🌟", "glowing star"],
    ["💥", "boom", "explosion"],
    ["🎉", "party popper"],
    ["🎊", "confetti"],
    ["🏆", "trophy", "win"],
    ["🎯", "target", "bullseye"],
    ["🎵", "music", "note"],
    ["🎶", "notes"],
  ]),
  ...createEmojiEntries(["heart", "love"], [
    ["❤️", "red"],
    ["🩷", "pink"],
    ["🧡", "orange"],
    ["💛", "yellow"],
    ["💚", "green"],
    ["🩵", "light blue", "cyan"],
    ["💙", "blue"],
    ["💜", "purple"],
    ["🤎", "brown"],
    ["🖤", "black"],
    ["🤍", "white"],
    ["💔", "broken"],
    ["❤️‍🔥", "on fire"],
    ["❤️‍🩹", "mending", "healing"],
    ["💕", "two hearts"],
    ["💖", "sparkling heart"],
    ["💗", "growing heart"],
    ["💘", "cupid"],
    ["💝", "gift heart"],
    ["💞", "revolving hearts"],
    ["💓", "beating heart"],
    ["💌", "love letter"],
  ]),
  ...createEmojiEntries(["hand", "gesture"], [
    ["👍", "thumbs up", "like"],
    ["👎", "thumbs down", "dislike"],
    ["👌", "ok"],
    ["✌️", "peace", "victory"],
    ["🤞", "crossed fingers", "luck"],
    ["🤟", "love you"],
    ["🤘", "rock"],
    ["🤙", "call me", "hang loose"],
    ["👋", "wave", "hello"],
    ["🫶", "heart hands"],
    ["👏", "clap", "applause"],
    ["🙌", "raised hands"],
    ["🙏", "pray", "thanks"],
    ["💪", "muscle", "strong"],
    ["🫵", "point at you"],
    ["👈", "point left"],
    ["👉", "point right"],
    ["☝️", "point up"],
    ["👇", "point down"],
    ["✍️", "write"],
    ["🤝", "handshake", "deal"],
  ]),
  ...createEmojiEntries(["animal"], [
    ["🐶", "dog"],
    ["🐱", "cat"],
    ["🐭", "mouse"],
    ["🐹", "hamster"],
    ["🐰", "rabbit", "bunny"],
    ["🦊", "fox"],
    ["🐻", "bear"],
    ["🐼", "panda"],
    ["🐨", "koala"],
    ["🐯", "tiger"],
    ["🦁", "lion"],
    ["🐮", "cow"],
    ["🐷", "pig"],
    ["🐸", "frog"],
    ["🐵", "monkey"],
    ["🐔", "chicken"],
    ["🐧", "penguin"],
    ["🐦", "bird"],
    ["🦄", "unicorn"],
    ["🐝", "bee"],
    ["🦋", "butterfly"],
  ]),
  ...createEmojiEntries(["weather", "nature"], [
    ["🌈", "rainbow"],
    ["☀️", "sun"],
    ["🌤️", "sun behind cloud"],
    ["⛅", "cloudy"],
    ["☁️", "cloud"],
    ["🌧️", "rain"],
    ["⛈️", "storm", "thunder"],
    ["❄️", "snowflake"],
    ["☃️", "snowman"],
    ["🌙", "moon"],
    ["🌸", "cherry blossom"],
    ["🌹", "rose"],
    ["🌻", "sunflower"],
    ["🌼", "flower"],
    ["🌷", "tulip"],
    ["🍀", "clover", "luck"],
    ["🌿", "herb", "leaf"],
    ["🍁", "maple leaf"],
  ]),
  ...createEmojiEntries(["food"], [
    ["🍎", "apple"],
    ["🍉", "watermelon"],
    ["🍓", "strawberry"],
    ["🍒", "cherries"],
    ["🍑", "peach"],
    ["🍍", "pineapple"],
    ["🥑", "avocado"],
    ["🍔", "burger"],
    ["🍕", "pizza"],
    ["🌮", "taco"],
    ["🍜", "ramen", "noodles"],
    ["🍣", "sushi"],
    ["🍩", "donut"],
    ["🍪", "cookie"],
  ]),
  ...createEmojiEntries(["activity", "travel", "object"], [
    ["🎮", "game", "controller"],
    ["🎬", "movie", "film"],
    ["🎨", "art", "paint"],
    ["🚀", "rocket"],
    ["🛸", "ufo", "spaceship"],
    ["🚗", "car"],
    ["✈️", "plane", "airplane"],
    ["🧠", "brain"],
    ["👑", "crown"],
    ["💎", "gem", "diamond"],
    ["🔒", "lock"],
    ["🔑", "key"],
    ["📌", "pin"],
    ["📣", "megaphone"],
    ["💡", "idea", "lightbulb"],
    ["📷", "camera"],
    ["📱", "phone"],
    ["💻", "computer", "laptop"],
    ["⌛", "hourglass", "time"],
  ]),
  ...createEmojiEntries(["symbol", "status"], [
    ["✅", "check", "done"],
    ["❌", "cross", "wrong"],
    ["❗", "exclamation"],
    ["❓", "question"],
    ["⭕", "circle"],
    ["🔴", "red circle"],
    ["🟠", "orange circle"],
    ["🟡", "yellow circle"],
    ["🟢", "green circle"],
    ["🔵", "blue circle"],
    ["🟣", "purple circle"],
  ]),
] as const;

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
      return EMOJI_ENTRIES;
    }

    return EMOJI_ENTRIES.filter((entry) =>
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
            placeholder="Search by name, color, or category"
          />
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: appTokens.typography.fontSizes.caption }}
          >
            Pick up to 20 Telegram-compatible emojis.
          </Typography>
          {filteredEntries.length > 0 ? (
            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
              {filteredEntries.map((entry) => {
                const selected = selectedEmojis.includes(entry.emoji);
                return (
                  <Button
                    key={entry.emoji}
                    size="small"
                    variant={selected ? "contained" : "outlined"}
                    onClick={() => toggleEmoji(entry.emoji)}
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
