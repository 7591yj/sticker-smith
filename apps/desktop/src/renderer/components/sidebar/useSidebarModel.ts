import { useCallback, useState, type MouseEvent } from "react";
import type { StickerPack } from "@sticker-smith/shared";
import { appTokens } from "../../../theme/appTokens";
import {
  emptyTelegramStateLabel,
  getSidebarLabels,
  getSidebarPackGroups,
  getVisiblePacks,
} from "./sidebarModelUtils";
import type {
  PackContextMenuState,
  SidebarPackFilter,
  SidebarProps,
} from "./types";

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
  const handleContextMenu = useCallback(
    (e: MouseEvent, pack: StickerPack) => {
      e.preventDefault();
      setContextMenu({ mouseX: e.clientX, mouseY: e.clientY, pack });
    },
    [setContextMenu],
  );
  const handleCloseMenu = useCallback(
    () => setContextMenu(null),
    [setContextMenu],
  );
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
    async () =>
      runContextPackAction(async (pack) => {
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
    async () =>
      runContextPackAction(async (pack) => {
        await window.stickerSmith.packs.delete({ packId: pack.id });
        const next = await refreshPacks();
        if (selectedPackId === pack.id) setSelectedPackId(next[0]?.id ?? null);
      }),
    [refreshPacks, runContextPackAction, selectedPackId, setSelectedPackId],
  );
  const handleOpenStickers = useCallback(
    async () =>
      runContextPackAction(async (pack) => {
        await window.stickerSmith.stickers.revealInFolder({ packId: pack.id });
      }),
    [runContextPackAction],
  );
  const handleExportStickers = useCallback(
    async () =>
      runContextPackAction(async (pack) => {
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

export function useSidebarModel({
  packs,
  telegramState,
  telegramSyncInProgress,
  telegramSyncRecommended,
  selectedPackId,
  refreshPacks,
  setSelectedPackId,
}: SidebarProps) {
  const groups = getSidebarPackGroups(packs);
  const { localPacks, telegramPacks, unsupportedTelegramPacks } = groups;
  const telegramSyncBusy =
    telegramSyncInProgress ||
    telegramPacks.some((pack) => pack.telegram?.syncState === "syncing");
  const telegramReady =
    telegramState?.status === "connected" && telegramState.authStep === "ready";
  const [contextMenu, setContextMenu] = useState<PackContextMenuState>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [renamePack, setRenamePack] = useState<StickerPack | null>(null);
  const [telegramDialogOpen, setTelegramDialogOpen] = useState(false);
  const [activePackFilter, setActivePackFilter] =
    useState<SidebarPackFilter>("telegram");
  const [showUnsupportedTelegram, setShowUnsupportedTelegram] = useState(false);
  const [telegramMenuAnchor, setTelegramMenuAnchor] =
    useState<HTMLElement | null>(null);
  const labels = getSidebarLabels({
    telegramPacks,
    telegramSyncBusy,
    telegramSyncRecommended,
    telegramState,
  });
  const visiblePacks = getVisiblePacks({
    activePackFilter,
    localPacks,
    telegramPacks,
    unsupportedTelegramPacks,
    showUnsupportedTelegram,
  });
  const emptyState =
    activePackFilter === "local"
      ? appTokens.copy.emptyStates.noLocalPacks
      : emptyTelegramStateLabel({ telegramSyncBusy });
  const contextHandlers = usePackContextHandlers({
    contextMenu,
    refreshPacks,
    selectedPackId,
    setContextMenu,
    setRenamePack,
    setSelectedPackId,
  });
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

export type SidebarModel = ReturnType<typeof useSidebarModel>;
