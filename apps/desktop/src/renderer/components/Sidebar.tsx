import { useState, useCallback, type MouseEvent } from "react";
import AddIcon from "@mui/icons-material/Add";
import ManageAccountsIcon from "@mui/icons-material/ManageAccounts";
import DeleteIcon from "@mui/icons-material/Delete";
import DriveFileMoveIcon from "@mui/icons-material/DriveFileMove";
import EditIcon from "@mui/icons-material/Edit";
import ComputerIcon from "@mui/icons-material/Computer";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import IosShareIcon from "@mui/icons-material/IosShare";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import PhotoIcon from "@mui/icons-material/Photo";
import SyncIcon from "@mui/icons-material/Sync";
import TelegramIcon from "@mui/icons-material/Telegram";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemAvatar from "@mui/material/ListItemAvatar";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { StickerPack, TelegramState } from "@sticker-smith/shared";
import { appTokens } from "../../theme/appTokens";
import { isVideoPath } from "../utils/pathDisplay";
import { toFileUrl } from "../utils/fileUrl";
import { formatTelegramSyncStateLabel } from "../utils/telegramSyncState";
import {
  browserMenuIconSx,
  browserMenuPaperSx,
  browserMenuTitleSx,
} from "./browserStyles";
import { RenameDialog } from "./RenameDialog";
import { TelegramAuthDialog } from "./TelegramAuthDialog";

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

function PackThumbnailMedia({
  name,
  thumbnailPath,
}: {
  name: string;
  thumbnailPath: string;
}) {
  return (
    <Box
      {...packThumbnailMediaProps(name, thumbnailPath)}
      sx={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        display: "block",
      }}
    />
  );
}

function PackThumbnailFallback({ name }: { name: string }) {
  return (
    <Inventory2OutlinedIcon
      aria-label={`${name} fallback pack icon`}
      sx={{
        fontSize: appTokens.sizes.preview.fallbackIcon,
        color: "text.secondary",
      }}
    />
  );
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
          <PackThumbnailMedia name={name} thumbnailPath={thumbnailPath} />
        ) : (
          <PackThumbnailFallback name={name} />
        )}
      </Box>
    </ListItemAvatar>
  );
}

interface Props {
  packs: StickerPack[];
  telegramState: TelegramState | null;
  telegramSyncInProgress: boolean;
  telegramSyncRecommended: boolean;
  selectedPackId: string | null;
  width: number;
  onSelect: (id: string) => void;
  onSubmitTelegramTdlibParameters: (input: {
    apiId: string;
    apiHash: string;
  }) => Promise<unknown>;
  onSubmitTelegramPhoneNumber: (input: {
    phoneNumber: string;
  }) => Promise<unknown>;
  onSubmitTelegramCode: (input: { code: string }) => Promise<unknown>;
  onSubmitTelegramPassword: (input: { password: string }) => Promise<unknown>;
  onLogoutTelegram: () => Promise<unknown>;
  onResetTelegram: () => Promise<unknown>;
  onSyncTelegramPacks: () => Promise<unknown>;
  refreshPacks: () => Promise<StickerPack[]>;
  setSelectedPackId: (id: string | null) => void;
}

function statusLabelForTelegram(state: TelegramState | null) {
  if (!state) {
    return appTokens.copy.labels.telegramDisconnected;
  }

  if (state.status === "connected") {
    return appTokens.copy.labels.telegramConnected;
  }

  if (state.authStep === "wait_code") {
    return appTokens.copy.labels.telegramNeedsCode;
  }

  if (state.authStep === "wait_password") {
    return appTokens.copy.labels.telegramNeedsPassword;
  }

  if (state.status === "awaiting_credentials") {
    return appTokens.copy.labels.telegramNeedsCredentials;
  }

  return appTokens.copy.labels.telegramDisconnected;
}

function shortNameLabelForPack(pack: StickerPack) {
  return pack.telegramShortName ?? appTokens.copy.labels.telegramShortNameUnset;
}

function secondaryLabelForPack(pack: StickerPack) {
  const shortNameLabel =
    pack.source === "telegram"
      ? (pack.telegram?.shortName ??
        appTokens.copy.labels.telegramShortNameUnset)
      : shortNameLabelForPack(pack);

  if (pack.source === "telegram" && pack.telegram?.syncState) {
    return `${shortNameLabel} · ${formatTelegramSyncStateLabel(pack.telegram.syncState)}`;
  }

  return shortNameLabel;
}

function emptyTelegramStateLabel(options: { telegramSyncBusy: boolean }) {
  if (options.telegramSyncBusy) {
    return appTokens.copy.labels.telegramSyncInProgress;
  }

  return appTokens.copy.emptyStates.noTelegramPacks;
}

