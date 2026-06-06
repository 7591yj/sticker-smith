import ComputerIcon from "@mui/icons-material/Computer";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import TelegramIcon from "@mui/icons-material/Telegram";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemAvatar from "@mui/material/ListItemAvatar";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { StickerPack } from "@sticker-smith/shared";
import type { MouseEvent } from "react";
import { appTokens } from "../../../theme/appTokens";
import { toFileUrl } from "../../utils/fileUrl";
import { isVideoPath } from "../../utils/pathDisplay";
import { secondaryLabelForPack } from "./sidebarPackSecondaryLabel";
import type { SidebarPackFilter } from "./types";

function packThumbnailMediaProps(name: string, thumbnailPath: string) {
  const isVideo = isVideoPath(thumbnailPath);
  return {
    component: isVideo ? "video" : "img",
    src: toFileUrl(thumbnailPath),
    alt: isVideo ? undefined : name,
    "aria-label": isVideo ? `${name} icon preview` : undefined,
    muted: isVideo ? true : undefined,
    autoPlay: isVideo ? true : undefined,
    loop: isVideo ? true : undefined,
    playsInline: isVideo ? true : undefined,
    preload: isVideo ? "metadata" : undefined,
  } as const;
}

function PackThumbnail({
  name,
  thumbnailPath,
}: {
  name: string;
  thumbnailPath: string | null;
}) {
  return (
    <ListItemAvatar sx={{ minWidth: 32 }}>
      <Box
        sx={{
          width: appTokens.sizes.preview.thumbnail,
          height: appTokens.sizes.preview.thumbnail,
          borderRadius: appTokens.shape.radius.thumbnail,
          bgcolor: "action.hover",
          border: "1px solid",
          borderColor: "divider",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {thumbnailPath ? (
          <Box
            {...packThumbnailMediaProps(name, thumbnailPath)}
            sx={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />
        ) : (
          <Inventory2OutlinedIcon
            aria-label={`${name} fallback pack icon`}
            sx={{
              fontSize: appTokens.sizes.preview.fallbackIcon,
              color: "text.secondary",
            }}
          />
        )}
      </Box>
    </ListItemAvatar>
  );
}

export function SidebarHeader() {
  return (
    <Box
      sx={{
        pl: "90px",
        pr: appTokens.layout.spacing.sidebarPaddingX,
        py: appTokens.layout.spacing.panelPaddingY,
        minHeight: appTokens.layout.panelHeaderMinHeight,
        display: "flex",
        alignItems: "center",
        WebkitAppRegion: "drag",
      }}
    >
      <Typography
        variant="subtitle2"
        fontWeight={appTokens.typography.fontWeights.bold}
        sx={{ letterSpacing: appTokens.typography.letterSpacing.tight }}
      >
        {appTokens.copy.appName}
      </Typography>
    </Box>
  );
}

export function PackSourceFilter({
  activePackFilter,
  onChange,
}: {
  activePackFilter: SidebarPackFilter;
  onChange: (filter: SidebarPackFilter) => void;
}) {
  return (
    <Box
      aria-label="Pack source filters"
      sx={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: 0.25,
        px: appTokens.layout.spacing.sidebarPaddingX,
        pt: 0.75,
        pb: 0.75,
        WebkitAppRegion: "no-drag",
      }}
    >
      <Tooltip title={appTokens.copy.labels.localPacks}>
        <IconButton
          size="small"
          aria-label={appTokens.copy.labels.localPacks}
          onClick={() => onChange("local")}
          color={activePackFilter === "local" ? "primary" : "default"}
        >
          <ComputerIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title={appTokens.copy.labels.telegramPacks}>
        <IconButton
          size="small"
          aria-label={appTokens.copy.labels.telegramPacks}
          onClick={() => onChange("telegram")}
          color={activePackFilter === "telegram" ? "primary" : "default"}
        >
          <TelegramIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

export function PackList({
  packs,
  emptyState,
  selectedPackId,
  onSelect,
  onContextMenu,
}: {
  packs: StickerPack[];
  emptyState: string;
  selectedPackId: string | null;
  onSelect: (id: string) => void;
  onContextMenu: (e: MouseEvent, pack: StickerPack) => void;
}) {
  return (
    <List sx={{ flex: 1, overflowY: "auto", py: 0.5, px: 0.5 }}>
      {packs.length === 0 ? (
        <Box sx={{ px: 1.5, py: 1.5 }}>
          <Typography
            variant="body2"
            color="text.primary"
            fontWeight={appTokens.typography.fontWeights.medium}
            sx={{ fontSize: appTokens.typography.fontSizes.body }}
          >
            {emptyState}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mt: 0.5, fontSize: appTokens.typography.fontSizes.caption }}
          >
            {emptyState === appTokens.copy.emptyStates.noLocalPacks
              ? "Import a folder or create a new pack from the toolbar below."
              : "Use the Telegram account button below to connect, then refresh your packs."}
          </Typography>
        </Box>
      ) : (
        packs.map((pack) => (
          <ListItemButton
            key={pack.id}
            selected={pack.id === selectedPackId}
            onClick={() => onSelect(pack.id)}
            onContextMenu={(e) => onContextMenu(e, pack)}
            dense
            sx={{ borderRadius: appTokens.shape.radius.panel }}
          >
            <PackThumbnail
              name={pack.name}
              thumbnailPath={pack.thumbnailPath}
            />
            <ListItemText
              primary={pack.name}
              secondary={secondaryLabelForPack(pack)}
              primaryTypographyProps={{
                variant: "body2",
                noWrap: true,
                fontWeight: pack.id === selectedPackId ? 600 : 400,
                fontSize: appTokens.typography.fontSizes.bodyDefault,
              }}
              secondaryTypographyProps={{
                variant: "caption",
                noWrap: true,
                sx: { fontSize: appTokens.typography.fontSizes.caption },
              }}
            />
          </ListItemButton>
        ))
      )}
    </List>
  );
}

export function UnsupportedTelegramToggle({
  show,
  onToggle,
}: {
  show: boolean;
  onToggle: () => void;
}) {
  return (
    <Box sx={{ px: 0.5, py: 0.5 }}>
      <ListItemButton
        dense
        onClick={onToggle}
        sx={{
          borderRadius: appTokens.shape.radius.panel,
          justifyContent: "flex-start",
          px: 1.5,
        }}
      >
        <ListItemText
          primary={
            show ? "Hide unsupported stickers" : "Show unsupported stickers"
          }
          primaryTypographyProps={{
            variant: "caption",
            color: "text.secondary",
            align: "left",
            sx: { fontSize: appTokens.typography.fontSizes.caption },
          }}
        />
        <Tooltip title="Sticker Smith currently supports video stickers only.">
          <HelpOutlineIcon
            sx={{ ml: 0.5, fontSize: 16, color: "text.secondary" }}
          />
        </Tooltip>
      </ListItemButton>
    </Box>
  );
}
