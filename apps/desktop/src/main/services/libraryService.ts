import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type {
  DownloadState,
  ImportResult,
  SourceMediaKind,
  StickerItem,
  StickerPack,
  StickerPackDetails,
  StickerPackRecord,
} from "@sticker-smith/shared";
import { supportedMediaKinds } from "@sticker-smith/shared";

import type { SettingsService } from "./settingsService";
import { compactStickerOrders } from "./packNormalizer";
import { hydratePackDetails, PackRepository, resolvePackPaths } from "./packRepository";
import { markStickerFileReady } from "./stickerFileState";
import { TelegramMirrorStore } from "./telegramMirrorStore";
import { pathExists, sha256ForFile } from "../utils/fsUtils";
import { nowIso } from "../utils/timeUtils";

const supportedMediaKindsSet = new Set<SourceMediaKind>(supportedMediaKinds);

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "pack";
}

function extToKind(filePath: string): SourceMediaKind | null {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  return supportedMediaKindsSet.has(extension as SourceMediaKind) ? (extension as SourceMediaKind) : null;
}

function stickerRelativePath(stickerId: string) {
  return `${stickerId}.webm`;
}

async function collectFiles(directoryPath: string): Promise<string[]> {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const result: string[] = [];
  for (const entry of entries) {
    const absolutePath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) result.push(...(await collectFiles(absolutePath)));
    else if (entry.isFile()) result.push(absolutePath);
  }
  return result.sort((a, b) => a.localeCompare(b));
}

function nextStickerOrder(record: StickerPackRecord) {
  return record.stickers.reduce((max, sticker) => Math.max(max, sticker.order), -1) + 1;
}

export class LibraryService {
  private readonly repo: PackRepository;
  private readonly telegramMirrorStore: TelegramMirrorStore;

  constructor(settingsService: SettingsService) {
    this.repo = new PackRepository(settingsService);
    this.telegramMirrorStore = new TelegramMirrorStore(this.repo, settingsService);
  }

  private async mutatePackRecord(
    packId: string,
    action: (record: StickerPackRecord, rootPath: string) => Promise<void> | void,
  ) {
    return this.repo.withPackMutationLock(packId, async () => {
      const { record, rootPath } = await this.repo.readPackRecordById(packId);
      await action(record, rootPath);
      compactStickerOrders(record);
      await this.repo.writePackRecord(rootPath, record);
      return hydratePackDetails(record, rootPath);
    });
  }

  private markTelegramMirrorStale(record: StickerPackRecord) {
    if (record.telegram && record.telegram.syncState !== "unsupported") {
      record.telegram.syncState = "stale";
      record.telegram.lastSyncError = null;
    }
  }

  async listPacks(): Promise<StickerPack[]> { return this.repo.listPacks(); }
  async getPack(packId: string): Promise<StickerPackDetails> { return this.repo.getPack(packId); }
  async findPackByTelegramStickerSetId(stickerSetId: string) { return this.repo.findPackByTelegramStickerSetId(stickerSetId); }

  async createPack(input: { name: string }): Promise<StickerPack> {
    await this.repo.ensureReady();
    const id = randomUUID();
    const slug = `${slugify(input.name)}-${id}`;
    const rootPath = path.join(this.repo.getPacksRoot(), slug);
    const now = nowIso();
    const record: StickerPackRecord = {
      schemaVersion: 4,
      id,
      source: "local",
      name: input.name,
      slug,
      iconStickerId: null,
      telegramShortName: null,
      createdAt: now,
      updatedAt: now,
      stickers: [],
    };
    await this.repo.writePackRecord(rootPath, record);
    return hydratePackDetails(record, rootPath).pack;
  }

  async renamePack(input: { packId: string; name: string }) {
    const details = await this.mutatePackRecord(input.packId, (record) => {
      record.name = input.name;
      record.slug = slugify(input.name);
      if (record.telegram) record.telegram.title = input.name;
      this.markTelegramMirrorStale(record);
    });
    return details.pack;
  }

  async deletePack(input: { packId: string }) {
    const { rootPath } = await this.repo.readPackRecordById(input.packId);
    await fs.rm(rootPath, { recursive: true, force: true });
  }

  async setPackTelegramShortName(input: { packId: string; shortName: string | null }) {
    const details = await this.mutatePackRecord(input.packId, (record) => {
      if (record.source !== "local") throw new Error("Only local packs can store a Telegram short name.");
      record.telegramShortName = input.shortName;
    });
    return details.pack;
  }

