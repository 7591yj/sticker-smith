import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { StickerPackDetails } from "@sticker-smith/shared";
import { appTokens } from "../../../theme/appTokens";
import type { BrowserView } from "../fileBrowser";
import { RenameDialog } from "../RenameDialog";
import { StickerList } from "../StickerList";
import { getPackPanelDerivedState } from "./packPanelDerivedState";
import { PackPanelHeader } from "./PackPanelHeader";
import { PackPublishDialogController } from "./PackPublishDialogController";
import { PackStickerToolbar } from "./PackStickerToolbar";
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
        bgcolor: "error.dark",
        color: "error.contrastText",
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
  view: BrowserView;
  setView: (view: BrowserView) => void;
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
        onRename={() => props.setRenaming(true)}
        onDelete={actions.handleDelete}
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
      {pack.telegram?.lastSyncError ? (
        <PackSyncErrorBanner message={pack.telegram.lastSyncError} />
      ) : null}
      <PackStickerToolbar
        stickerCount={derived.stickers.length}
        converting={converting}
        onImportFiles={actions.handleImportFiles}
        onImportDir={actions.handleImportDir}
        onOpenStickers={actions.handleOpenStickers}
        onExportStickers={actions.handleExportStickers}
      />
      <Box sx={{ flex: 1, overflowY: "auto" }}>
        <StickerList
          packId={pack.id}
          stickers={derived.stickers}
          iconStickerId={pack.iconStickerId}
          view={props.view}
          onViewChange={props.setView}
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
