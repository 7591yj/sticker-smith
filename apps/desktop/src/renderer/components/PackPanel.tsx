import { useState, useCallback, type ReactNode } from "react";
import AddIcon from "@mui/icons-material/Add";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import IosShareIcon from "@mui/icons-material/IosShare";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import PublishIcon from "@mui/icons-material/Publish";
import DownloadIcon from "@mui/icons-material/Download";
import UpdateIcon from "@mui/icons-material/Update";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { StickerPack, StickerPackDetails } from "@sticker-smith/shared";
import { appTokens } from "../../theme/appTokens";
import {
  formatTelegramSyncStateLabel,
  telegramSyncStateChipSx,
} from "../utils/telegramSyncState";
import { actionIconSx, formatCountLabel } from "./browserStyles";
import type { BrowserView } from "./fileBrowser";
import { StickerList } from "./StickerList";
import { RenameDialog } from "./RenameDialog";
import { TelegramPublishDialog } from "./TelegramPublishDialog";

interface Props {
  details: StickerPackDetails | null;
  converting: boolean;
  telegramConnected: boolean;
  telegramPublishing: boolean;
  telegramUpdating: boolean;
  setDetails: (d: StickerPackDetails | null) => void;
  refreshDetails: (packId: string) => Promise<StickerPackDetails>;
  refreshPacks: () => Promise<StickerPack[]>;
  setSelectedPackId: (id: string | null) => void;
  onPublishLocalPack: (input: {
    packId: string;
    title: string;
    shortName: string;
  }) => Promise<unknown>;
  onDownloadTelegramPackMedia: (input: { packId: string }) => Promise<unknown>;
  onUpdateTelegramPack: (input: { packId: string }) => Promise<unknown>;
}

function suggestShortName(details: StickerPackDetails) {
  return (
    details.pack.telegramShortName ??
    `${details.pack.slug.replace(/-/g, "_")}_${details.pack.id.replace(/-/g, "").slice(0, 6)}`
  );
}

const panelPrimaryButtonSx = {
  textTransform: "none",
  fontWeight: appTokens.typography.fontWeights.medium,
  fontSize: appTokens.typography.fontSizes.body,
  px: appTokens.layout.spacing.toolbarButtonX,
} as const;

const panelSecondaryButtonSx = {
  textTransform: "none",
  fontSize: appTokens.typography.fontSizes.bodyCompact,
} as const;

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

function HeaderIconButton({ label, onClick, disabled = false, color, icon }: HeaderIconButtonProps) {
  const button = (
    <IconButton size="small" onClick={onClick} color={color} disabled={disabled} aria-label={label}>
      {icon}
    </IconButton>
  );

  return (
    <Tooltip title={label}>
      {disabled ? <span>{button}</span> : button}
    </Tooltip>
  );
}

function HeaderActionButton({ label, tooltip, icon, disabled, onClick }: HeaderActionButtonProps) {
  return (
    <Tooltip title={tooltip}>
      <span>
        <Button size="small" variant="outlined" startIcon={icon} disabled={disabled} onClick={onClick} sx={panelPrimaryButtonSx}>
          {label}
        </Button>
      </span>
    </Tooltip>
  );
}

function PackHeaderTitle({ pack }: { pack: StickerPack }) {
  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography variant="subtitle1" fontWeight={appTokens.typography.fontWeights.medium} sx={{ fontSize: appTokens.typography.fontSizes.subtitle }} noWrap>
        {pack.name}
      </Typography>
      {pack.telegram ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: appTokens.layout.spacing.metadataGap, flexWrap: "wrap", mt: 0.375 }}>
          <Chip size="small" label={formatTelegramSyncStateLabel(pack.telegram.syncState)} sx={{ height: 20, fontSize: appTokens.typography.fontSizes.caption, ...telegramSyncStateChipSx(pack.telegram.syncState) }} />
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: appTokens.typography.fontSizes.caption }}>
            {pack.telegram.shortName}
          </Typography>
        </Box>
      ) : null}
    </Box>
  );
}

function PackHeaderManagementActions({ pack, onRename, onDelete }: { pack: StickerPack; onRename: () => void; onDelete: () => void }) {
  const deleteLabel = pack.source === "local" ? appTokens.copy.tooltips.deletePack : appTokens.copy.tooltips.deleteTelegramPack;

  return (
    <>
      <HeaderIconButton label={appTokens.copy.tooltips.rename} onClick={onRename} icon={<EditIcon sx={{ fontSize: appTokens.sizes.icon.panelAction }} />} />
      <HeaderIconButton label={deleteLabel} onClick={pack.source === "local" ? onDelete : undefined} color="error" disabled={pack.source !== "local"} icon={<DeleteIcon sx={{ fontSize: appTokens.sizes.icon.panelAction }} />} />
    </>
  );
}

