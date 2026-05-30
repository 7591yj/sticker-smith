import { describeTdlibError } from "../telegramAuthService";
import type { TelegramRemoteStickerSet } from "../telegramTdlibService";
import type { TelegramSyncServiceOptions } from "./types";

export async function runOwnedPackSync(
  options: TelegramSyncServiceOptions,
  syncRemoteStickerSet: (
    stickerSet: TelegramRemoteStickerSet,
  ) => Promise<string>,
): Promise<void> {
  await options.auth.requireConnectedState();
  options.emit({ type: "sync_started" });

  const stickerSets = await options.auth.tdlibService.getOwnedStickerSets();
  const packIds = await syncOwnedStickerSets(
    options,
    stickerSets,
    syncRemoteStickerSet,
  );
  await deleteUnownedTelegramPacks(
    options,
    new Set(stickerSets.map((set) => set.stickerSetId)),
  );

  options.emit({ type: "sync_finished", packIds });
}

async function syncOwnedStickerSets(
  options: TelegramSyncServiceOptions,
  stickerSets: TelegramRemoteStickerSet[],
  syncRemoteStickerSet: (
    stickerSet: TelegramRemoteStickerSet,
  ) => Promise<string>,
) {
  const packIds: string[] = [];

  for (const stickerSet of stickerSets) {
    try {
      packIds.push(await syncRemoteStickerSet(stickerSet));
    } catch (error) {
      await markOwnedPackSyncFailed(options, stickerSet, error);
    }
  }

  return packIds;
}

async function markOwnedPackSyncFailed(
  options: TelegramSyncServiceOptions,
  stickerSet: TelegramRemoteStickerSet,
  error: unknown,
) {
  const existing = await options.libraryService.findPackByTelegramStickerSetId(
    stickerSet.stickerSetId,
  );
  const message = describeTdlibError(error);

  if (existing) {
    await options.mirrorService.markPackSyncState(
      existing.record.id,
      "error",
      message,
    );
  }
  options.emit({
    type: "pack_sync_failed",
    packId: existing?.record.id ?? null,
    stickerSetId: stickerSet.stickerSetId,
    error: message,
  });
}

async function deleteUnownedTelegramPacks(
  options: TelegramSyncServiceOptions,
  stickerSetIds: Set<string>,
) {
  const existingTelegramPacks = (
    await options.libraryService.listPacks()
  ).filter((pack) => pack.source === "telegram");
  await Promise.all(
    existingTelegramPacks
      .filter((pack) => {
        const stickerSetId = pack.telegram?.stickerSetId;
        return stickerSetId ? !stickerSetIds.has(stickerSetId) : false;
      })
      .map((pack) => options.libraryService.deletePack({ packId: pack.id })),
  );
}
