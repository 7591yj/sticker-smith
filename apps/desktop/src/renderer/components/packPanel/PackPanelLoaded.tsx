import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import TelegramIcon from "@mui/icons-material/Telegram";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import type { StickerPackDetails } from "@sticker-smith/shared";
import { appTokens } from "../../../theme/appTokens";
import { RenameDialog } from "../RenameDialog";
import { StickerList } from "../StickerList";
import { getPackPanelDerivedState } from "./packPanelDerivedState";
import { PackPanelHeader } from "./PackPanelHeader";
import { PackPublishDialogController } from "./PackPublishDialogController";
import type { PackPanelProps } from "./types";
import type { PackPanelActions } from "./usePackPanelActions";

function OnboardingStep({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Box sx={{ display: "flex", gap: 1.25, alignItems: "flex-start" }}>
      <Box
        sx={{
          mt: 0.15,
          width: 28,
          height: 28,
          borderRadius: appTokens.shape.radius.control,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "primary.main",
          bgcolor: "rgba(96, 165, 250, 0.10)",
          border: "1px solid",
          borderColor: "rgba(96, 165, 250, 0.22)",
        }}
      >
        {icon}
      </Box>
      <Box>
        <Typography
          variant="body2"
          fontWeight={appTokens.typography.fontWeights.medium}
          sx={{ fontSize: appTokens.typography.fontSizes.bodyDefault }}
        >
          {title}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mt: 0.25, fontSize: appTokens.typography.fontSizes.caption }}
        >
          {body}
        </Typography>
      </Box>
    </Box>
  );
}

export function EmptyPackPanel() {
  return (
    <Box
      sx={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px: 4,
      }}
    >
      <Box sx={{ maxWidth: 420 }}>
        <Typography
          variant="subtitle2"
          fontWeight={appTokens.typography.fontWeights.bold}
          sx={{ fontSize: appTokens.typography.fontSizes.subtitle }}
        >
          Make your first Telegram sticker pack
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mt: 0.75, mb: 2.5, fontSize: appTokens.typography.fontSizes.bodyDefault }}
        >
          {appTokens.copy.emptyStates.noSelection}
        </Typography>
        <Box sx={{ display: "grid", gap: 1.75 }}>
          <OnboardingStep
            icon={<FolderOpenIcon sx={{ fontSize: 17 }} />}
            title="Import a folder when you already have files"
            body="Use the folder button in the lower-left toolbar to create a pack and add everything in one pass."
          />
          <OnboardingStep
            icon={<AddCircleOutlineIcon sx={{ fontSize: 17 }} />}
            title="Create an empty pack for a clean start"
            body="Use New pack, then add files from the pack header. Converted WebM stickers appear in the grid."
          />
          <OnboardingStep
            icon={<TelegramIcon sx={{ fontSize: 17 }} />}
            title="Connect Telegram when you are ready to publish"
            body="Publishing and sync stay available from the Telegram account button without blocking local work."
          />
        </Box>
      </Box>
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
        onChooseIcon={actions.handleChooseIcon}
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
          refreshPacks={props.refreshPacks}
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
