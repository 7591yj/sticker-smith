import AddIcon from "@mui/icons-material/Add";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import DownloadIcon from "@mui/icons-material/Download";
import PublishIcon from "@mui/icons-material/Publish";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import type { StickerItem, StickerPack } from "@sticker-smith/shared";
import { appTokens } from "../../../theme/appTokens";
import { actionIconSx } from "../browserStyles";
import { HeaderActionButton } from "./PackHeaderActionButton";
import { PackHeaderOverflowMenu } from "./PackHeaderOverflowMenu";
import { PackHeaderTitle, PackHeroThumbnail } from "./PackHeaderTitle";
import {
  packMediaTooltip,
  packMirrorTooltip,
  packPublishTooltip,
} from "./packHeaderTooltips";

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
  stickers: StickerItem[];
  onRename: () => void;
  onDelete: () => void;
  converting: boolean;
  stickerCount: number;
  onImportFiles: () => void;
  onImportDir: () => void;
  onOpenStickers: () => void;
  onExportStickers: () => void;
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
  stickers,
  onRename,
  onDelete,
  converting,
  stickerCount,
  onImportFiles,
  onImportDir,
  onOpenStickers,
  onExportStickers,
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
        icon={<PublishIcon sx={actionIconSx(appTokens.sizes.icon.action)} />}
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
        py: 2,
        display: "flex",
        alignItems: "center",
        gap: 2,
        borderBottom: 1,
        borderColor: "divider",
        minHeight: 142,
      }}
    >
      <PackHeroThumbnail pack={pack} />
      <PackHeaderTitle pack={pack} stickers={stickers} />
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 1,
          flexWrap: "wrap",
        }}
      >
        <HeaderActionButton
          label={appTokens.copy.actions.addFiles}
          tooltip="Add sticker files to this pack"
          icon={<AddIcon sx={actionIconSx(appTokens.sizes.icon.action)} />}
          disabled={converting}
          onClick={onImportFiles}
          variant="outlined"
        />
        <HeaderActionButton
          label={appTokens.copy.actions.addFolder}
          tooltip="Add every supported sticker file from a folder"
          icon={
            <CreateNewFolderIcon
              sx={actionIconSx(appTokens.sizes.icon.action)}
            />
          }
          disabled={converting}
          onClick={onImportDir}
          variant="outlined"
        />
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
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
            icon={
              <DownloadIcon sx={actionIconSx(appTokens.sizes.icon.action)} />
            }
            disabled={telegramMirrorBusy || telegramMediaBusy}
            onClick={onDownloadTelegramPackMedia}
          />
        ) : null}
        <PackHeaderOverflowMenu
          pack={pack}
          stickerCount={stickerCount}
          onRename={onRename}
          onDelete={onDelete}
          onOpenStickers={onOpenStickers}
          onExportStickers={onExportStickers}
        />
      </Box>
    </Box>
  );
}
