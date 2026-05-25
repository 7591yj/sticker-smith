import { randomUUID } from "node:crypto";

import type {
  PackSource,
  StickerItem,
  StickerPackRecord,
  TelegramPackSummary,
} from "@sticker-smith/shared";

import { nowIso } from "../utils/timeUtils";

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

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "pack"
  );
}

export function normalizePackRecord(record: Partial<StickerPackRecord> | null | undefined): StickerPackRecord {
  const now = nowIso();
  const source = record?.source ?? "local";
  const id = record?.id ?? randomUUID();

  const stickers = (record?.stickers ?? []).map((sticker, index) => ({
    id: sticker.id ?? randomUUID(),
    packId: sticker.packId ?? id,
    order: sticker.order ?? index,
    relativePath: sticker.relativePath ?? `${sticker.id ?? randomUUID()}.webm`,
    originalFileName: sticker.originalFileName ?? null,
    emojiList: sticker.emojiList ?? [],
    sizeBytes: sticker.sizeBytes ?? 0,
    sha256: sticker.sha256 ?? null,
    importedAt: sticker.importedAt ?? now,
    updatedAt: sticker.updatedAt ?? now,
    downloadState: sticker.downloadState ?? (source === "telegram" ? "missing" : "ready"),
    telegram: sticker.telegram,
  }));

  const normalized: StickerPackRecord = {
    schemaVersion: 4,
    id,
    source,
    name: record?.name ?? "Untitled Pack",
    slug: record?.slug ?? slugify(record?.name ?? "Untitled Pack"),
    iconStickerId: record?.iconStickerId ?? null,
    telegramShortName: record?.telegramShortName ?? null,
    telegram: source === "telegram" && record?.telegram ? createDefaultTelegramSummary(record.telegram) : undefined,
    createdAt: record?.createdAt ?? now,
    updatedAt: record?.updatedAt ?? now,
    stickers,
  };

  if (normalized.iconStickerId && !normalized.stickers.some((sticker) => sticker.id === normalized.iconStickerId)) {
    normalized.iconStickerId = null;
  }
  compactStickerOrders(normalized);
  sortPackRecord(normalized);
  return normalized;
}
