import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type {
  PackSource,
  StickerPack,
  StickerPackDetails,
  StickerPackRecord,
} from "@sticker-smith/shared";

import type { SettingsService } from "./settingsService";
import { normalizePackRecord, sortPackRecord } from "./packNormalizer";
import { pathExists } from "../utils/fsUtils";
import { nowIso } from "../utils/timeUtils";

export function resolvePackPaths(rootPath: string) {
  return {
    packFilePath: path.join(rootPath, "pack.json"),
    outputRoot: path.join(rootPath, "webm"),
  };
}

function isJsonParseError(error: unknown) {
  return error instanceof SyntaxError;
}

function isMissingPathError(error: unknown) {
  return (error as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
}

function buildStickerPack(record: StickerPackRecord, rootPath: string): StickerPack {
  const { outputRoot } = resolvePackPaths(rootPath);
  const iconSticker = record.iconStickerId
    ? record.stickers.find((sticker) => sticker.id === record.iconStickerId) ?? null
    : null;
  const thumbnailPath = iconSticker
    ? path.join(outputRoot, iconSticker.relativePath)
    : record.source === "telegram"
      ? record.telegram?.thumbnailPath ?? null
      : null;

  return {
    id: record.id,
    source: record.source,
    name: record.name,
    slug: record.slug,
    rootPath,
    iconStickerId: record.iconStickerId,
    thumbnailPath,
    telegramShortName:
      record.source === "telegram"
        ? record.telegram?.shortName ?? null
        : record.telegramShortName ?? null,
    telegram: record.telegram,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function hydratePackDetails(
  record: StickerPackRecord,
  rootPath: string,
): StickerPackDetails {
  const { outputRoot } = resolvePackPaths(rootPath);
  return {
    pack: buildStickerPack(record, rootPath),
    stickers: record.stickers.map((sticker) => ({
      ...sticker,
      absolutePath: path.join(outputRoot, sticker.relativePath),
    })),
  };
}

export class PackRepository {
  private readonly packMutationQueues = new Map<string, Promise<void>>();

  constructor(private readonly settingsService: SettingsService) {}

  async ensureReady() {
    await this.settingsService.ensureLibrary();
  }

  getPacksRoot() {
    return path.join(this.settingsService.getLibraryRoot(), "packs");
  }

  async ensurePackDirectories(rootPath: string) {
    const { outputRoot } = resolvePackPaths(rootPath);
    await fs.mkdir(outputRoot, { recursive: true });
  }

  async readPackRecordFromRoot(rootPath: string): Promise<StickerPackRecord> {
    const { packFilePath } = resolvePackPaths(rootPath);
    const backupFilePath = `${packFilePath}.bak`;
    try {
      const raw = await fs.readFile(packFilePath, "utf8");
      return normalizePackRecord(JSON.parse(raw) as Partial<StickerPackRecord> & { source?: PackSource });
    } catch (error) {
      if (!isJsonParseError(error) || !(await pathExists(backupFilePath))) {
        throw error;
      }
      const raw = await fs.readFile(backupFilePath, "utf8");
      const record = normalizePackRecord(JSON.parse(raw) as Partial<StickerPackRecord> & { source?: PackSource });
      await this.writePackRecord(rootPath, record);
      return record;
    }
  }

  async writePackRecord(rootPath: string, record: StickerPackRecord) {
    sortPackRecord(record);
    record.schemaVersion = 4;
    record.updatedAt = nowIso();
    await this.ensurePackDirectories(rootPath);
    const { packFilePath } = resolvePackPaths(rootPath);
    const tempFilePath = `${packFilePath}.${process.pid}.${randomUUID()}.tmp`;
    const backupFilePath = `${packFilePath}.bak`;
    const persistentRecord: StickerPackRecord = {
      schemaVersion: 4,
      id: record.id,
      source: record.source,
      name: record.name,
      slug: record.slug,
      iconStickerId: record.iconStickerId,
      telegramShortName: record.telegramShortName,
      telegram: record.telegram,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      stickers: record.stickers,
    };
    const serialized = JSON.stringify(persistentRecord, null, 2);
    if (await pathExists(packFilePath)) {
      await fs.copyFile(packFilePath, backupFilePath);
    }
    try {
      await fs.writeFile(tempFilePath, serialized);
      await fs.rename(tempFilePath, packFilePath);
    } finally {
      await fs.rm(tempFilePath, { force: true });
    }
  }

  async withPackMutationLock<T>(packKey: string, action: () => Promise<T>): Promise<T> {
    const previous = this.packMutationQueues.get(packKey) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const current = new Promise<void>((resolve) => { release = resolve; });
    this.packMutationQueues.set(packKey, previous.then(() => current));
    await previous;
    try {
      return await action();
    } finally {
      release();
      if (this.packMutationQueues.get(packKey) === current) this.packMutationQueues.delete(packKey);
    }
  }

  async handleUnreadablePackRoot(entryName: string, rootPath: string, error: unknown) {
    if (entryName.startsWith("telegram-")) {
      await fs.rm(rootPath, { recursive: true, force: true });
      return;
    }
    console.warn("Skipping unreadable pack directory", { rootPath, error });
  }

  async tryReadPackRecordFromEntry(entryName: string, rootPath: string): Promise<StickerPackRecord | null> {
    try {
      return await this.readPackRecordFromRoot(rootPath);
    } catch (error) {
      if (!isMissingPathError(error) && !isJsonParseError(error)) throw error;
      await this.handleUnreadablePackRoot(entryName, rootPath, error);
      return null;
    }
  }

  async deleteStickerFilesIfUnreferenced(record: StickerPackRecord, rootPath: string, relativePaths: string[]) {
    const { outputRoot } = resolvePackPaths(rootPath);
    await Promise.all(relativePaths.map(async (relativePath) => {
      if (record.stickers.some((sticker) => sticker.relativePath === relativePath)) return;
      if (record.telegram?.thumbnailPath === path.join(outputRoot, relativePath)) return;
      await fs.rm(path.join(outputRoot, relativePath), { force: true });
    }));
  }

  async readPackRecordById(packId: string) {
    await this.ensureReady();
    const entries = await fs.readdir(this.getPacksRoot(), { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const rootPath = path.join(this.getPacksRoot(), entry.name);
      const record = await this.tryReadPackRecordFromEntry(entry.name, rootPath);
      if (record?.id === packId) return { record, rootPath };
    }
    throw new Error(`Pack not found: ${packId}`);
  }

  async listPacks(): Promise<StickerPack[]> {
    await this.ensureReady();
    const entries = await fs.readdir(this.getPacksRoot(), { withFileTypes: true });
    const packs = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
      const rootPath = path.join(this.getPacksRoot(), entry.name);
      const record = await this.tryReadPackRecordFromEntry(entry.name, rootPath);
      return record ? buildStickerPack(record, rootPath) : null;
    }));
    return packs.filter((pack): pack is StickerPack => pack !== null).sort((left, right) => left.name.localeCompare(right.name));
  }

  async getPack(packId: string): Promise<StickerPackDetails> {
    const { record, rootPath } = await this.readPackRecordById(packId);
    return hydratePackDetails(record, rootPath);
  }

  async findPackByTelegramStickerSetId(stickerSetId: string) {
    await this.ensureReady();
    const entries = await fs.readdir(this.getPacksRoot(), { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const rootPath = path.join(this.getPacksRoot(), entry.name);
      const record = await this.tryReadPackRecordFromEntry(entry.name, rootPath);
      if (record?.telegram?.stickerSetId === stickerSetId) return { record, rootPath };
    }
    return null;
  }
}
