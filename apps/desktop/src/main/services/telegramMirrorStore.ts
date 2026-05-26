import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type {
  DownloadState,
  SourceMediaKind,
  StickerPackRecord,
  TelegramPackSummary,
  TelegramStickerMetadata,
} from "@sticker-smith/shared";

import type { SettingsService } from "./settingsService";
import { compactStickerOrders, createDefaultTelegramSummary } from "./packNormalizer";
import { hydratePackDetails, PackRepository, resolvePackPaths } from "./packRepository";
import { markStickerFileReady } from "./stickerFileState";
import { pathExists, sha256ForFile } from "../utils/fsUtils";
import { nowIso } from "../utils/timeUtils";

export interface TelegramMirrorStickerInput {
  id?: string;
  relativePath: string;
  emojiList: string[];
  kind?: SourceMediaKind;
  downloadState: DownloadState;
  telegram: TelegramStickerMetadata;
}

export interface TelegramMirrorUpsertInput {
  stickerSetId: string;
  title: string;
  shortName: string;
  format: TelegramPackSummary["format"];
  thumbnailPath: string | null;
  thumbnailStickerId?: string | null;
  hasThumbnail?: boolean;
  thumbnailExtension?: string | null;
  syncState: TelegramPackSummary["syncState"];
  lastSyncError?: string | null;
  publishedFromLocalPackId: string | null;
  lastSyncedAt: string | null;
  stickers: TelegramMirrorStickerInput[];
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "pack";
}

function stickerRelativePath(stickerId: string) {
  return `${stickerId}.webm`;
}

async function syncTelegramThumbnailFile(
  rootPath: string,
  thumbnailPath: string | null,
  options: { hasThumbnail?: boolean; preferredExtension?: string | null } = {},
) {
  const { outputRoot } = resolvePackPaths(rootPath);
  await fs.mkdir(outputRoot, { recursive: true });
  const entries = await fs.readdir(outputRoot, { withFileTypes: true });
  const existing = entries
    .filter((entry) => entry.isFile() && entry.name.startsWith("telegram-pack-icon."))
    .map((entry) => path.join(outputRoot, entry.name));
  const removeExisting = async (excluded?: string) => Promise.all(existing.filter((item) => item !== excluded).map((item) => fs.rm(item, { force: true })));

  if (!thumbnailPath) {
    if (options.hasThumbnail && existing[0]) {
      await removeExisting(existing[0]);
      return existing[0];
    }
    await removeExisting();
    return null;
  }

  const extension = path.extname(thumbnailPath) || options.preferredExtension || ".bin";
  const destination = path.join(outputRoot, `telegram-pack-icon${extension}`);
  if (thumbnailPath !== destination) await fs.copyFile(thumbnailPath, destination);
  await removeExisting(destination);
  return destination;
}

export class TelegramMirrorStore {
  constructor(
    private readonly repo: PackRepository,
    private readonly _settingsService: SettingsService,
  ) {}

  private findExistingByTelegramStickerId(existing: StickerPackRecord | null) {
    return new Map(
      (existing?.stickers ?? [])
        .filter((sticker) => sticker.telegram)
        .map((sticker) => [sticker.telegram!.stickerId, sticker]),
    );
  }

