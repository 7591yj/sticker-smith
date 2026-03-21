import { randomUUID } from "node:crypto";
import path from "node:path";

import type {
  PackSource,
  SourceAsset,
  StickerPackRecord,
  TelegramPackSummary,
} from "@sticker-smith/shared";

import { nowIso } from "../utils/timeUtils";

function getOriginalFileName(
  asset: Partial<StickerPackRecord["assets"][number]>,
) {
  if (asset.originalFileName !== undefined) {
    return asset.originalFileName;
  }

  if (asset.originalImportPath) {
    return path.basename(asset.originalImportPath);
  }

  if (asset.relativePath) {
    return path.basename(asset.relativePath);
  }

  return null;
}

export function compareAssetsByOrder(
  left: Pick<SourceAsset, "id" | "order" | "importedAt">,
  right: Pick<SourceAsset, "id" | "order" | "importedAt">,
) {
  return (
    left.order - right.order ||
    left.importedAt.localeCompare(right.importedAt) ||
    left.id.localeCompare(right.id)
  );
}

export function syncOutputOrders(record: StickerPackRecord) {
  const assetOrderById = new Map(record.assets.map((asset) => [asset.id, asset.order]));

  for (const output of record.outputs) {
    output.order = assetOrderById.get(output.sourceAssetId) ?? output.order ?? 0;
  }
}

export function compactStickerOrders(record: StickerPackRecord) {
  const stickerAssets = record.assets
    .filter((asset) => asset.id !== record.iconAssetId)
    .sort(compareAssetsByOrder);

  stickerAssets.forEach((asset, index) => {
    asset.order = index;
  });

  syncOutputOrders(record);
}

export function sortPackRecord(record: StickerPackRecord) {
  record.assets.sort((left, right) => {
    const leftIsIcon = left.id === record.iconAssetId;
    const rightIsIcon = right.id === record.iconAssetId;

    if (leftIsIcon !== rightIsIcon) {
      return leftIsIcon ? -1 : 1;
    }

    return compareAssetsByOrder(left, right);
  });

  record.outputs.sort((left, right) => {
    const leftIsIcon = left.mode === "icon";
    const rightIsIcon = right.mode === "icon";

    if (leftIsIcon !== rightIsIcon) {
      return leftIsIcon ? -1 : 1;
    }

    return (
      left.order - right.order ||
      left.updatedAt.localeCompare(right.updatedAt) ||
      left.sourceAssetId.localeCompare(right.sourceAssetId)
    );
  });
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

export function enforcePackOutputRoleInvariants(record: StickerPackRecord) {
  const assetById = new Map(record.assets.map((asset) => [asset.id, asset]));
  const currentIconAsset =
    record.iconAssetId === null
      ? null
      : assetById.get(record.iconAssetId) ?? null;

  if (record.source === "telegram" && currentIconAsset?.telegram) {
    record.iconAssetId = null;
  }

  const iconAssetId = record.iconAssetId;
  const removedOutputs: StickerPackRecord["outputs"] = [];
  const nextOutputs: StickerPackRecord["outputs"] = [];

  for (const output of record.outputs) {
    const sourceAsset = assetById.get(output.sourceAssetId);
    const isStickerOutputForExplicitIcon =
      iconAssetId !== null &&
      output.mode === "sticker" &&
      output.sourceAssetId === iconAssetId;
    const isLegacyTelegramIconOutput =
      output.mode === "icon" && Boolean(sourceAsset?.telegram);

    if (isStickerOutputForExplicitIcon || isLegacyTelegramIconOutput) {
      removedOutputs.push(output);
      continue;
    }

    nextOutputs.push(output);
  }

  record.outputs = nextOutputs;
  return removedOutputs;
}

export function normalizePackRecord(
  record:
    | (Partial<StickerPackRecord> & {
        source?: PackSource;
        assets?: Array<Partial<StickerPackRecord["assets"][number]>>;
        outputs?: Array<Partial<StickerPackRecord["outputs"][number]>>;
      })
    | null
    | undefined,
): StickerPackRecord {
  const now = nowIso();
  const source = record?.source ?? "local";
  const schemaVersion = record?.schemaVersion ?? 2;
  const normalized: StickerPackRecord = {
    schemaVersion: 3,
    id: record?.id ?? randomUUID(),
    source,
    name: record?.name ?? "Untitled Pack",
    slug: record?.slug ?? slugify(record?.name ?? "Untitled Pack"),
    iconAssetId: record?.iconAssetId ?? null,
    telegramShortName: record?.telegramShortName ?? null,
    telegram:
      source === "telegram" && record?.telegram
        ? createDefaultTelegramSummary(record.telegram)
        : undefined,
    createdAt: record?.createdAt ?? now,
    updatedAt: record?.updatedAt ?? now,
    assets: (record?.assets ?? []).map((asset, index) => ({
      id: asset.id ?? randomUUID(),
      packId: asset.packId ?? (record?.id ?? ""),
      order: asset.order ?? index,
      relativePath: asset.relativePath ?? `sticker-${index + 1}.webm`,
      originalFileName: getOriginalFileName(asset),
      emojiList: asset.emojiList ?? [],
      kind: asset.kind ?? "png",
      importedAt: asset.importedAt ?? now,
      originalImportPath: asset.originalImportPath ?? null,
      downloadState:
        asset.downloadState ?? (source === "telegram" ? "missing" : "ready"),
      telegram:
        source === "telegram" && asset.telegram
          ? {
              stickerId: asset.telegram.stickerId ?? String(index + 1),
              fileId: asset.telegram.fileId ?? null,
              fileUniqueId: asset.telegram.fileUniqueId ?? null,
              position: asset.telegram.position ?? index,
              baselineOutputHash: asset.telegram.baselineOutputHash ?? null,
            }
          : undefined,
    })),
    outputs: (record?.outputs ?? []).map((output) => ({
      packId: output.packId ?? (record?.id ?? ""),
      sourceAssetId: output.sourceAssetId ?? "",
      order: output.order ?? 0,
      mode: output.mode ?? "sticker",
      relativePath: output.relativePath ?? "",
      sizeBytes: output.sizeBytes ?? 0,
      sha256: output.sha256 ?? null,
      updatedAt: output.updatedAt ?? now,
    })),
  };

  if (schemaVersion < 3) {
    if (source === "telegram") {
      const remoteAssets = normalized.assets
        .filter((asset) => asset.telegram)
        .sort(
          (left, right) =>
            (left.telegram?.position ?? 0) - (right.telegram?.position ?? 0) ||
            left.importedAt.localeCompare(right.importedAt) ||
            left.id.localeCompare(right.id),
        );
      const localOnlyAssets = normalized.assets
        .filter((asset) => !asset.telegram)
        .sort(compareAssetsByOrder);

      remoteAssets.forEach((asset, index) => {
        asset.order = index;
      });
      localOnlyAssets.forEach((asset, index) => {
        asset.order = remoteAssets.length + index;
      });
    } else {
      normalized.assets.forEach((asset, index) => {
        asset.order = index;
      });
    }
  }

  enforcePackOutputRoleInvariants(normalized);
  compactStickerOrders(normalized);
  sortPackRecord(normalized);
  return normalized;
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
