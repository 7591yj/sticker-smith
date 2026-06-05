import { useCallback } from "react";
import type { PackPanelProps } from "./types";

type UsePackPanelActionsInput = Pick<
  PackPanelProps,
  | "details"
  | "setDetails"
  | "refreshDetails"
  | "refreshPacks"
  | "setSelectedPackId"
> & {
  packId: string | null;
  setRenaming: (open: boolean) => void;
};

type PackActionRunner = (
  action: (currentPackId: string) => Promise<unknown>,
) => Promise<void>;
type ImportResult = Awaited<
  ReturnType<typeof window.stickerSmith.stickers.importFiles>
>;

function usePackActionRunner(packId: string | null) {
  return useCallback<PackActionRunner>(
    async (action) => {
      if (!packId) return;
      await action(packId);
    },
    [packId],
  );
}

function useStickerImportActions(
  runPackAction: PackActionRunner,
  refreshDetails: PackPanelProps["refreshDetails"],
  setDetails: PackPanelProps["setDetails"],
) {
  const convertImportedStickers = useCallback(
    async (importResult: ImportResult, currentPackId: string) => {
      const stickerIds = importResult.imported.map((sticker) => sticker.id);
      if (stickerIds.length === 0) {
        await refreshDetails(currentPackId);
        return;
      }
      const next = await window.stickerSmith.conversion.convert({
        packId: currentPackId,
        stickerIds,
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
      await convertImportedStickers(importResult, currentPackId);
    });
  }, [convertImportedStickers, runPackAction]);

  const handleImportDir = useCallback(async () => {
    await runPackAction(async (currentPackId) => {
      const importResult = await window.stickerSmith.stickers.importDirectory({
        packId: currentPackId,
      });
      await convertImportedStickers(importResult, currentPackId);
    });
  }, [convertImportedStickers, runPackAction]);

  return { handleImportFiles, handleImportDir };
}

function useStickerFolderActions(runPackAction: PackActionRunner) {
  const handleOpenStickers = useCallback(async () => {
    await runPackAction((currentPackId) =>
      window.stickerSmith.stickers.revealInFolder({ packId: currentPackId }),
    );
  }, [runPackAction]);
  const handleExportStickers = useCallback(async () => {
    await runPackAction((currentPackId) =>
      window.stickerSmith.stickers.exportFolder({ packId: currentPackId }),
    );
  }, [runPackAction]);
  return { handleOpenStickers, handleExportStickers };
}

function usePackManagementActions({
  details,
  setDetails,
  refreshDetails,
  refreshPacks,
  setSelectedPackId,
  setRenaming,
}: Omit<UsePackPanelActionsInput, "packId">) {
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
    [details, refreshPacks, refreshDetails, setRenaming],
  );

  const handleChooseIcon = useCallback(async () => {
    if (!details) return;
    const nextDetails = await window.stickerSmith.packs.chooseIcon({
      packId: details.pack.id,
    });
    if (!nextDetails) return;
    setDetails(nextDetails);
    await refreshPacks();
  }, [details, refreshPacks, setDetails]);

  return { handleDelete, handleRename, handleChooseIcon };
}

export function usePackPanelActions({
  details,
  packId,
  setDetails,
  refreshDetails,
  refreshPacks,
  setSelectedPackId,
  setRenaming,
}: UsePackPanelActionsInput) {
  const runPackAction = usePackActionRunner(packId);
  const importActions = useStickerImportActions(
    runPackAction,
    refreshDetails,
    setDetails,
  );
  const folderActions = useStickerFolderActions(runPackAction);
  const managementActions = usePackManagementActions({
    details,
    setDetails,
    refreshDetails,
    refreshPacks,
    setSelectedPackId,
    setRenaming,
  });

  return { ...importActions, ...folderActions, ...managementActions };
}

export type PackPanelActions = ReturnType<typeof usePackPanelActions>;