  private buildMirrorRecord(input: {
    existing: StickerPackRecord | null;
    upsertInput: TelegramMirrorUpsertInput;
    storedThumbnailPath: string | null;
  }): StickerPackRecord {
    const existingByTelegramId = this.findExistingByTelegramStickerId(input.existing);
    const now = nowIso();
    const packId = input.existing?.id ?? `telegram-${input.upsertInput.stickerSetId}`;
    const stickers = input.upsertInput.stickers
      .slice()
      .sort((a, b) => a.telegram.position - b.telegram.position)
      .map((stickerInput, index) => {
        const existing = existingByTelegramId.get(stickerInput.telegram.stickerId);
        const id = existing?.id ?? stickerInput.id ?? randomUUID();
        return {
          id,
          packId,
          order: index,
          relativePath: existing?.relativePath ?? stickerRelativePath(id),
          originalFileName: existing?.originalFileName ?? path.basename(stickerInput.relativePath),
          emojiList: stickerInput.emojiList,
          sizeBytes: existing?.sizeBytes ?? 0,
          sha256: existing?.sha256 ?? null,
          importedAt: existing?.importedAt ?? now,
          updatedAt: existing?.updatedAt ?? now,
          downloadState: existing?.downloadState ?? stickerInput.downloadState,
          telegram: {
            ...stickerInput.telegram,
            baselineStickerHash: existing?.telegram?.baselineStickerHash ?? stickerInput.telegram.baselineStickerHash ?? null,
            position: index,
          },
        };
      });

    const iconSticker = input.upsertInput.thumbnailStickerId
      ? stickers.find((sticker) => sticker.telegram?.stickerId === input.upsertInput.thumbnailStickerId)
      : null;

    return {
      schemaVersion: 4,
      id: packId,
      source: "telegram",
      name: input.upsertInput.title,
      slug: slugify(input.upsertInput.shortName || input.upsertInput.title),
      iconStickerId: iconSticker?.id ?? (input.existing?.iconStickerId && stickers.some((sticker) => sticker.id === input.existing?.iconStickerId) ? input.existing.iconStickerId : null),
      telegramShortName: null,
      telegram: createDefaultTelegramSummary({
        stickerSetId: input.upsertInput.stickerSetId,
        shortName: input.upsertInput.shortName,
        title: input.upsertInput.title,
        format: input.upsertInput.format,
        thumbnailPath: input.storedThumbnailPath,
        syncState: input.upsertInput.syncState,
        lastSyncedAt: input.upsertInput.lastSyncedAt,
        lastSyncError: input.upsertInput.lastSyncError,
        publishedFromLocalPackId: input.upsertInput.publishedFromLocalPackId ?? input.existing?.telegram?.publishedFromLocalPackId ?? null,
      }),
      createdAt: input.existing?.createdAt ?? now,
      updatedAt: input.existing?.updatedAt ?? now,
      stickers,
    };
  }

  async reconcileTelegramMirrorStickers(record: StickerPackRecord, rootPath: string) {
    if (record.source !== "telegram") return;
    const { outputRoot } = resolvePackPaths(rootPath);
    for (const sticker of record.stickers) {
      const absolutePath = path.join(outputRoot, sticker.relativePath);
      if (!(await pathExists(absolutePath))) {
        if (sticker.downloadState === "ready") sticker.downloadState = "missing";
        continue;
      }
      const stat = await fs.stat(absolutePath);
      sticker.sizeBytes = stat.size;
      sticker.sha256 ??= await sha256ForFile(absolutePath);
      sticker.telegram && (sticker.telegram.baselineStickerHash ??= sticker.sha256);
      sticker.downloadState = "ready";
    }
  }

  async upsertTelegramMirror(input: TelegramMirrorUpsertInput) {
    await this.repo.ensureReady();
    const existing = await this.repo.findPackByTelegramStickerSetId(input.stickerSetId);
    const rootPath = existing?.rootPath ?? path.join(this.repo.getPacksRoot(), `telegram-${input.stickerSetId}`);
    return this.repo.withPackMutationLock(existing?.record.id ?? `telegram-${input.stickerSetId}`, async () => {
      const storedThumbnailPath = await syncTelegramThumbnailFile(rootPath, input.thumbnailPath, { hasThumbnail: input.hasThumbnail, preferredExtension: input.thumbnailExtension });
      const record = this.buildMirrorRecord({ existing: existing?.record ?? null, upsertInput: input, storedThumbnailPath });
      await this.reconcileTelegramMirrorStickers(record, rootPath);
      compactStickerOrders(record);
      await this.repo.writePackRecord(rootPath, record);
      return { record, rootPath };
    });
  }

