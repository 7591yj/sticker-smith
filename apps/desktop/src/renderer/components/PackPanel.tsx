import { useState, useCallback } from "react";
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
import { OutputsList } from "./OutputsList";
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

  const runPackAction = useCallback(
    async (
      action: (currentPackId: string) => Promise<unknown>,
      options: { refreshDetails?: boolean } = {},
    ) => {
      if (!packId) {
        return;
      }

      await action(packId);
      if (options.refreshDetails) {
        await refreshDetails(packId);
      }
    },
    [packId, refreshDetails],
  );

  const convertImportedAssets = useCallback(
    async (
      importResult: Awaited<
        ReturnType<typeof window.stickerSmith.stickers.importFiles>
      >,
      currentPackId: string,
    ) => {
      const assetIds = importResult.imported.map((asset) => asset.id);
      if (assetIds.length === 0) {
        await refreshDetails(currentPackId);
        return;
      }

      const next = await window.stickerSmith.conversion.convert({
        packId: currentPackId,
        assetIds,
      });
      setDetails(next);
    },
    [refreshDetails, setDetails],
  );

  const handleImportFiles = useCallback(async () => {
    await runPackAction(async (currentPackId) => {
      const importResult = await window.stickerSmith.stickers.importFiles({
        packId: currentPackId,
      });
      await convertImportedAssets(importResult, currentPackId);
    });
  }, [convertImportedAssets, runPackAction]);

  const handleImportDir = useCallback(async () => {
    await runPackAction(async (currentPackId) => {
      const importResult = await window.stickerSmith.stickers.importDirectory({
        packId: currentPackId,
      });
      await convertImportedAssets(importResult, currentPackId);
    });
  }, [convertImportedAssets, runPackAction]);

  const handleOpenOutputs = useCallback(async () => {
    await runPackAction((currentPackId) =>
      window.stickerSmith.stickers.revealInFolder({ packId: currentPackId }),
    );
  }, [runPackAction]);

  const handleExportOutputs = useCallback(async () => {
    await runPackAction((currentPackId) =>
      window.stickerSmith.stickers.exportFolder({ packId: currentPackId }),
    );
  }, [runPackAction]);

  const handleDelete = useCallback(async () => {
    if (!details || details.pack.source === "telegram") return;
    await window.stickerSmith.packs.delete({ packId: details.pack.id });
    const next = await refreshPacks();
    setSelectedPackId(next[0]?.id ?? null);
    setDetails(null);
  }, [details, refreshPacks, setSelectedPackId, setDetails]);

  const handleRename = useCallback(
    async (name: string) => {
      if (!details) return;
      await window.stickerSmith.packs.rename({ packId: details.pack.id, name });
      await Promise.all([refreshPacks(), refreshDetails(details.pack.id)]);
      setRenaming(false);
    },
    [details, refreshPacks, refreshDetails],
  );

  if (!details) {
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

  const { pack, assets, outputs } = details;
  const telegramUnsupported =
    pack.source === "telegram" && pack.telegram?.syncState === "unsupported";
  const unsupportedTelegramTooltip =
    pack.source === "telegram" && pack.telegram
      ? `This Telegram pack uses ${pack.telegram.format} stickers. Only video sticker packs are supported currently.`
      : null;
  const primaryActionLabel =
    pack.source === "telegram"
      ? telegramUpdating
        ? appTokens.copy.actions.updating
        : appTokens.copy.actions.update
      : telegramPublishing
        ? appTokens.copy.actions.uploading
        : appTokens.copy.actions.upload;
  const telegramMirrorBusy =
    telegramUpdating || pack.telegram?.syncState === "syncing";
  const hasPendingTelegramMedia =
    pack.source === "telegram" &&
    !telegramUnsupported &&
    assets.some(
      (asset) =>
        asset.downloadState === "missing" || asset.downloadState === "failed",
    );
  const telegramMediaBusy = assets.some(
    (asset) =>
      asset.downloadState === "queued" || asset.downloadState === "downloading",
  );
  const telegramMediaActionLabel = telegramMediaBusy
    ? appTokens.copy.actions.downloadingMedia
    : assets.some((asset) => asset.downloadState === "failed")
      ? appTokens.copy.actions.retryMedia
      : appTokens.copy.actions.downloadMedia;

  return (
    <Box
      sx={{
        flex: 1,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
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

        <Tooltip title={appTokens.copy.tooltips.rename}>
          <IconButton
            size="small"
            onClick={() => setRenaming(true)}
            aria-label={appTokens.copy.tooltips.rename}
          >
            <EditIcon sx={{ fontSize: appTokens.sizes.icon.panelAction }} />
          </IconButton>
        </Tooltip>
        {pack.source === "local" ? (
          <Tooltip title={appTokens.copy.tooltips.deletePack}>
            <IconButton
              size="small"
              onClick={handleDelete}
              color="error"
              aria-label={appTokens.copy.tooltips.deletePack}
            >
              <DeleteIcon sx={{ fontSize: appTokens.sizes.icon.panelAction }} />
            </IconButton>
          </Tooltip>
        ) : (
          <Tooltip title={appTokens.copy.tooltips.deleteTelegramPack}>
            <span>
              <IconButton
                size="small"
                color="error"
                disabled
                aria-label={appTokens.copy.tooltips.deleteTelegramPack}
              >
                <DeleteIcon
                  sx={{ fontSize: appTokens.sizes.icon.panelAction }}
                />
              </IconButton>
            </span>
          </Tooltip>
        )}

        <Divider orientation="vertical" flexItem sx={{ mx: 0.75 }} />

        {pack.source === "local" ? (
          <Tooltip
            title={
              telegramConnected
                ? "Publish this local pack as a Telegram video sticker set"
                : "Connect Telegram before uploading"
            }
          >
            <span>
              <Button
                size="small"
                variant="outlined"
                startIcon={
                  <PublishIcon sx={actionIconSx(appTokens.sizes.icon.action)} />
                }
                disabled={!telegramConnected || telegramPublishing}
                onClick={() => setPublishDialogOpen(true)}
                sx={panelPrimaryButtonSx}
              >
                {primaryActionLabel}
              </Button>
            </span>
          </Tooltip>
        ) : (
          <Tooltip
            title={
              telegramUnsupported
                ? unsupportedTelegramTooltip
                : telegramMirrorBusy
                  ? "Telegram is already syncing this mirror"
                  : "Push local mirror changes to Telegram"
            }
          >
            <span>
              <Button
                size="small"
                variant="outlined"
                startIcon={
                  <UpdateIcon sx={actionIconSx(appTokens.sizes.icon.action)} />
                }
                disabled={
                  !telegramConnected ||
                  telegramMirrorBusy ||
                  telegramUnsupported
                }
                onClick={() =>
                  void onUpdateTelegramPack({ packId: pack.id }).catch(
                    () => undefined,
                  )
                }
                sx={panelPrimaryButtonSx}
              >
                {primaryActionLabel}
              </Button>
            </span>
          </Tooltip>
        )}

        {pack.source === "telegram" && hasPendingTelegramMedia ? (
          <Tooltip
            title={
              telegramUnsupported
                ? unsupportedTelegramTooltip
                : telegramMirrorBusy || telegramMediaBusy
                  ? "Telegram media download is already in progress for this mirror"
                  : "Download missing Telegram sticker media for this mirror"
            }
          >
            <span>
              <Button
                size="small"
                variant="outlined"
                startIcon={
                  <DownloadIcon
                    sx={actionIconSx(appTokens.sizes.icon.action)}
                  />
                }
                disabled={telegramMirrorBusy || telegramMediaBusy}
                onClick={() =>
                  void onDownloadTelegramPackMedia({
                    packId: details.pack.id,
                  }).catch(() => undefined)
                }
                sx={panelPrimaryButtonSx}
              >
                {telegramMediaActionLabel}
              </Button>
            </span>
          </Tooltip>
        ) : null}
      </Box>

      {pack.telegram?.lastSyncError ? (
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
            {pack.telegram.lastSyncError}
          </Typography>
        </Box>
      ) : null}

      <Box
        sx={{
          px: appTokens.layout.spacing.panelPaddingX,
          py: 0.75,
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 1,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Button
          size="small"
          variant="outlined"
          startIcon={
            <AddIcon sx={actionIconSx(appTokens.sizes.icon.compactAction)} />
          }
          onClick={handleImportFiles}
          disabled={converting}
          sx={panelSecondaryButtonSx}
        >
          {appTokens.copy.actions.addFiles}
        </Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={
            <CreateNewFolderIcon
              sx={actionIconSx(appTokens.sizes.icon.compactAction)}
            />
          }
          onClick={handleImportDir}
          disabled={converting}
          sx={panelSecondaryButtonSx}
        >
          {appTokens.copy.actions.addFolder}
        </Button>
        <Box
          sx={{
            ml: "auto",
            display: "flex",
            alignItems: "center",
            gap: 1,
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: appTokens.typography.fontSizes.caption }}
          >
            {formatCountLabel(outputs.length, "sticker")}
          </Typography>
          <Button
            size="small"
            variant="outlined"
            startIcon={
              <FolderOpenIcon
                sx={actionIconSx(appTokens.sizes.icon.compactAction)}
              />
            }
            onClick={handleOpenOutputs}
            sx={{
              ...panelSecondaryButtonSx,
              whiteSpace: "nowrap",
            }}
          >
            {appTokens.copy.actions.openFolder}
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={
              <IosShareIcon
                sx={actionIconSx(appTokens.sizes.icon.compactAction)}
              />
            }
            onClick={handleExportOutputs}
            disabled={outputs.length === 0}
            sx={{
              ...panelSecondaryButtonSx,
              whiteSpace: "nowrap",
            }}
          >
            {appTokens.copy.actions.export}
          </Button>
        </Box>
      </Box>

      <Box sx={{ flex: 1, overflowY: "auto" }}>
        <OutputsList
          packId={pack.id}
          outputs={outputs}
          assets={assets}
          view={view}
          onViewChange={setView}
          refreshDetails={() => refreshDetails(pack.id)}
        />
      </Box>

      <RenameDialog
        open={renaming}
        title={appTokens.copy.dialogs.renamePack}
        initialValue={pack.name}
        onConfirm={handleRename}
        onClose={() => setRenaming(false)}
      />

      <TelegramPublishDialog
        open={publishDialogOpen}
        initialTitle={pack.name}
        initialShortName={suggestShortName(details)}
        submitting={publishSubmitting || telegramPublishing}
        onClose={() => {
          if (publishSubmitting || telegramPublishing) {
            return;
          }
          setPublishDialogOpen(false);
        }}
        onConfirm={async ({ title, shortName }) => {
          setPublishSubmitting(true);
          try {
            await window.stickerSmith.packs.setTelegramShortName({
              packId: pack.id,
              shortName,
            });
            await Promise.all([refreshPacks(), refreshDetails(pack.id)]);
            await onPublishLocalPack({
              packId: pack.id,
              title,
              shortName,
            });
            setPublishDialogOpen(false);
          } catch {
            // App-level Telegram failure handling keeps the dialog open for retry.
          } finally {
            setPublishSubmitting(false);
          }
        }}
      />
    </Box>
  );
}