  async setPackIcon(input: { packId: string; stickerId: string | null }) {
    const details = await this.mutatePackRecord(input.packId, (record, rootPath) => {
      if (input.stickerId && !record.stickers.some((sticker) => sticker.id === input.stickerId)) {
        throw new Error(`Sticker not found in pack: ${input.stickerId}`);
      }
      record.iconStickerId = input.stickerId;
      const sticker = input.stickerId ? record.stickers.find((item) => item.id === input.stickerId) : null;
      if (record.telegram) {
        record.telegram.thumbnailPath = sticker ? path.join(resolvePackPaths(rootPath).outputRoot, sticker.relativePath) : null;
      }
      this.markTelegramMirrorStale(record);
    });
    return details.pack;
  }

  async importFiles(packId: string, filePaths: string[]): Promise<ImportResult> {
    const skipped: string[] = [];
    const imported: StickerItem[] = [];
    await this.mutatePackRecord(packId, async (record, rootPath) => {
      const { outputRoot } = resolvePackPaths(rootPath);
      await fs.mkdir(outputRoot, { recursive: true });
      for (const filePath of filePaths) {
        const kind = extToKind(filePath);
        if (!kind) { skipped.push(filePath); continue; }
        const id = randomUUID();
        const relativePath = stickerRelativePath(id);
        const absolutePath = path.join(outputRoot, relativePath);
        await fs.copyFile(filePath, absolutePath);
        const stat = await fs.stat(absolutePath);
        const sticker: StickerPackRecord["stickers"][number] = {
          id,
          packId: record.id,
          order: nextStickerOrder(record),
          relativePath,
          originalFileName: path.basename(filePath),
          emojiList: [],
          sizeBytes: stat.size,
          sha256: await sha256ForFile(absolutePath),
          importedAt: nowIso(),
          updatedAt: nowIso(),
          downloadState: "ready",
        };
        record.stickers.push(sticker);
        imported.push({ ...sticker, absolutePath });
      }
      this.markTelegramMirrorStale(record);
    });
    return { imported, skipped };
  }

  async importDirectory(packId: string, directoryPath: string): Promise<ImportResult> {
    return this.importFiles(packId, await collectFiles(directoryPath));
  }

  async setStickerEmojis(input: { packId: string; stickerId: string; emojis: string[] }) {
    return this.mutatePackRecord(input.packId, (record) => {
      const sticker = record.stickers.find((item) => item.id === input.stickerId);
      if (!sticker) throw new Error(`Sticker not found: ${input.stickerId}`);
      sticker.emojiList = [...input.emojis];
      this.markTelegramMirrorStale(record);
    });
  }

  async setManyStickerEmojis(input: { packId: string; stickerIds: string[]; emojis: string[] }) {
    return this.mutatePackRecord(input.packId, (record) => {
      for (const stickerId of [...new Set(input.stickerIds)]) {
        const sticker = record.stickers.find((item) => item.id === stickerId);
        if (!sticker) throw new Error(`Sticker not found: ${stickerId}`);
        sticker.emojiList = [...input.emojis];
      }
      this.markTelegramMirrorStale(record);
    });
  }

  async reorderSticker(input: { packId: string; stickerId: string; beforeStickerId: string | null }) {
    return this.mutatePackRecord(input.packId, (record) => {
      const stickers = [...record.stickers].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
      const current = stickers.findIndex((item) => item.id === input.stickerId);
      if (current === -1) throw new Error(`Sticker not found: ${input.stickerId}`);
      const [moved] = stickers.splice(current, 1);
      if (!moved) throw new Error(`Sticker not found: ${input.stickerId}`);
      if (input.beforeStickerId === null) stickers.push(moved);
      else {
        const next = stickers.findIndex((item) => item.id === input.beforeStickerId);
        if (next === -1) throw new Error(`Sticker not found: ${input.beforeStickerId}`);
        stickers.splice(next, 0, moved);
      }
      stickers.forEach((sticker, order) => { sticker.order = order; });
      record.stickers = stickers;
      this.markTelegramMirrorStale(record);
    });
  }

  async deleteSticker(input: { packId: string; stickerId: string }) {
    return this.deleteManyStickers({ packId: input.packId, stickerIds: [input.stickerId] });
  }

