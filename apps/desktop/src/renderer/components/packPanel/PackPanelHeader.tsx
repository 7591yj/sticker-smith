import type { ReactNode } from "react";
import DeleteIcon from "@mui/icons-material/Delete";
import DownloadIcon from "@mui/icons-material/Download";
import EditIcon from "@mui/icons-material/Edit";
import PublishIcon from "@mui/icons-material/Publish";
import UpdateIcon from "@mui/icons-material/Update";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { StickerPack } from "@sticker-smith/shared";
import { appTokens } from "../../../theme/appTokens";
import { actionIconSx } from "../browserStyles";
import {
  formatTelegramSyncStateLabel,
  telegramSyncStateChipSx,
} from "../../utils/telegramSyncState";
import { panelPrimaryButtonSx } from "./packPanelStyles";

type HeaderIconButtonProps = {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  color?: "error";
  icon: ReactNode;
};

type HeaderActionButtonProps = {
  label: string;
  tooltip: string | null;
  icon: ReactNode;
  disabled: boolean;
  onClick: () => void;
};

function HeaderIconButton({
  label,
  onClick,
  disabled = false,
  color,
  icon,
}: HeaderIconButtonProps) {
  const button = (
    <IconButton
      size="small"
      onClick={onClick}
      color={color}
      disabled={disabled}
      aria-label={label}
    >
      {icon}
    </IconButton>
  );
  return (
    <Tooltip title={label}>{disabled ? <span>{button}</span> : button}</Tooltip>
  );
}

function HeaderActionButton({
  label,
  tooltip,
  icon,
  disabled,
  onClick,
}: HeaderActionButtonProps) {
  return (
    <Tooltip title={tooltip}>
      <span>
        <Button
          size="small"
          variant="outlined"
          startIcon={icon}
          disabled={disabled}
          onClick={onClick}
          sx={panelPrimaryButtonSx}
        >
          {label}
        </Button>
      </span>
    </Tooltip>
  );
}

function PackHeaderTitle({ pack }: { pack: StickerPack }) {
  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography
        variant="subtitle1"
        fontWeight={appTokens.typography.fontWeights.medium}
        sx={{ fontSize: appTokens.typography.fontSizes.subtitle }}
        noWrap
      >
        {pack.name}
      </Typography>
      {pack.telegram ? (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: appTokens.layout.spacing.metadataGap,
            flexWrap: "wrap",
            mt: 0.375,
          }}
        >
          <Chip
            size="small"
            label={formatTelegramSyncStateLabel(pack.telegram.syncState)}
            sx={{
              height: 20,
              fontSize: appTokens.typography.fontSizes.caption,
              ...telegramSyncStateChipSx(pack.telegram.syncState),
            }}
          />
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: appTokens.typography.fontSizes.caption }}
          >
            {pack.telegram.shortName}
          </Typography>
        </Box>
      ) : null}
    </Box>
  );
}

function PackHeaderManagementActions({
  pack,
  onRename,
  onDelete,
}: {
  pack: StickerPack;
  onRename: () => void;
  onDelete: () => void;
}) {
  const deleteLabel =
    pack.source === "local"
      ? appTokens.copy.tooltips.deletePack
      : appTokens.copy.tooltips.deleteTelegramPack;
  return (
    <>
      <HeaderIconButton
        label={appTokens.copy.tooltips.rename}
        onClick={onRename}
        icon={<EditIcon sx={{ fontSize: appTokens.sizes.icon.panelAction }} />}
      />
      <HeaderIconButton
        label={deleteLabel}
        onClick={pack.source === "local" ? onDelete : undefined}
        color="error"
        disabled={pack.source !== "local"}
        icon={
          <DeleteIcon sx={{ fontSize: appTokens.sizes.icon.panelAction }} />
        }
      />
    </>
  );
}

function packPublishTooltip(telegramConnected: boolean) {
  return telegramConnected
    ? "Publish this local pack as a Telegram video sticker set"
    : "Connect Telegram before uploading";
}

