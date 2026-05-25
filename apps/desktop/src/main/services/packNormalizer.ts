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

export const compareAssetsByOrder = compareStickersByOrder;

export function compactStickerOrders(record: StickerPackRecord) {
  const stickers = [...record.stickers].sort(compareStickersByOrder);

  stickers.forEach((sticker, index) => {
    sticker.order = index;
  });
}

export function syncOutputOrders(_record: StickerPackRecord) {
  // Compatibility no-op while renderer/service APIs are renamed from assets/outputs.
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

export function enforcePackOutputRoleInvariants(_record: StickerPackRecord) {
  return [];
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

export function normalizePackRecord(
  record:
    | (Partial<StickerPackRecord> & {
        source?: PackSource;
        stickers?: Array<Partial<StickerPackRecord["stickers"][number]>>;
      assets?: Array<Partial<StickerPackRecord["assets"][number]>>;
      outputs?: Array<Partial<StickerPackRecord["outputs"][number]>>;
      })
    | null
    | undefined,
): StickerPackRecord {
  const now = nowIso();
  const source = record?.source ?? "local";
  const id = record?.id ?? randomUUID();
  const normalized: StickerPackRecord = {
    schemaVersion: 4,
    id,
    source,
    name: record?.name ?? "Untitled Pack",
    slug: record?.slug ?? slugify(record?.name ?? "Untitled Pack"),
    iconStickerId: record?.iconStickerId ?? null,
    iconAssetId: record?.iconAssetId ?? record?.iconStickerId ?? null,
    telegramShortName: record?.telegramShortName ?? null,
    telegram:
      source === "telegram" && record?.telegram
        ? createDefaultTelegramSummary(record.telegram)
        : undefined,
    createdAt: record?.createdAt ?? now,
    updatedAt: record?.updatedAt ?? now,
    assets: [],
    outputs: [],
    stickers: (record?.stickers ?? []).map((sticker, index) => ({
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
      downloadState:
        sticker.downloadState ?? (source === "telegram" ? "missing" : "ready"),
      telegram: sticker.telegram,
    })),
  };

  if (
    normalized.iconStickerId !== null &&
    !normalized.stickers.some((sticker) => sticker.id === normalized.iconStickerId)
  ) {
    normalized.iconStickerId = null;
  }

  normalized.iconAssetId = normalized.iconAssetId ?? normalized.iconStickerId;
  normalized.assets = normalized.stickers.map((sticker) => ({
    id: sticker.id,
    packId: sticker.packId,
    order: sticker.order,
    relativePath: sticker.relativePath,
    originalFileName: sticker.originalFileName,
    emojiList: sticker.emojiList,
    kind: "webm",
    importedAt: sticker.importedAt,
    originalImportPath: null,
    downloadState: sticker.downloadState ?? "ready",
    telegram: sticker.telegram,
  }));
  normalized.assets.push(
    ...(record?.assets ?? [])
      .filter((asset) => asset.id && normalized.stickers.every((sticker) => sticker.id !== asset.id))
      .map((asset, index) => ({
        id: asset.id!,
        packId: asset.packId ?? normalized.id,
        order: asset.order ?? normalized.stickers.length + index,
        relativePath: asset.relativePath ?? `${asset.id}.webm`,
        originalFileName: asset.originalFileName ?? null,
        emojiList: asset.emojiList ?? [],
        kind: asset.kind ?? "webm",
        importedAt: asset.importedAt ?? now,
        originalImportPath: asset.originalImportPath ?? null,
        downloadState: asset.downloadState ?? "ready",
        telegram: asset.telegram,
      })),
  );
  normalized.outputs = normalized.stickers.map((sticker) => ({
    packId: sticker.packId,
    sourceAssetId: sticker.id,
    order: sticker.order,
    mode: "sticker",
    relativePath: sticker.relativePath,
    sizeBytes: sticker.sizeBytes,
    sha256: sticker.sha256,
    updatedAt: sticker.updatedAt,
  }));

  normalized.outputs.push(
    ...(record?.outputs ?? []).filter((output) =>
      normalized.stickers.every((sticker) => sticker.id !== output.sourceAssetId),
    ),
  );

  compactStickerOrders(normalized);
  sortPackRecord(normalized);
  return normalized;
}