  async deleteManyStickers(input: { packId: string; stickerIds: string[] }) {
    return this.mutatePackRecord(input.packId, async (record, rootPath) => {
      const ids = new Set(input.stickerIds);
      const removed = record.stickers.filter((sticker) => ids.has(sticker.id));
      if (removed.length !== ids.size) throw new Error("Sticker not found");
      record.stickers = record.stickers.filter((sticker) => !ids.has(sticker.id));
      if (record.iconStickerId && ids.has(record.iconStickerId)) record.iconStickerId = null;
      await this.repo.deleteStickerFilesIfUnreferenced(record, rootPath, removed.map((sticker) => sticker.relativePath));
      this.markTelegramMirrorStale(record);
    });
  }

  async renameSticker(input: { packId: string; stickerId: string; nextRelativePath: string }) {
    return this.mutatePackRecord(input.packId, async (record, rootPath) => {
      const sticker = record.stickers.find((item) => item.id === input.stickerId);
      if (!sticker) throw new Error(`Sticker not found: ${input.stickerId}`);
      const nextRelativePath = input.nextRelativePath.replace(/\\/g, "/").replace(/^\/+/, "");
      const { outputRoot } = resolvePackPaths(rootPath);
      await fs.mkdir(path.dirname(path.join(outputRoot, nextRelativePath)), { recursive: true });
      await fs.rename(path.join(outputRoot, sticker.relativePath), path.join(outputRoot, nextRelativePath));
      sticker.relativePath = nextRelativePath;
    });
  }

  async renameManyStickers(input: { packId: string; stickerIds: string[]; baseName: string }) {
    let details: StickerPackDetails | null = null;
    for (const [index, stickerId] of input.stickerIds.entries()) {
      details = await this.renameSticker({ packId: input.packId, stickerId, nextRelativePath: `${input.baseName}-${index + 1}.webm` });
    }
    return details ?? this.getPack(input.packId);
  }

  async moveSticker(input: { packId: string; stickerId: string; nextDirectory: string }) {
    const details = await this.getPack(input.packId);
    const sticker = details.stickers.find((item) => item.id === input.stickerId);
    if (!sticker) throw new Error(`Sticker not found: ${input.stickerId}`);
    return this.renameSticker({ packId: input.packId, stickerId: input.stickerId, nextRelativePath: path.posix.join(input.nextDirectory, path.posix.basename(sticker.relativePath)) });
  }

  async recordConversionResult(packId: string, result: { stickerId: string; mode: "icon" | "sticker"; outputFileName: string; sizeBytes: number }) {
    const { record, rootPath } = await this.repo.readPackRecordById(packId);
    const sticker = record.stickers.find((item) => item.id === result.stickerId);
    if (!sticker) throw new Error(`Sticker not found: ${result.stickerId}`);
    const absolutePath = path.join(resolvePackPaths(rootPath).outputRoot, result.outputFileName);
    markStickerFileReady(sticker, {
      relativePath: result.outputFileName,
      sizeBytes: result.sizeBytes,
      sha256: await sha256ForFile(absolutePath),
    });
    if (result.mode === "icon") record.iconStickerId = sticker.id;
    this.markTelegramMirrorStale(record);
    await this.repo.writePackRecord(rootPath, record);
  }

  async getConversionContext(packId: string) { return this.getPack(packId); }

  async upsertTelegramMirror(input: Parameters<TelegramMirrorStore["upsertTelegramMirror"]>[0]) { return this.telegramMirrorStore.upsertTelegramMirror(input); }
  async writeTelegramStickerFile(input: { packId: string; stickerId: string; sourceFilePath: string; relativePath?: string; baselineStickerHash?: string | null }) { return this.telegramMirrorStore.writeTelegramStickerFile(input); }
  async setTelegramStickerDownloadState(input: Parameters<TelegramMirrorStore["setTelegramStickerDownloadState"]>[0]) { return this.telegramMirrorStore.setTelegramStickerDownloadState(input); }
  async updateTelegramMirrorMetadata(input: Parameters<TelegramMirrorStore["updateTelegramMirrorMetadata"]>[0]) { return this.telegramMirrorStore.updateTelegramMirrorMetadata(input); }
  async syncTelegramThumbnail(input: Parameters<TelegramMirrorStore["syncTelegramThumbnail"]>[0]) { return this.telegramMirrorStore.syncTelegramThumbnail(input); }
}
