import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { StickerPackDetails } from "@sticker-smith/shared";
import { appTokens } from "../../../theme/appTokens";
import { RenameDialog } from "../RenameDialog";
import { StickerList } from "../StickerList";
import { getPackPanelDerivedState } from "./packPanelDerivedState";
import { PackPanelHeader } from "./PackPanelHeader";
import { PackPublishDialogController } from "./PackPublishDialogController";
import type { PackPanelProps } from "./types";
import type { PackPanelActions } from "./usePackPanelActions";

export function EmptyPackPanel() {
  return (
    <Box
      sx={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ fontSize: appTokens.typography.fontSizes.bodyDefault }}
      >
        {appTokens.copy.emptyStates.noSelection}
      </Typography>
    </Box>
  );
}

function PackSyncErrorBanner({ message }: { message: string }) {
  return (
    <Box
      sx={{
        px: appTokens.layout.spacing.panelPaddingX,
        py: appTokens.layout.spacing.panelPaddingY,
        borderBottom: 1,
        borderColor: "divider",
        bgcolor: appTokens.colors.status.failed.background,
        color: appTokens.colors.status.failed.contrast,
      }}
    >
      <Typography
        variant="caption"
        sx={{ fontSize: appTokens.typography.fontSizes.caption }}
      >
        {message}
      </Typography>
    </Box>
  );
}

function getUnsupportedTelegramNotice(details: StickerPackDetails) {
  const { pack } = details;
  if (pack.source !== "telegram" || pack.telegram?.syncState !== "unsupported") {
    return null;
  }
  const format = pack.telegram.format;
  return `Telegram pack "${pack.name}" uses ${format} stickers, and only video sticker packs are supported currently.`;
}

type PackPanelLoadedProps = Pick<
  PackPanelProps,
  | "converting"
  | "telegramConnected"
  | "telegramPublishing"
  | "telegramUpdating"
  | "refreshDetails"
  | "refreshPacks"
  | "onPublishLocalPack"
  | "onDownloadTelegramPackMedia"
  | "onUpdateTelegramPack"
> & {
  details: StickerPackDetails;
  actions: PackPanelActions;
  renaming: boolean;
  setRenaming: (open: boolean) => void;
  publishDialogOpen: boolean;
  setPublishDialogOpen: (open: boolean) => void;
  publishSubmitting: boolean;
  setPublishSubmitting: (submitting: boolean) => void;
};

export function PackPanelLoaded(props: PackPanelLoadedProps) {
  const {
    details,
    actions,
    converting,
    telegramConnected,
    telegramPublishing,
    telegramUpdating,
    onUpdateTelegramPack,
    onDownloadTelegramPackMedia,
  } = props;
  const { pack } = details;
  const derived = getPackPanelDerivedState(
    details,
    telegramPublishing,
    telegramUpdating,
  );

  return (
    <Box
      sx={{
        flex: 1,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <PackPanelHeader
        pack={pack}
        telegramConnected={telegramConnected}
        telegramPublishing={telegramPublishing}
        telegramUpdating={telegramUpdating}
        telegramUnsupported={derived.telegramUnsupported}
        unsupportedTelegramTooltip={derived.unsupportedTelegramTooltip}
        primaryActionLabel={derived.primaryActionLabel}
        telegramMirrorBusy={derived.telegramMirrorBusy}
        hasPendingTelegramMedia={derived.hasPendingTelegramMedia}
        telegramMediaBusy={derived.telegramMediaBusy}
        telegramMediaActionLabel={derived.telegramMediaActionLabel}
        stickers={derived.stickers}
        onRename={() => props.setRenaming(true)}
        onDelete={actions.handleDelete}
        converting={converting}
        stickerCount={derived.stickers.length}
        onImportFiles={actions.handleImportFiles}
        onImportDir={actions.handleImportDir}
        onOpenStickers={actions.handleOpenStickers}
        onExportStickers={actions.handleExportStickers}
        onPublish={() => props.setPublishDialogOpen(true)}
        onUpdateTelegramPack={() =>
          void onUpdateTelegramPack({ packId: pack.id }).catch(() => undefined)
        }
        onDownloadTelegramPackMedia={() =>
          void onDownloadTelegramPackMedia({ packId: pack.id }).catch(
            () => undefined,
          )
        }
      />
      {pack.telegram?.lastSyncError && !derived.telegramUnsupported ? (
        <PackSyncErrorBanner message={pack.telegram.lastSyncError} />
      ) : null}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <StickerList
          packId={pack.id}
          stickers={derived.stickers}
          iconStickerId={pack.iconStickerId}
          toolbarNotice={getUnsupportedTelegramNotice(details)}
          refreshDetails={() => props.refreshDetails(pack.id)}
        />
      </Box>
      <RenameDialog
        open={props.renaming}
        title={appTokens.copy.dialogs.renamePack}
        initialValue={pack.name}
        onConfirm={actions.handleRename}
        onClose={() => props.setRenaming(false)}
      />
      <PackPublishDialogController
        details={details}
        open={props.publishDialogOpen}
        submitting={props.publishSubmitting}
        telegramPublishing={telegramPublishing}
        setOpen={props.setPublishDialogOpen}
        setSubmitting={props.setPublishSubmitting}
        refreshDetails={props.refreshDetails}
        refreshPacks={props.refreshPacks}
        onPublishLocalPack={props.onPublishLocalPack}
      />
    </Box>
  );
}
