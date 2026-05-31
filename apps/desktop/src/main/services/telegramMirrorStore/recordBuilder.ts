import { randomUUID } from "node:crypto";
import path from "node:path";
import type { StickerPackRecord } from "@sticker-smith/shared";
import { createDefaultTelegramSummary } from "../packNormalizer";
import { nowIso } from "../../utils/timeUtils";
import { stickerRelativePath } from "./stickerPaths";
import type {
  BuildMirrorRecordInput,
  ExistingStickerByTelegramId,
  StickerRecord,
  TelegramMirrorStickerInput,
  TelegramMirrorUpsertInput,
} from "./types";

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "pack"
  );
}

function resolveMirrorStickerId(
  stickerInput: TelegramMirrorStickerInput,
  existing?: StickerRecord,
) {
  return existing?.id ?? stickerInput.id ?? randomUUID();
}

function resolveMirrorStickerRelativePath(
  id: string,
  existing?: StickerRecord,
) {
  return existing?.relativePath ?? stickerRelativePath(id);
}

function resolveMirrorStickerOriginalFileName(
  stickerInput: TelegramMirrorStickerInput,
  existing?: StickerRecord,
) {
  return existing?.originalFileName ?? path.basename(stickerInput.relativePath);
}

function resolveMirrorStickerBaselineHash(
  stickerInput: TelegramMirrorStickerInput,
  existing?: StickerRecord,
) {
  return (
    existing?.telegram?.baselineStickerHash ??
    stickerInput.telegram.baselineStickerHash ??
    null
  );
}

function buildTelegramMetadata(
  stickerInput: TelegramMirrorStickerInput,
  existing: StickerRecord | undefined,
  order: number,
) {
  return {
    ...stickerInput.telegram,
    baselineStickerHash: resolveMirrorStickerBaselineHash(
      stickerInput,
      existing,
    ),
    position: order,
  };
}

function buildTelegramMirrorSticker(input: {
  stickerInput: TelegramMirrorStickerInput;
  existingByTelegramId: ExistingStickerByTelegramId;
  packId: string;
  order: number;
  now: string;
}): StickerRecord {
  const { stickerInput, existingByTelegramId, packId, order, now } = input;
  const existing = existingByTelegramId.get(stickerInput.telegram.stickerId);
  const id = resolveMirrorStickerId(stickerInput, existing);

  return {
    id,
    packId,
    order,
    relativePath: resolveMirrorStickerRelativePath(id, existing),
    originalFileName: resolveMirrorStickerOriginalFileName(
      stickerInput,
      existing,
    ),
    emojiList: stickerInput.emojiList,
    sizeBytes: existing?.sizeBytes ?? 0,
    sha256: existing?.sha256 ?? null,
    importedAt: existing?.importedAt ?? now,
    updatedAt: existing?.updatedAt ?? now,
    downloadState: existing?.downloadState ?? stickerInput.downloadState,
    telegram: buildTelegramMetadata(stickerInput, existing, order),
  };
}

function buildTelegramMirrorStickers(input: {
  stickers: TelegramMirrorStickerInput[];
  existingByTelegramId: ExistingStickerByTelegramId;
  packId: string;
  now: string;
}): StickerRecord[] {
  return input.stickers
    .slice()
    .sort((a, b) => a.telegram.position - b.telegram.position)
    .map((stickerInput, order) =>
      buildTelegramMirrorSticker({ ...input, stickerInput, order }),
    );
}

function resolveTelegramMirrorIconStickerId(input: {
  stickers: StickerRecord[];
  thumbnailStickerId?: string | null;
  existingIconStickerId?: string | null;
}) {
  const iconSticker = input.thumbnailStickerId
    ? input.stickers.find(
        (sticker) => sticker.telegram?.stickerId === input.thumbnailStickerId,
      )
    : null;
  return (
    iconSticker?.id ??
    (input.existingIconStickerId &&
    input.stickers.some((sticker) => sticker.id === input.existingIconStickerId)
      ? input.existingIconStickerId
      : null)
  );
}

function resolveMirrorPackId(
  existing: StickerPackRecord | null,
  upsertInput: TelegramMirrorUpsertInput,
) {
  return existing?.id ?? `telegram-${upsertInput.stickerSetId}`;
}

function resolveMirrorPublishedFromLocalPackId(
  existing: StickerPackRecord | null,
  upsertInput: TelegramMirrorUpsertInput,
) {
  return (
    upsertInput.publishedFromLocalPackId ??
    existing?.telegram?.publishedFromLocalPackId ??
    null
  );
}

function buildMirrorTelegramSummary(input: BuildMirrorRecordInput) {
  const { existing, upsertInput, storedThumbnailPath } = input;
  return createDefaultTelegramSummary({
    stickerSetId: upsertInput.stickerSetId,
    shortName: upsertInput.shortName,
    title: upsertInput.title,
    format: upsertInput.format,
    thumbnailPath: storedThumbnailPath,
    syncState: upsertInput.syncState,
    lastSyncedAt: upsertInput.lastSyncedAt,
    lastSyncError: upsertInput.lastSyncError,
    publishedFromLocalPackId: resolveMirrorPublishedFromLocalPackId(
      existing,
      upsertInput,
    ),
  });
}

export function findExistingByTelegramStickerId(
  existing: StickerPackRecord | null,
) {
  return new Map(
    (existing?.stickers ?? [])
      .filter((sticker) => sticker.telegram)
      .map((sticker) => [sticker.telegram!.stickerId, sticker]),
  );
}

export function buildMirrorRecord(
  input: BuildMirrorRecordInput,
): StickerPackRecord {
  const { existing, upsertInput } = input;
  const existingByTelegramId = findExistingByTelegramStickerId(existing);
  const now = nowIso();
  const packId = resolveMirrorPackId(existing, upsertInput);
  const stickers = buildTelegramMirrorStickers({
    stickers: upsertInput.stickers,
    existingByTelegramId,
    packId,
    now,
  });

  return {
    schemaVersion: 4,
    id: packId,
    source: "telegram",
    name: upsertInput.title,
    slug: slugify(upsertInput.shortName || upsertInput.title),
    iconStickerId: resolveTelegramMirrorIconStickerId({
      stickers,
      thumbnailStickerId: upsertInput.thumbnailStickerId,
      existingIconStickerId: existing?.iconStickerId,
    }),
    telegramShortName: null,
    telegram: buildMirrorTelegramSummary(input),
    createdAt: existing?.createdAt ?? now,
    updatedAt: existing?.updatedAt ?? now,
    stickers,
  };
}
