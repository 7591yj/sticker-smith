import { useState, useCallback, useEffect } from "react";
import AddIcon from "@mui/icons-material/Add";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import IosShareIcon from "@mui/icons-material/IosShare";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { StickerPack, StickerPackDetails } from "@sticker-smith/shared";
import { appTokens } from "../../theme/appTokens";
import { AssetGrid } from "./AssetGrid";
import { OutputsList } from "./OutputsList";
import { RenameDialog } from "./RenameDialog";

interface Props {
  details: StickerPackDetails | null;
  converting: boolean;
  setDetails: (d: StickerPackDetails | null) => void;
  refreshDetails: (packId: string) => Promise<StickerPackDetails>;
  refreshPacks: () => Promise<StickerPack[]>;
  setSelectedPackId: (id: string | null) => void;
}

export function PackPanel({
  details,
  converting,
  setDetails,
  refreshDetails,
  refreshPacks,
  setSelectedPackId,
}: Props) {
  const [renaming, setRenaming] = useState(false);
  const [activeTab, setActiveTab] = useState<"assets" | "outputs">("assets");

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

  const handleExportOutputs = useCallback(async () => {
    if (!details) return;
    await window.stickerSmith.outputs.exportFolder({
      packId: details.pack.id,
    });
  }, [details]);

  const handleDelete = useCallback(async () => {
    if (!details) return;
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
        <Typography
          variant="subtitle1"
          fontWeight={appTokens.typography.fontWeights.medium}
          sx={{ flex: 1, fontSize: appTokens.typography.fontSizes.subtitle }}
          noWrap
        >
          {pack.name}
        </Typography>

        <Tooltip title={appTokens.copy.tooltips.rename}>
          <IconButton size="small" onClick={() => setRenaming(true)}>
            <EditIcon sx={{ fontSize: appTokens.sizes.panelActionIcon }} />
          </IconButton>
        </Tooltip>
        <Tooltip title={appTokens.copy.tooltips.deletePack}>
          <IconButton size="small" onClick={handleDelete} color="error">
            <DeleteIcon sx={{ fontSize: appTokens.sizes.panelActionIcon }} />
          </IconButton>
        </Tooltip>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.75 }} />

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
      </Box>

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

      <Box sx={{ borderBottom: 1, borderColor: "divider", px: 1.5 }}>
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
      </Box>

      <Box sx={{ flex: 1, overflowY: "auto" }}>
        {activeTab === "assets" ? (
          <AssetGrid
            assets={assets}
            pack={pack}
            refreshDetails={() => refreshDetails(pack.id)}
          />
        ) : (
          <OutputsList outputs={outputs} packId={pack.id} />
        )}
      </Box>

      <RenameDialog
        open={renaming}
        title={appTokens.copy.dialogs.renamePack}
        initialValue={pack.name}
        onConfirm={handleRename}
        onClose={() => setRenaming(false)}
      />
    </Box>
  );
}
