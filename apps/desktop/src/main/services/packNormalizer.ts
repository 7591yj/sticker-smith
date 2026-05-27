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

const defaultTelegramSummaryFields = {
  shortName: "",
  title: "",
  format: "video",
  thumbnailPath: null,
  syncState: "idle",
  lastSyncedAt: null,
  lastSyncError: null,
  publishedFromLocalPackId: null,
} satisfies Omit<TelegramPackSummary, "stickerSetId">;

function definedTelegramSummaryOverrides(
  overrides: Partial<TelegramPackSummary>,
): Partial<TelegramPackSummary> {
  return Object.fromEntries(
    Object.entries(overrides).filter(([, value]) => value !== undefined),
  ) as Partial<TelegramPackSummary>;
}

export function createDefaultTelegramSummary(
  overrides: Partial<TelegramPackSummary> & Pick<TelegramPackSummary, "stickerSetId">,
): TelegramPackSummary {
  return {
    stickerSetId: overrides.stickerSetId,
    ...defaultTelegramSummaryFields,
    ...definedTelegramSummaryOverrides(overrides),
  };
}

