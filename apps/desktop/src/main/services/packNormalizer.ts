import type { StickerItem, StickerPackRecord, TelegramPackSummary } from "@sticker-smith/shared";

export function compareStickersByOrder(
  left: Pick<StickerItem, "id" | "order" | "importedAt">,
  right: Pick<StickerItem, "id" | "order" | "importedAt">,
) {
  return (
    left.order - right.order ||
    left.importedAt.localeCompare(right.importedAt) ||
    left.id.localeCompare(right.id)
  );
}

export function compactStickerOrders(record: StickerPackRecord) {
  [...record.stickers]
    .sort(compareStickersByOrder)
    .forEach((sticker, index) => {
      sticker.order = index;
    });
}

export function sortPackRecord(record: StickerPackRecord) {
  record.stickers.sort(compareStickersByOrder);
}

export function createDefaultTelegramSummary(
  overrides: Partial<TelegramPackSummary> & Pick<TelegramPackSummary, "stickerSetId">,
): TelegramPackSummary {
  return {
    stickerSetId: overrides.stickerSetId,
    shortName: overrides.shortName ?? "",
    title: overrides.title ?? "",
    format: overrides.format ?? "video",
    thumbnailPath: overrides.thumbnailPath ?? null,
    syncState: overrides.syncState ?? "idle",
    lastSyncedAt: overrides.lastSyncedAt ?? null,
    lastSyncError: overrides.lastSyncError ?? null,
    publishedFromLocalPackId: overrides.publishedFromLocalPackId ?? null,
  };
}

