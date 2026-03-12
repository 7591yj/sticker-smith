import { useState, useCallback, useEffect } from "react";
import AddIcon from "@mui/icons-material/Add";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import IosShareIcon from "@mui/icons-material/IosShare";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PublishIcon from "@mui/icons-material/Publish";
import DownloadIcon from "@mui/icons-material/Download";
import UpdateIcon from "@mui/icons-material/Update";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { StickerPack, StickerPackDetails } from "@sticker-smith/shared";
import { appTokens } from "../../theme/appTokens";
import {
  formatTelegramSyncStateLabel,
  telegramSyncStateChipSx,
} from "../utils/telegramSyncState";
import { AssetGrid } from "./AssetGrid";
import { BrowserViewToggle, type BrowserView } from "./fileBrowser";
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
  return `${details.pack.slug.replace(/-/g, "_")}_${details.pack.id.replace(/-/g, "").slice(0, 6)}`;
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
  const [activeTab, setActiveTab] = useState<"assets" | "outputs">("assets");
  const [view, setView] = useState<BrowserView>("list");

  const handleConvert = useCallback(async () => {
    if (!details) return;
    const next = await window.stickerSmith.conversion.convertPack({
      packId: details.pack.id,
    });
    setDetails(next);
  }, [details, setDetails]);

  const handleImportFiles = useCallback(async () => {
    if (!details) return;
    await window.stickerSmith.assets.importFiles({ packId: details.pack.id });
    await refreshDetails(details.pack.id);
  }, [details, refreshDetails]);

  const handleImportDir = useCallback(async () => {
    if (!details) return;
    await window.stickerSmith.assets.importDirectory({
      packId: details.pack.id,
    });
    await refreshDetails(details.pack.id);
  }, [details, refreshDetails]);

  const handleOpenOutputs = useCallback(async () => {
    if (!details) return;
    await window.stickerSmith.outputs.revealInFolder({
      packId: details.pack.id,
    });
  }, [details]);

  const handleOpenAssets = useCallback(async () => {
    if (!details) return;
    await window.stickerSmith.packs.revealSourceFolder({
      packId: details.pack.id,
    });
  }, [details]);

  const handleExportOutputs = useCallback(async () => {
    if (!details) return;
    await window.stickerSmith.outputs.exportFolder({
      packId: details.pack.id,
    });
  }, [details]);

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

  useEffect(() => {
    if ((details?.outputs.length ?? 0) === 0 && activeTab === "outputs") {
      setActiveTab("assets");
    }
  }, [activeTab, details]);

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
          px: 2.5,
          py: 1,
          display: "flex",
          alignItems: "center",
          gap: 0.5,
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
                gap: 0.75,
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
            <EditIcon sx={{ fontSize: appTokens.sizes.panelActionIcon }} />
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
              <DeleteIcon sx={{ fontSize: appTokens.sizes.panelActionIcon }} />
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
                <DeleteIcon sx={{ fontSize: appTokens.sizes.panelActionIcon }} />
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
                  <PublishIcon
                    sx={{ fontSize: `${appTokens.sizes.actionIcon}px !important` }}
                  />
                }
                disabled={!telegramConnected || telegramPublishing}
                onClick={() => setPublishDialogOpen(true)}
                sx={{
                  textTransform: "none",
                  fontWeight: appTokens.typography.fontWeights.medium,
                  fontSize: appTokens.typography.fontSizes.body,
                  px: 1.5,
                }}
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
                  <UpdateIcon
                    sx={{ fontSize: `${appTokens.sizes.actionIcon}px !important` }}
                  />
                }
                disabled={!telegramConnected || telegramMirrorBusy || telegramUnsupported}
                onClick={() =>
                  void onUpdateTelegramPack({ packId: pack.id }).catch(
                    () => undefined,
                  )
                }
                sx={{
                  textTransform: "none",
                  fontWeight: appTokens.typography.fontWeights.medium,
                  fontSize: appTokens.typography.fontSizes.body,
                  px: 1.5,
                }}
              >
                {primaryActionLabel}
              </Button>
            </span>
          </Tooltip>
        )}

        <Tooltip
          title={
            converting
              ? appTokens.copy.tooltips.converting
              : assets.length === 0
                ? appTokens.copy.tooltips.noAssetsToConvert
                : appTokens.copy.tooltips.convertAll
          }
        >
          <span>
            <Button
              size="small"
              variant="contained"
              startIcon={
                <PlayArrowIcon
                  sx={{ fontSize: `${appTokens.sizes.actionIcon}px !important` }}
                />
              }
              onClick={handleConvert}
              disabled={converting || assets.length === 0}
              disableElevation
              sx={{
                textTransform: "none",
                fontWeight: appTokens.typography.fontWeights.medium,
                fontSize: appTokens.typography.fontSizes.body,
                px: 1.5,
              }}
            >
              {appTokens.copy.actions.convert}
            </Button>
          </span>
        </Tooltip>
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
                    sx={{ fontSize: `${appTokens.sizes.actionIcon}px !important` }}
                  />
                }
                disabled={telegramMirrorBusy || telegramMediaBusy}
                onClick={() =>
                  void onDownloadTelegramPackMedia({
                    packId: details.pack.id,
                  }).catch(() => undefined)
                }
                sx={{
                  textTransform: "none",
                  fontWeight: appTokens.typography.fontWeights.medium,
                  fontSize: appTokens.typography.fontSizes.body,
                  px: 1.5,
                }}
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
            px: 2.5,
            py: 1,
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
          px: 2.5,
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
            <AddIcon
              sx={{ fontSize: `${appTokens.sizes.compactActionIcon}px !important` }}
            />
          }
          onClick={handleImportFiles}
          sx={{
            textTransform: "none",
            fontSize: appTokens.typography.fontSizes.bodyCompact,
          }}
        >
          {appTokens.copy.actions.addFiles}
        </Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={
            <CreateNewFolderIcon
              sx={{ fontSize: `${appTokens.sizes.compactActionIcon}px !important` }}
            />
          }
          onClick={handleImportDir}
          sx={{
            textTransform: "none",
            fontSize: appTokens.typography.fontSizes.bodyCompact,
          }}
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
            {assets.length} asset{assets.length !== 1 ? "s" : ""}
            {outputs.length > 0
              ? ` · ${outputs.length} output${outputs.length !== 1 ? "s" : ""}`
              : ""}
          </Typography>
          <Button
            size="small"
            variant="outlined"
            startIcon={
              <FolderOpenIcon
                sx={{ fontSize: `${appTokens.sizes.compactActionIcon}px !important` }}
              />
            }
            onClick={handleOpenAssets}
            sx={{
              textTransform: "none",
              fontSize: appTokens.typography.fontSizes.bodyCompact,
              whiteSpace: "nowrap",
            }}
          >
            {appTokens.copy.actions.openAssets}
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={
              <FolderOpenIcon
                sx={{ fontSize: `${appTokens.sizes.compactActionIcon}px !important` }}
              />
            }
            onClick={handleOpenOutputs}
            sx={{
              textTransform: "none",
              fontSize: appTokens.typography.fontSizes.bodyCompact,
              whiteSpace: "nowrap",
            }}
          >
            {appTokens.copy.actions.openOutputs}
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={
              <IosShareIcon
                sx={{ fontSize: `${appTokens.sizes.compactActionIcon}px !important` }}
              />
            }
            onClick={handleExportOutputs}
            disabled={outputs.length === 0}
            sx={{
              textTransform: "none",
              fontSize: appTokens.typography.fontSizes.bodyCompact,
              whiteSpace: "nowrap",
            }}
          >
            {appTokens.copy.actions.export}
          </Button>
        </Box>
      </Box>

      <Box
        sx={{
          borderBottom: 1,
          borderColor: "divider",
          px: 1.5,
          py: 0.5,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
        }}
      >
        <Tabs
          value={activeTab}
          onChange={(_event, value: "assets" | "outputs") =>
            setActiveTab(value)
          }
          sx={{
            minHeight: appTokens.layout.tabsMinHeight,
            "& .MuiTab-root": {
              minHeight: appTokens.layout.tabsMinHeight,
              textTransform: "none",
              fontSize: appTokens.typography.fontSizes.body,
              minWidth: 0,
            },
          }}
        >
          <Tab value="assets" label={`Assets (${assets.length})`} />
          <Tab
            value="outputs"
            label={`Outputs (${outputs.length})`}
            disabled={outputs.length === 0}
          />
        </Tabs>
        <BrowserViewToggle
          compact
          ariaLabel={`${
            activeTab === "assets"
              ? appTokens.copy.labels.assets
              : appTokens.copy.labels.outputs
          } view`}
          view={view}
          onChange={setView}
        />
      </Box>

      <Box sx={{ flex: 1, overflowY: "auto" }}>
        {activeTab === "assets" ? (
          <AssetGrid
            assets={assets}
            pack={pack}
            view={view}
            refreshDetails={() => refreshDetails(pack.id)}
          />
        ) : (
          <OutputsList outputs={outputs} view={view} />
        )}
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
        onClose={() => setPublishDialogOpen(false)}
        onConfirm={async ({ title, shortName }) => {
          try {
            await onPublishLocalPack({
              packId: pack.id,
              title,
              shortName,
            });
            setPublishDialogOpen(false);
          } catch {
            // App-level Telegram failure handling keeps the dialog open for retry.
          }
        }}
      />
    </Box>
  );
}
