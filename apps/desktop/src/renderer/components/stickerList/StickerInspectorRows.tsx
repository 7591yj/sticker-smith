import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { StickerItem } from "@sticker-smith/shared";
import { appTokens } from "../../../theme/appTokens";
import { formatBytes } from "../fileBrowser";

export function InspectorRows({ sticker }: { sticker: StickerItem }) {
  const rows = [
    [
      "Emoji",
      sticker.emojiList.length > 0
        ? sticker.emojiList.join(" ")
        : appTokens.copy.labels.noEmoji,
    ],
    ["File", sticker.relativePath],
    ["Size", formatBytes(sticker.sizeBytes)],
    ["Telegram", sticker.telegram ? "Linked" : "Local"],
  ] as const;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
      {rows.map(([label, value]) => (
        <Box
          key={label}
          sx={{
            display: "grid",
            gridTemplateColumns: "70px minmax(0, 1fr)",
            gap: 1,
          }}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: appTokens.typography.fontSizes.caption }}
          >
            {label}
          </Typography>
          <Typography
            variant="caption"
            sx={{
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: appTokens.typography.fontSizes.caption,
            }}
          >
            {value}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