function packPublishTooltip(telegramConnected: boolean) {
  return telegramConnected ? "Publish this local pack as a Telegram video sticker set" : "Connect Telegram before uploading";
}

function packMirrorTooltip(telegramUnsupported: boolean, unsupportedTelegramTooltip: string | null, telegramMirrorBusy: boolean) {
  if (telegramUnsupported) return unsupportedTelegramTooltip;
  if (telegramMirrorBusy) return "Telegram is already syncing this mirror";
  return "Push local mirror changes to Telegram";
}

function packMediaTooltip(telegramUnsupported: boolean, unsupportedTelegramTooltip: string | null, telegramMirrorBusy: boolean, telegramMediaBusy: boolean) {
  if (telegramUnsupported) return unsupportedTelegramTooltip;
  if (telegramMirrorBusy || telegramMediaBusy) return "Telegram media download is already in progress for this mirror";
  return "Download missing Telegram sticker media for this mirror";
}

type PackPanelHeaderProps = {
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

function PackPanelHeader({
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
  const primaryTelegramAction = pack.source === "local" ? (
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
      tooltip={packMirrorTooltip(telegramUnsupported, unsupportedTelegramTooltip, telegramMirrorBusy)}
      icon={<UpdateIcon sx={actionIconSx(appTokens.sizes.icon.action)} />}
      disabled={!telegramConnected || telegramMirrorBusy || telegramUnsupported}
      onClick={onUpdateTelegramPack}
    />
  );

  return (
    <Box sx={{ px: appTokens.layout.spacing.panelPaddingX, py: appTokens.layout.spacing.panelPaddingY, display: "flex", alignItems: "center", gap: appTokens.layout.spacing.compactGap, borderBottom: 1, borderColor: "divider", minHeight: appTokens.layout.panelHeaderMinHeight }}>
      <PackHeaderTitle pack={pack} />
      <PackHeaderManagementActions pack={pack} onRename={onRename} onDelete={onDelete} />
      <Divider orientation="vertical" flexItem sx={{ mx: 0.75 }} />
      {primaryTelegramAction}
      {pack.source === "telegram" && hasPendingTelegramMedia ? (
        <HeaderActionButton
          label={telegramMediaActionLabel}
          tooltip={packMediaTooltip(telegramUnsupported, unsupportedTelegramTooltip, telegramMirrorBusy, telegramMediaBusy)}
          icon={<DownloadIcon sx={actionIconSx(appTokens.sizes.icon.action)} />}
          disabled={telegramMirrorBusy || telegramMediaBusy}
          onClick={onDownloadTelegramPackMedia}
        />
      ) : null}
    </Box>
  );
}

function PackSyncErrorBanner({ message }: { message: string }) {
  return (
    <Box sx={{ px: appTokens.layout.spacing.panelPaddingX, py: appTokens.layout.spacing.panelPaddingY, borderBottom: 1, borderColor: "divider", bgcolor: "error.dark", color: "error.contrastText" }}>
      <Typography variant="caption" sx={{ fontSize: appTokens.typography.fontSizes.caption }}>{message}</Typography>
    </Box>
  );
}

function PackStickerToolbar({
  stickerCount,
  converting,
  onImportFiles,
  onImportDir,
  onOpenStickers,
  onExportStickers,
}: {
  stickerCount: number;
  converting: boolean;
  onImportFiles: () => void;
  onImportDir: () => void;
  onOpenStickers: () => void;
  onExportStickers: () => void;
}) {
  return (
    <Box sx={{ px: appTokens.layout.spacing.panelPaddingX, py: 0.75, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1, borderBottom: 1, borderColor: "divider" }}>
      <Button size="small" variant="outlined" startIcon={<AddIcon sx={actionIconSx(appTokens.sizes.icon.compactAction)} />} onClick={onImportFiles} disabled={converting} sx={panelSecondaryButtonSx}>{appTokens.copy.actions.addFiles}</Button>
      <Button size="small" variant="outlined" startIcon={<CreateNewFolderIcon sx={actionIconSx(appTokens.sizes.icon.compactAction)} />} onClick={onImportDir} disabled={converting} sx={panelSecondaryButtonSx}>{appTokens.copy.actions.addFolder}</Button>
      <Box sx={{ ml: "auto", display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", justifyContent: "flex-end" }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: appTokens.typography.fontSizes.caption }}>{formatCountLabel(stickerCount, "sticker")}</Typography>
        <Button size="small" variant="outlined" startIcon={<FolderOpenIcon sx={actionIconSx(appTokens.sizes.icon.compactAction)} />} onClick={onOpenStickers} sx={{ ...panelSecondaryButtonSx, whiteSpace: "nowrap" }}>{appTokens.copy.actions.openFolder}</Button>
        <Button size="small" variant="outlined" startIcon={<IosShareIcon sx={actionIconSx(appTokens.sizes.icon.compactAction)} />} onClick={onExportStickers} disabled={stickerCount === 0} sx={{ ...panelSecondaryButtonSx, whiteSpace: "nowrap" }}>{appTokens.copy.actions.export}</Button>
      </Box>
    </Box>
  );
}

function EmptyPackPanel() {
  return (
    <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Typography variant="body2" color="text.secondary" sx={{ fontSize: appTokens.typography.fontSizes.bodyDefault }}>
        {appTokens.copy.emptyStates.noSelection}
      </Typography>
    </Box>
  );
}

type PackPanelDerivedState = {
  stickers: StickerPackDetails["stickers"];
  telegramUnsupported: boolean;
  unsupportedTelegramTooltip: string | null;
  primaryActionLabel: string;
  telegramMirrorBusy: boolean;
  hasPendingTelegramMedia: boolean;
  telegramMediaBusy: boolean;
  telegramMediaActionLabel: string;
};

function getUnsupportedTelegramTooltip(pack: StickerPack) {
  if (pack.source !== "telegram" || !pack.telegram) return null;
  return `This Telegram pack uses ${pack.telegram.format} stickers. Only video sticker packs are supported currently.`;
}

function getPrimaryActionLabel(pack: StickerPack, telegramPublishing: boolean, telegramUpdating: boolean) {
  if (pack.source === "telegram") return telegramUpdating ? appTokens.copy.actions.updating : appTokens.copy.actions.update;
  return telegramPublishing ? appTokens.copy.actions.uploading : appTokens.copy.actions.upload;
}

function hasPendingMedia(stickers: StickerPackDetails["stickers"], telegramUnsupported: boolean, pack: StickerPack) {
  return (
    pack.source === "telegram" &&
    !telegramUnsupported &&
    stickers.some((sticker) => sticker.downloadState === "missing" || sticker.downloadState === "failed")
  );
}

function getTelegramMediaActionLabel(stickers: StickerPackDetails["stickers"], telegramMediaBusy: boolean) {
  if (telegramMediaBusy) return appTokens.copy.actions.downloadingMedia;
  if (stickers.some((sticker) => sticker.downloadState === "failed")) return appTokens.copy.actions.retryMedia;
  return appTokens.copy.actions.downloadMedia;
}

function getPackPanelDerivedState(details: StickerPackDetails, telegramPublishing: boolean, telegramUpdating: boolean): PackPanelDerivedState {
  const { pack } = details;
  const stickers = details.stickers ?? [];
  const telegramUnsupported = pack.source === "telegram" && pack.telegram?.syncState === "unsupported";
  const telegramMediaBusy = stickers.some((sticker) => sticker.downloadState === "queued" || sticker.downloadState === "downloading");

  return {
    stickers,
    telegramUnsupported,
    unsupportedTelegramTooltip: getUnsupportedTelegramTooltip(pack),
    primaryActionLabel: getPrimaryActionLabel(pack, telegramPublishing, telegramUpdating),
    telegramMirrorBusy: telegramUpdating || pack.telegram?.syncState === "syncing",
    hasPendingTelegramMedia: hasPendingMedia(stickers, telegramUnsupported, pack),
    telegramMediaBusy,
    telegramMediaActionLabel: getTelegramMediaActionLabel(stickers, telegramMediaBusy),
  };
}

type UsePackPanelActionsInput = Pick<Props, "details" | "setDetails" | "refreshDetails" | "refreshPacks" | "setSelectedPackId"> & {
  packId: string | null;
  setRenaming: (open: boolean) => void;
};

type PackActionRunner = (action: (currentPackId: string) => Promise<unknown>) => Promise<void>;
type ImportResult = Awaited<ReturnType<typeof window.stickerSmith.stickers.importFiles>>;

function usePackActionRunner(packId: string | null) {
  return useCallback<PackActionRunner>(async (action) => {
    if (!packId) return;
    await action(packId);
  }, [packId]);
}

function useStickerImportActions(runPackAction: PackActionRunner, refreshDetails: Props["refreshDetails"], setDetails: Props["setDetails"]) {
  const convertImportedStickers = useCallback(async (importResult: ImportResult, currentPackId: string) => {
    const stickerIds = importResult.imported.map((sticker) => sticker.id);
    if (stickerIds.length === 0) {
      await refreshDetails(currentPackId);
      return;
    }
    const next = await window.stickerSmith.conversion.convert({ packId: currentPackId, stickerIds });
    setDetails(next);
  }, [refreshDetails, setDetails]);

  const handleImportFiles = useCallback(async () => {
    await runPackAction(async (currentPackId) => {
      const importResult = await window.stickerSmith.stickers.importFiles({ packId: currentPackId });
      await convertImportedStickers(importResult, currentPackId);
    });
  }, [convertImportedStickers, runPackAction]);

  const handleImportDir = useCallback(async () => {
    await runPackAction(async (currentPackId) => {
      const importResult = await window.stickerSmith.stickers.importDirectory({ packId: currentPackId });
      await convertImportedStickers(importResult, currentPackId);
    });
  }, [convertImportedStickers, runPackAction]);

  return { handleImportFiles, handleImportDir };
}

function useStickerFolderActions(runPackAction: PackActionRunner) {
  const handleOpenStickers = useCallback(async () => {
    await runPackAction((currentPackId) => window.stickerSmith.stickers.revealInFolder({ packId: currentPackId }));
  }, [runPackAction]);
  const handleExportStickers = useCallback(async () => {
    await runPackAction((currentPackId) => window.stickerSmith.stickers.exportFolder({ packId: currentPackId }));
  }, [runPackAction]);
  return { handleOpenStickers, handleExportStickers };
}

function usePackManagementActions({ details, setDetails, refreshDetails, refreshPacks, setSelectedPackId, setRenaming }: Omit<UsePackPanelActionsInput, "packId">) {
  const handleDelete = useCallback(async () => {
    if (!details || details.pack.source === "telegram") return;
    await window.stickerSmith.packs.delete({ packId: details.pack.id });
    const next = await refreshPacks();
    setSelectedPackId(next[0]?.id ?? null);
    setDetails(null);
  }, [details, refreshPacks, setSelectedPackId, setDetails]);

  const handleRename = useCallback(async (name: string) => {
    if (!details) return;
    await window.stickerSmith.packs.rename({ packId: details.pack.id, name });
    await Promise.all([refreshPacks(), refreshDetails(details.pack.id)]);
    setRenaming(false);
  }, [details, refreshPacks, refreshDetails, setRenaming]);

  return { handleDelete, handleRename };
}

function usePackPanelActions({ details, packId, setDetails, refreshDetails, refreshPacks, setSelectedPackId, setRenaming }: UsePackPanelActionsInput) {
  const runPackAction = usePackActionRunner(packId);
  const importActions = useStickerImportActions(runPackAction, refreshDetails, setDetails);
  const folderActions = useStickerFolderActions(runPackAction);
  const managementActions = usePackManagementActions({ details, setDetails, refreshDetails, refreshPacks, setSelectedPackId, setRenaming });

  return { ...importActions, ...folderActions, ...managementActions };
}

type PackPublishDialogControllerProps = Pick<Props, "refreshDetails" | "refreshPacks" | "onPublishLocalPack"> & {
  details: StickerPackDetails;
  open: boolean;
  submitting: boolean;
  telegramPublishing: boolean;
  setOpen: (open: boolean) => void;
  setSubmitting: (submitting: boolean) => void;
};

function PackPublishDialogController({
  details,
  open,
  submitting,
  telegramPublishing,
  setOpen,
  setSubmitting,
  refreshDetails,
  refreshPacks,
  onPublishLocalPack,
}: PackPublishDialogControllerProps) {
  const { pack } = details;
  const close = useCallback(() => {
    if (submitting || telegramPublishing) return;
    setOpen(false);
  }, [submitting, telegramPublishing, setOpen]);

  const confirm = useCallback(async ({ title, shortName }: { title: string; shortName: string }) => {
    setSubmitting(true);
    try {
      await window.stickerSmith.packs.setTelegramShortName({ packId: pack.id, shortName });
      await Promise.all([refreshPacks(), refreshDetails(pack.id)]);
      await onPublishLocalPack({ packId: pack.id, title, shortName });
      setOpen(false);
    } catch {
      // App-level Telegram failure handling keeps the dialog open for retry.
    } finally {
      setSubmitting(false);
    }
  }, [pack.id, refreshPacks, refreshDetails, onPublishLocalPack, setOpen, setSubmitting]);

  return (
    <TelegramPublishDialog
      open={open}
      initialTitle={pack.name}
      initialShortName={suggestShortName(details)}
      submitting={submitting || telegramPublishing}
      onClose={close}
      onConfirm={confirm}
    />
  );
}

type PackPanelLoadedProps = Pick<Props, "converting" | "telegramConnected" | "telegramPublishing" | "telegramUpdating" | "refreshDetails" | "refreshPacks" | "onPublishLocalPack" | "onDownloadTelegramPackMedia" | "onUpdateTelegramPack"> & {
  details: StickerPackDetails;
  actions: ReturnType<typeof usePackPanelActions>;
  renaming: boolean;
  setRenaming: (open: boolean) => void;
  publishDialogOpen: boolean;
  setPublishDialogOpen: (open: boolean) => void;
  publishSubmitting: boolean;
  setPublishSubmitting: (submitting: boolean) => void;
  view: BrowserView;
  setView: (view: BrowserView) => void;
};

function PackPanelLoaded(props: PackPanelLoadedProps) {
  const { details, actions, converting, telegramConnected, telegramPublishing, telegramUpdating, onUpdateTelegramPack, onDownloadTelegramPackMedia } = props;
  const { pack } = details;
  const derived = getPackPanelDerivedState(details, telegramPublishing, telegramUpdating);

  return (
    <Box sx={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
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
        onUpdateTelegramPack={() => void onUpdateTelegramPack({ packId: pack.id }).catch(() => undefined)}
        onDownloadTelegramPackMedia={() => void onDownloadTelegramPackMedia({ packId: pack.id }).catch(() => undefined)}
      />
      {pack.telegram?.lastSyncError ? <PackSyncErrorBanner message={pack.telegram.lastSyncError} /> : null}
      <PackStickerToolbar stickerCount={derived.stickers.length} converting={converting} onImportFiles={actions.handleImportFiles} onImportDir={actions.handleImportDir} onOpenStickers={actions.handleOpenStickers} onExportStickers={actions.handleExportStickers} />
      <Box sx={{ flex: 1, overflowY: "auto" }}>
        <StickerList packId={pack.id} stickers={derived.stickers} iconStickerId={pack.iconStickerId} view={props.view} onViewChange={props.setView} refreshDetails={() => props.refreshDetails(pack.id)} />
      </Box>
      <RenameDialog open={props.renaming} title={appTokens.copy.dialogs.renamePack} initialValue={pack.name} onConfirm={actions.handleRename} onClose={() => props.setRenaming(false)} />
      <PackPublishDialogController details={details} open={props.publishDialogOpen} submitting={props.publishSubmitting} telegramPublishing={telegramPublishing} setOpen={props.setPublishDialogOpen} setSubmitting={props.setPublishSubmitting} refreshDetails={props.refreshDetails} refreshPacks={props.refreshPacks} onPublishLocalPack={props.onPublishLocalPack} />
    </Box>
  );
}

export function PackPanel({
  details,
  converting,
  telegramConnected,
  telegramPublishing,
  telegramUpdating,
  setDetails,
  refreshDetails,
  refreshPacks,
  setSelectedPackId,
  onPublishLocalPack,
  onDownloadTelegramPackMedia,
  onUpdateTelegramPack,
}: Props) {
  const [renaming, setRenaming] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishSubmitting, setPublishSubmitting] = useState(false);
  const [view, setView] = useState<BrowserView>("list");
  const packId = details?.pack.id ?? null;
  const actions = usePackPanelActions({ details, packId, setDetails, refreshDetails, refreshPacks, setSelectedPackId, setRenaming });

  if (!details) return <EmptyPackPanel />;

  return (
    <PackPanelLoaded
      details={details}
      actions={actions}
      converting={converting}
      telegramConnected={telegramConnected}
      telegramPublishing={telegramPublishing}
      telegramUpdating={telegramUpdating}
      refreshDetails={refreshDetails}
      refreshPacks={refreshPacks}
      onPublishLocalPack={onPublishLocalPack}
      onDownloadTelegramPackMedia={onDownloadTelegramPackMedia}
      onUpdateTelegramPack={onUpdateTelegramPack}
      renaming={renaming}
      setRenaming={setRenaming}
      publishDialogOpen={publishDialogOpen}
      setPublishDialogOpen={setPublishDialogOpen}
      publishSubmitting={publishSubmitting}
      setPublishSubmitting={setPublishSubmitting}
      view={view}
      setView={setView}
    />
  );
}