type SidebarPackFilter = "local" | "telegram";

type PackContextMenuState = {
  mouseX: number;
  mouseY: number;
  pack: StickerPack;
} | null;

function getSidebarPackGroups(packs: StickerPack[]) {
  const localPacks = packs.filter((pack) => pack.source === "local");
  const telegramPacks = packs.filter(
    (pack) =>
      pack.source === "telegram" && pack.telegram?.syncState !== "unsupported",
  );
  const unsupportedTelegramPacks = packs.filter(
    (pack) =>
      pack.source === "telegram" && pack.telegram?.syncState === "unsupported",
  );

  return { localPacks, telegramPacks, unsupportedTelegramPacks };
}

function getSidebarLabels(options: {
  telegramPacks: StickerPack[];
  telegramSyncBusy: boolean;
  telegramSyncRecommended: boolean;
  telegramState: TelegramState | null;
}) {
  const syncActionLabel = options.telegramSyncBusy
    ? appTokens.copy.labels.telegramSyncInProgress
    : options.telegramSyncRecommended
      ? "Sync needed"
      : options.telegramPacks.length > 0
        ? appTokens.copy.actions.resync
        : appTokens.copy.actions.sync;
  const telegramManageLabel =
    options.telegramState?.status === "connected"
      ? appTokens.copy.actions.manageTelegram
      : appTokens.copy.actions.connectTelegram;

  return { syncActionLabel, telegramManageLabel };
}

function getVisiblePacks(options: {
  activePackFilter: SidebarPackFilter;
  localPacks: StickerPack[];
  telegramPacks: StickerPack[];
  unsupportedTelegramPacks: StickerPack[];
  showUnsupportedTelegram: boolean;
}) {
  if (options.activePackFilter === "local") {
    return options.localPacks;
  }

  return options.showUnsupportedTelegram
    ? [...options.telegramPacks, ...options.unsupportedTelegramPacks]
    : options.telegramPacks;
}