  private requireSticker(record: StickerPackRecord, stickerId: string) {
    const sticker = record.stickers.find((item) => item.id === stickerId);
    if (!sticker) throw new Error(`Sticker not found: ${stickerId}`);
    return sticker;
  }

  async writeTelegramStickerFile(input: { packId: string; stickerId: string; sourceFilePath: string; relativePath?: string; baselineStickerHash?: string | null }) {
    return this.repo.withPackMutationLock(input.packId, async () => {
      const { record, rootPath } = await this.repo.readPackRecordById(input.packId);
      const sticker = this.requireSticker(record, input.stickerId);
      const relativePath = input.relativePath ?? stickerRelativePath(sticker.id);
      const absolutePath = path.join(resolvePackPaths(rootPath).outputRoot, relativePath);
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.copyFile(input.sourceFilePath, absolutePath);
      const stat = await fs.stat(absolutePath);
      markStickerFileReady(sticker, {
        relativePath,
        sizeBytes: stat.size,
        sha256: await sha256ForFile(absolutePath),
      });
      if (sticker.telegram) sticker.telegram.baselineStickerHash = input.baselineStickerHash ?? sticker.sha256;
      await this.repo.writePackRecord(rootPath, record);
      return hydratePackDetails(record, rootPath);
    });
  }

  async setTelegramStickerDownloadState(input: { packId: string; stickerId: string; downloadState: DownloadState }) {
    return this.repo.withPackMutationLock(input.packId, async () => {
      const { record, rootPath } = await this.repo.readPackRecordById(input.packId);
      const sticker = this.requireSticker(record, input.stickerId);
      sticker.downloadState = input.downloadState;
      await this.repo.writePackRecord(rootPath, record);
      return hydratePackDetails(record, rootPath);
    });
  }

  async updateTelegramMirrorMetadata(input: { packId: string; syncState?: TelegramPackSummary["syncState"]; lastSyncedAt?: string | null; lastSyncError?: string | null; title?: string; shortName?: string; thumbnailPath?: string | null; publishedFromLocalPackId?: string | null }) {
    return this.repo.withPackMutationLock(input.packId, async () => {
      const { record, rootPath } = await this.repo.readPackRecordById(input.packId);
      if (!record.telegram) throw new Error(`Pack is not a Telegram mirror: ${input.packId}`);
      if (input.syncState !== undefined) record.telegram.syncState = input.syncState;
      if (input.lastSyncedAt !== undefined) record.telegram.lastSyncedAt = input.lastSyncedAt;
      if (input.lastSyncError !== undefined) record.telegram.lastSyncError = input.lastSyncError;
      if (input.title !== undefined) { record.name = input.title; record.telegram.title = input.title; }
      if (input.shortName !== undefined) record.telegram.shortName = input.shortName;
      if (input.thumbnailPath !== undefined) record.telegram.thumbnailPath = input.thumbnailPath;
      if (input.publishedFromLocalPackId !== undefined) record.telegram.publishedFromLocalPackId = input.publishedFromLocalPackId;
      await this.repo.writePackRecord(rootPath, record);
      return hydratePackDetails(record, rootPath);
    });
  }

  async syncTelegramThumbnail(input: { packId: string; thumbnailPath: string | null; hasThumbnail?: boolean; thumbnailExtension?: string | null }) {
    return this.repo.withPackMutationLock(input.packId, async () => {
      const { record, rootPath } = await this.repo.readPackRecordById(input.packId);
      if (!record.telegram) throw new Error(`Pack is not a Telegram mirror: ${input.packId}`);
      record.telegram.thumbnailPath = await syncTelegramThumbnailFile(rootPath, input.thumbnailPath, { hasThumbnail: input.hasThumbnail, preferredExtension: input.thumbnailExtension });
      await this.repo.writePackRecord(rootPath, record);
      return hydratePackDetails(record, rootPath);
    });
  }
}