function packMirrorTooltip(
  telegramUnsupported: boolean,
  unsupportedTelegramTooltip: string | null,
  telegramMirrorBusy: boolean,
) {
  if (telegramUnsupported) return unsupportedTelegramTooltip;
  if (telegramMirrorBusy) return "Telegram is already syncing this mirror";
  return "Push local mirror changes to Telegram";
}

function packMediaTooltip(
  telegramUnsupported: boolean,
  unsupportedTelegramTooltip: string | null,
  telegramMirrorBusy: boolean,
  telegramMediaBusy: boolean,
) {
  if (telegramUnsupported) return unsupportedTelegramTooltip;
  if (telegramMirrorBusy || telegramMediaBusy)
    return "Telegram media download is already in progress for this mirror";
  return "Download missing Telegram sticker media for this mirror";
}

export type PackPanelHeaderProps = {
  pack: StickerPack;
  telegramConnected: boolean;
  telegramPublishing: boolean;
  telegramUpdating: boolean;
  telegramUnsupported: boolean;
  unsupportedTelegramTooltip: string | null;
  primaryActionLabel: string;
  telegramMirrorBusy: boolean;
  hasPendingTelegramMedia: boolean;
  telegramMediaBusy: boolean;
  telegramMediaActionLabel: string;
  onRename: () => void;
  onDelete: () => void;
  onPublish: () => void;
  onUpdateTelegramPack: () => void;
  onDownloadTelegramPackMedia: () => void;
};

export function PackPanelHeader({
  pack,
  telegramConnected,
  telegramPublishing,
  telegramUpdating: _telegramUpdating,
  telegramUnsupported,
  unsupportedTelegramTooltip,
  primaryActionLabel,
  telegramMirrorBusy,
  hasPendingTelegramMedia,
  telegramMediaBusy,
  telegramMediaActionLabel,
  onRename,
  onDelete,
  onPublish,
  onUpdateTelegramPack,
  onDownloadTelegramPackMedia,
}: PackPanelHeaderProps) {
  const primaryTelegramAction =
    pack.source === "local" ? (
      <HeaderActionButton
        label={primaryActionLabel}
        tooltip={packPublishTooltip(telegramConnected)}
        icon={<PublishIcon sx={actionIconSx(appTokens.sizes.icon.action)} />}
        disabled={!telegramConnected || telegramPublishing}
        onClick={onPublish}
      />
    ) : (
      <HeaderActionButton
        label={primaryActionLabel}
        tooltip={packMirrorTooltip(
          telegramUnsupported,
          unsupportedTelegramTooltip,
          telegramMirrorBusy,
        )}
        icon={<UpdateIcon sx={actionIconSx(appTokens.sizes.icon.action)} />}
        disabled={
          !telegramConnected || telegramMirrorBusy || telegramUnsupported
        }
        onClick={onUpdateTelegramPack}
      />
    );

  return (
    <Box
      sx={{
        px: appTokens.layout.spacing.panelPaddingX,
        py: appTokens.layout.spacing.panelPaddingY,
        display: "flex",
        alignItems: "center",
        gap: appTokens.layout.spacing.compactGap,
        borderBottom: 1,
        borderColor: "divider",
        minHeight: appTokens.layout.panelHeaderMinHeight,
      }}
    >
      <PackHeaderTitle pack={pack} />
      <PackHeaderManagementActions
        pack={pack}
        onRename={onRename}
        onDelete={onDelete}
      />
      <Divider orientation="vertical" flexItem sx={{ mx: 0.75 }} />
      {primaryTelegramAction}
      {pack.source === "telegram" && hasPendingTelegramMedia ? (
        <HeaderActionButton
          label={telegramMediaActionLabel}
          tooltip={packMediaTooltip(
            telegramUnsupported,
            unsupportedTelegramTooltip,
            telegramMirrorBusy,
            telegramMediaBusy,
          )}
          icon={<DownloadIcon sx={actionIconSx(appTokens.sizes.icon.action)} />}
          disabled={telegramMirrorBusy || telegramMediaBusy}
          onClick={onDownloadTelegramPackMedia}
        />
      ) : null}
    </Box>
  );
}