function SidebarHeader() {
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

function PackSourceFilter({
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

function PackList({
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
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            px: 2,
            py: 1.5,
            fontSize: appTokens.typography.fontSizes.body,
          }}
        >
          {emptyState}
        </Typography>
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
            <PackThumbnail name={pack.name} thumbnailPath={pack.thumbnailPath} />
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

function UnsupportedTelegramToggle({ show, onToggle }: { show: boolean; onToggle: () => void }) {
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
          primary={show ? "Hide unsupported stickers" : "Show unsupported stickers"}
          primaryTypographyProps={{
            variant: "caption",
            color: "text.secondary",
            align: "left",
            sx: { fontSize: appTokens.typography.fontSizes.caption },
          }}
        />
        <Tooltip title="Sticker Smith currently supports video stickers only.">
          <HelpOutlineIcon sx={{ ml: 0.5, fontSize: 16, color: "text.secondary" }} />
        </Tooltip>
      </ListItemButton>
    </Box>
  );
}

function SidebarFooter({
  syncActionLabel,
  telegramReady,
  telegramSyncBusy,
  telegramSyncRecommended,
  onImportDir,
  onCreatePack,
  onOpenTelegramMenu,
  onSyncTelegramPacks,
}: {
  syncActionLabel: string;
  telegramReady: boolean;
  telegramSyncBusy: boolean;
  telegramSyncRecommended: boolean;
  onImportDir: () => void;
  onCreatePack: () => void;
  onOpenTelegramMenu: (event: MouseEvent<HTMLElement>) => void;
  onSyncTelegramPacks: () => Promise<unknown>;
}) {
  return (
    <Box
      component="footer"
      sx={{
        px: appTokens.layout.spacing.sidebarPaddingX,
        py: appTokens.layout.spacing.panelPaddingY,
        minHeight: appTokens.layout.panelHeaderMinHeight,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: appTokens.layout.spacing.compactGap,
      }}
    >
      <Tooltip title={appTokens.copy.labels.importFolderAsNewPack}>
        <IconButton size="small" onClick={onImportDir}>
          <DriveFileMoveIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title={appTokens.copy.actions.newPack}>
        <IconButton size="small" onClick={onCreatePack}>
          <AddIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title={appTokens.copy.labels.telegramAccount}>
        <IconButton
          size="small"
          aria-label={appTokens.copy.labels.telegramAccount}
          onClick={onOpenTelegramMenu}
          sx={{ color: telegramReady ? "text.secondary" : "error.main" }}
        >
          <ManageAccountsIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title={syncActionLabel}>
        <span>
          <IconButton
            size="small"
            aria-label={syncActionLabel}
            disabled={!telegramReady || telegramSyncBusy}
            onClick={() => void onSyncTelegramPacks().catch(() => undefined)}
          >
            <SyncIcon
              fontSize="small"
              sx={{
                color:
                  telegramSyncRecommended && telegramReady && !telegramSyncBusy
                    ? "error.main"
                    : "text.secondary",
                animation: telegramSyncBusy
                  ? "telegram-sync-spin 1s linear infinite"
                  : "none",
                "@keyframes telegram-sync-spin": {
                  from: { transform: "rotate(0deg)" },
                  to: { transform: "rotate(360deg)" },
                },
              }}
            />
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );
}

function PackContextMenu({
  contextMenu,
  onClose,
  onRename,
  onOpenStickers,
  onChooseIcon,
  onExportStickers,
  onDelete,
}: {
  contextMenu: { mouseX: number; mouseY: number; pack: StickerPack } | null;
  onClose: () => void;
  onRename: () => void;
  onOpenStickers: () => void;
  onChooseIcon: () => void;
  onExportStickers: () => void;
  onDelete: () => void;
}) {
  return (
    <Menu
      open={Boolean(contextMenu)}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={contextMenu ? { top: contextMenu.mouseY, left: contextMenu.mouseX } : undefined}
      slotProps={{ paper: { sx: browserMenuPaperSx } }}
    >
      {contextMenu && <MenuItem disabled dense sx={browserMenuTitleSx}>{contextMenu.pack.name}</MenuItem>}
      <Divider />
      <MenuItem onClick={onRename} dense><EditIcon sx={browserMenuIconSx} />{appTokens.copy.actions.rename}</MenuItem>
      <MenuItem onClick={onOpenStickers} dense><FolderOpenIcon sx={browserMenuIconSx} />{appTokens.copy.actions.openFolder}</MenuItem>
      <MenuItem onClick={onChooseIcon} dense><PhotoIcon sx={browserMenuIconSx} />Change icon</MenuItem>
      <MenuItem onClick={onExportStickers} dense><IosShareIcon sx={browserMenuIconSx} />{appTokens.copy.actions.export}</MenuItem>
      <MenuItem onClick={onDelete} dense sx={{ color: "error.light" }}><DeleteIcon sx={browserMenuIconSx} />{appTokens.copy.actions.delete}</MenuItem>
    </Menu>
  );
}

function TelegramAccountMenu({
  anchorEl,
  telegramState,
  telegramManageLabel,
  onClose,
  onManage,
  onLogoutTelegram,
  onResetTelegram,
}: {
  anchorEl: HTMLElement | null;
  telegramState: TelegramState | null;
  telegramManageLabel: string;
  onClose: () => void;
  onManage: () => void;
  onLogoutTelegram: () => Promise<unknown>;
  onResetTelegram: () => Promise<unknown>;
}) {
  return (
    <Menu
      anchorEl={anchorEl}
      open={Boolean(anchorEl)}
      onClose={onClose}
      slotProps={{ paper: { sx: { minWidth: appTokens.sizes.menu.telegram } } }}
    >
      <MenuItem disabled dense sx={browserMenuTitleSx}>{statusLabelForTelegram(telegramState)}</MenuItem>
      {telegramState?.sessionUser ? (
        <MenuItem disabled dense sx={{ opacity: "1 !important", fontSize: appTokens.typography.fontSizes.caption, color: "text.secondary" }}>
          {telegramState.sessionUser.username
            ? `${telegramState.sessionUser.displayName} (@${telegramState.sessionUser.username})`
            : telegramState.sessionUser.displayName}
        </MenuItem>
      ) : null}
      <Divider />
      <MenuItem onClick={onManage} dense><ManageAccountsIcon sx={browserMenuIconSx} />{telegramManageLabel}</MenuItem>
      {telegramState?.status === "connected" ? (
        <MenuItem onClick={() => { onClose(); void onLogoutTelegram().catch(() => undefined); }} dense>
          {appTokens.copy.actions.logout}
        </MenuItem>
      ) : (
        <MenuItem onClick={() => { onClose(); void onResetTelegram().catch(() => undefined); }} dense>
          {appTokens.copy.actions.resetTelegram}
        </MenuItem>
      )}
    </Menu>
  );
}

function usePackContextHandlers({
  contextMenu,
  refreshPacks,
  selectedPackId,
  setSelectedPackId,
  setContextMenu,
  setRenamePack,
}: {
  contextMenu: PackContextMenuState;
  refreshPacks: () => Promise<StickerPack[]>;
  selectedPackId: string | null;
  setSelectedPackId: (id: string | null) => void;
  setContextMenu: (menu: PackContextMenuState) => void;
  setRenamePack: (pack: StickerPack | null) => void;
}) {
  const handleContextMenu = useCallback((e: MouseEvent, pack: StickerPack) => {
    e.preventDefault();
    setContextMenu({ mouseX: e.clientX, mouseY: e.clientY, pack });
  }, [setContextMenu]);
  const handleCloseMenu = useCallback(() => setContextMenu(null), [setContextMenu]);
  const handleRenameOpen = useCallback(() => {
    if (!contextMenu) return;
    setRenamePack(contextMenu.pack);
    handleCloseMenu();
  }, [contextMenu, handleCloseMenu, setRenamePack]);
  const runContextPackAction = useCallback(
    async (action: (pack: StickerPack) => Promise<void>) => {
      if (!contextMenu) return;
      const { pack } = contextMenu;
      handleCloseMenu();
      await action(pack);
    },
    [contextMenu, handleCloseMenu],
  );
  const handleChooseIcon = useCallback(
    async () => runContextPackAction(async (pack) => {
      if (pack.thumbnailPath) {
        const confirmed = window.confirm(
          "Replace this pack's existing icon? The pack will need a Telegram update after the new icon is converted.",
        );
        if (!confirmed) return;
      }
      await window.stickerSmith.packs.chooseIcon({ packId: pack.id });
      await refreshPacks();
    }),
    [refreshPacks, runContextPackAction],
  );
  const handleDelete = useCallback(
    async () => runContextPackAction(async (pack) => {
      await window.stickerSmith.packs.delete({ packId: pack.id });
      const next = await refreshPacks();
      if (selectedPackId === pack.id) setSelectedPackId(next[0]?.id ?? null);
    }),
    [refreshPacks, runContextPackAction, selectedPackId, setSelectedPackId],
  );
  const handleOpenStickers = useCallback(
    async () => runContextPackAction(async (pack) => {
      await window.stickerSmith.stickers.revealInFolder({ packId: pack.id });
    }),
    [runContextPackAction],
  );
  const handleExportStickers = useCallback(
    async () => runContextPackAction(async (pack) => {
      await window.stickerSmith.stickers.exportFolder({ packId: pack.id });
    }),
    [runContextPackAction],
  );

  return {
    handleContextMenu,
    handleCloseMenu,
    handleRenameOpen,
    handleChooseIcon,
    handleDelete,
    handleOpenStickers,
    handleExportStickers,
  };
}

function useSidebarModel({
  packs,
  telegramState,
  telegramSyncInProgress,
  telegramSyncRecommended,
  selectedPackId,
  refreshPacks,
  setSelectedPackId,
}: Props) {
  const groups = getSidebarPackGroups(packs);
  const { localPacks, telegramPacks, unsupportedTelegramPacks } = groups;
  const telegramSyncBusy = telegramSyncInProgress || telegramPacks.some((pack) => pack.telegram?.syncState === "syncing");
  const telegramReady = telegramState?.status === "connected" && telegramState.authStep === "ready";
  const [contextMenu, setContextMenu] = useState<PackContextMenuState>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [renamePack, setRenamePack] = useState<StickerPack | null>(null);
  const [telegramDialogOpen, setTelegramDialogOpen] = useState(false);
  const [activePackFilter, setActivePackFilter] = useState<SidebarPackFilter>("telegram");
  const [showUnsupportedTelegram, setShowUnsupportedTelegram] = useState(false);
  const [telegramMenuAnchor, setTelegramMenuAnchor] = useState<HTMLElement | null>(null);
  const labels = getSidebarLabels({ telegramPacks, telegramSyncBusy, telegramSyncRecommended, telegramState });
  const visiblePacks = getVisiblePacks({ activePackFilter, localPacks, telegramPacks, unsupportedTelegramPacks, showUnsupportedTelegram });
  const emptyState = activePackFilter === "local" ? appTokens.copy.emptyStates.noLocalPacks : emptyTelegramStateLabel({ telegramSyncBusy });
  const contextHandlers = usePackContextHandlers({ contextMenu, refreshPacks, selectedPackId, setContextMenu, setRenamePack, setSelectedPackId });
  const handleCreate = async (name: string) => {
    const pack = await window.stickerSmith.packs.create({ name });
    await refreshPacks();
    setSelectedPackId(pack.id);
    setCreateDialogOpen(false);
  };
  const handleImportDir = async () => {
    const result = await window.stickerSmith.packs.createFromDirectory();
    if (result) {
      await refreshPacks();
      setSelectedPackId(result.pack.id);
    }
  };
  const handleRenameConfirm = async (name: string) => {
    if (!renamePack) return;
    await window.stickerSmith.packs.rename({ packId: renamePack.id, name });
    await refreshPacks();
    setRenamePack(null);
  };

  return {
    ...groups,
    ...labels,
    ...contextHandlers,
    activePackFilter,
    contextMenu,
    createDialogOpen,
    emptyState,
    handleCreate,
    handleImportDir,
    handleRenameConfirm,
    renamePack,
    setActivePackFilter,
    setCreateDialogOpen,
    setRenamePack,
    setShowUnsupportedTelegram,
    setTelegramDialogOpen,
    setTelegramMenuAnchor,
    showUnsupportedTelegram,
    telegramDialogOpen,
    telegramMenuAnchor,
    telegramReady,
    telegramSyncBusy,
    visiblePacks,
  };
}

type SidebarModel = ReturnType<typeof useSidebarModel>;

function SidebarDialogs({ model, props }: { model: SidebarModel; props: Props }) {
  return (
    <>
      <RenameDialog open={model.createDialogOpen} title={appTokens.copy.dialogs.newPack} label={appTokens.copy.dialogs.packName} initialValue="" onConfirm={model.handleCreate} onClose={() => model.setCreateDialogOpen(false)} />
      {model.renamePack && <RenameDialog open title={appTokens.copy.dialogs.renamePack} initialValue={model.renamePack.name} onConfirm={model.handleRenameConfirm} onClose={() => model.setRenamePack(null)} />}
      <TelegramAuthDialog
        open={model.telegramDialogOpen}
        state={props.telegramState}
        onClose={() => model.setTelegramDialogOpen(false)}
        onSubmitTdlibParameters={props.onSubmitTelegramTdlibParameters}
        onSubmitPhoneNumber={props.onSubmitTelegramPhoneNumber}
        onSubmitCode={props.onSubmitTelegramCode}
        onSubmitPassword={props.onSubmitTelegramPassword}
      />
    </>
  );
}

function SidebarMenus({ model, props }: { model: SidebarModel; props: Props }) {
  return (
    <>
      <PackContextMenu contextMenu={model.contextMenu} onClose={model.handleCloseMenu} onRename={model.handleRenameOpen} onOpenStickers={model.handleOpenStickers} onChooseIcon={model.handleChooseIcon} onExportStickers={model.handleExportStickers} onDelete={model.handleDelete} />
      <TelegramAccountMenu
        anchorEl={model.telegramMenuAnchor}
        telegramState={props.telegramState}
        telegramManageLabel={model.telegramManageLabel}
        onClose={() => model.setTelegramMenuAnchor(null)}
        onManage={() => {
          model.setTelegramMenuAnchor(null);
          model.setTelegramDialogOpen(true);
        }}
        onLogoutTelegram={props.onLogoutTelegram}
        onResetTelegram={props.onResetTelegram}
      />
    </>
  );
}

function SidebarBody({ model, props }: { model: SidebarModel; props: Props }) {
  return (
    <>
      <SidebarHeader />
      <PackSourceFilter activePackFilter={model.activePackFilter} onChange={model.setActivePackFilter} />
      <PackList packs={model.visiblePacks} emptyState={model.emptyState} selectedPackId={props.selectedPackId} onSelect={props.onSelect} onContextMenu={model.handleContextMenu} />
      {model.activePackFilter === "telegram" && model.unsupportedTelegramPacks.length > 0 ? (
        <UnsupportedTelegramToggle show={model.showUnsupportedTelegram} onToggle={() => model.setShowUnsupportedTelegram((show) => !show)} />
      ) : null}
      <Divider />
      <SidebarFooter syncActionLabel={model.syncActionLabel} telegramReady={model.telegramReady} telegramSyncBusy={model.telegramSyncBusy} telegramSyncRecommended={props.telegramSyncRecommended} onImportDir={model.handleImportDir} onCreatePack={() => model.setCreateDialogOpen(true)} onOpenTelegramMenu={(event) => model.setTelegramMenuAnchor(event.currentTarget)} onSyncTelegramPacks={props.onSyncTelegramPacks} />
    </>
  );
}

export function Sidebar(props: Props) {
  const model = useSidebarModel(props);

  return (
    <Box sx={{ width: props.width, flexShrink: 0, display: "flex", flexDirection: "column", bgcolor: "background.paper", borderRight: 1, borderColor: "divider", height: "100%" }}>
      <SidebarBody model={model} props={props} />
      <SidebarMenus model={model} props={props} />
      <SidebarDialogs model={model} props={props} />
    </Box>
  );
}
