import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type {
  OutputArtifact,
  PackSource,
  SourceAsset,
  StickerPack,
  StickerPackDetails,
  StickerPackRecord,
} from "@sticker-smith/shared";

import type { SettingsService } from "./settingsService";
import {
  normalizePackRecord,
  sortPackRecord,
} from "./packNormalizer";
import { pathExists } from "../utils/fsUtils";
import { nowIso } from "../utils/timeUtils";

export function resolvePackPaths(rootPath: string) {
  return {
    packFilePath: path.join(rootPath, "pack.json"),
    sourceRoot: path.join(rootPath, "source"),
    outputRoot: path.join(rootPath, "webm"),
  };
}

function isJsonParseError(error: unknown) {
  return error instanceof SyntaxError;
}

function isMissingPathError(error: unknown) {
  return (error as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
}

function buildStickerPack(
  record: StickerPackRecord,
  rootPath: string,
): StickerPack {
  const { outputRoot } = resolvePackPaths(rootPath);
  const iconSticker =
    record.iconStickerId === null
      ? null
      : record.stickers.find((sticker) => sticker.id === record.iconStickerId) ?? null;
  const iconOutput = record.outputs.find((output) => output.mode === "icon");
  const thumbnailPath = iconOutput
    ? path.join(outputRoot, iconOutput.relativePath)
    : iconSticker
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
    sourceRoot: resolvePackPaths(rootPath).sourceRoot,
    outputRoot,
    iconStickerId: record.iconStickerId,
    iconAssetId: record.iconAssetId,
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

function stickerToCompatAsset(
  record: StickerPackRecord,
  rootPath: string,
  sticker: StickerPackRecord["stickers"][number],
): SourceAsset {
  return {
    id: sticker.id,
    packId: sticker.packId,
    order: sticker.order,
    relativePath: sticker.relativePath,
    absolutePath:
      record.source === "telegram" && sticker.downloadState !== "ready"
        ? null
        : path.join(resolvePackPaths(rootPath).outputRoot, sticker.relativePath),
    originalFileName: sticker.originalFileName,
    emojiList: sticker.emojiList,
    kind: "webm",
    importedAt: sticker.importedAt,
    originalImportPath: null,
    downloadState: sticker.downloadState ?? "ready",
    telegram: sticker.telegram,
  };
}

function stickerToCompatOutput(
  record: StickerPackRecord,
  rootPath: string,
  sticker: StickerPackRecord["stickers"][number],
): OutputArtifact {
  return {
    packId: sticker.packId,
    sourceAssetId: sticker.id,
    order: sticker.order,
    mode: sticker.id === record.iconStickerId ? "icon" : "sticker",
    relativePath: sticker.relativePath,
    absolutePath: path.join(resolvePackPaths(rootPath).outputRoot, sticker.relativePath),
    sizeBytes: sticker.sizeBytes,
    sha256: sticker.sha256,
    updatedAt: sticker.updatedAt,
  };
}

export function hydratePackDetails(
  record: StickerPackRecord,
  rootPath: string,
): StickerPackDetails {
  const { outputRoot } = resolvePackPaths(rootPath);
  const stickers = record.stickers.map((sticker) => ({
    ...sticker,
    absolutePath: path.join(outputRoot, sticker.relativePath),
  }));
  const standaloneIconOutput =
    record.iconAssetId === null && record.telegram?.thumbnailPath
      ? {
          packId: record.id,
          sourceAssetId: "__pack_icon__",
          order: -1,
          mode: "icon" as const,
          relativePath: path.basename(record.telegram.thumbnailPath),
          absolutePath: record.telegram.thumbnailPath,
          sizeBytes: 0,
          sha256: null,
          updatedAt: record.updatedAt,
        }
      : null;

  const stickerIds = new Set(record.stickers.map((sticker) => sticker.id));
  return {
    pack: buildStickerPack(record, rootPath),
    stickers,
    assets: [
      ...record.stickers.map((sticker) =>
        stickerToCompatAsset(record, rootPath, sticker),
      ),
      ...record.assets
        .filter((asset) => !stickerIds.has(asset.id))
        .map((asset) => ({
          ...asset,
          absolutePath: asset.originalImportPath,
        })),
    ],
    outputs: [
      ...(standaloneIconOutput ? [standaloneIconOutput] : []),
      ...record.stickers.map((sticker) =>
        stickerToCompatOutput(record, rootPath, sticker),
      ),
      ...record.outputs
        .filter((output) => output.mode === "icon" || !stickerIds.has(output.sourceAssetId))
        .map((output) => ({
          ...output,
          absolutePath: path.join(outputRoot, output.relativePath),
        })),
    ],
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
      const parsed = JSON.parse(raw) as Partial<StickerPackRecord> & {
        source?: PackSource;
      };
      const record = normalizePackRecord(parsed);
      return record;
    } catch (error) {
      if (!isJsonParseError(error) || !(await pathExists(backupFilePath))) {
        throw error;
      }

      const raw = await fs.readFile(backupFilePath, "utf8");
      const record = normalizePackRecord(
        JSON.parse(raw) as Partial<StickerPackRecord> & {
          source?: PackSource;
        },
      );
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
      iconAssetId: record.iconAssetId,
      telegramShortName: record.telegramShortName,
      telegram: record.telegram,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      stickers: record.stickers,
      assets: record.assets.filter((asset) =>
        record.stickers.every((sticker) => sticker.id !== asset.id),
      ),
      outputs: record.outputs.filter((output) =>
        record.stickers.every((sticker) => sticker.id !== output.sourceAssetId),
      ),
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

  async withPackMutationLock<T>(
    packKey: string,
    action: () => Promise<T>,
  ): Promise<T> {
    const previous = this.packMutationQueues.get(packKey) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.packMutationQueues.set(packKey, previous.then(() => current));

    await previous;
    try {
      return await action();
    } finally {
      release();
      if (this.packMutationQueues.get(packKey) === current) {
        this.packMutationQueues.delete(packKey);
      }
    }
  }

  async handleUnreadablePackRoot(
    entryName: string,
    rootPath: string,
    error: unknown,
  ) {
    if (entryName.startsWith("telegram-")) {
      await fs.rm(rootPath, { recursive: true, force: true });
      return;
    }

    console.warn("Skipping unreadable pack directory", {
      rootPath,
      error,
    });
  }

  async tryReadPackRecordFromEntry(
    entryName: string,
    rootPath: string,
  ): Promise<StickerPackRecord | null> {
    try {
      return await this.readPackRecordFromRoot(rootPath);
    } catch (error) {
      if (!isMissingPathError(error) && !isJsonParseError(error)) {
        throw error;
      }

      await this.handleUnreadablePackRoot(entryName, rootPath, error);
      return null;
    }
  }

  async deleteOutputFilesIfUnreferenced(
    record: StickerPackRecord,
    rootPath: string,
    outputs: StickerPackRecord["outputs"],
  ) {
    const { outputRoot } = resolvePackPaths(rootPath);
    await Promise.all(
      outputs.map(async (output) => {
        if (
          record.outputs.some(
            (candidate) => candidate.relativePath === output.relativePath,
          )
        ) {
          return;
        }

        await fs.rm(path.join(outputRoot, output.relativePath), { force: true });
      }),
    );
  }

  async readPackRecordById(packId: string) {
    await this.ensureReady();
    const packsRoot = this.getPacksRoot();
    const entries = await fs.readdir(packsRoot, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const rootPath = path.join(packsRoot, entry.name);
      const record = await this.tryReadPackRecordFromEntry(entry.name, rootPath);
      if (!record) {
        continue;
      }
      if (record.id === packId) {
        return { record, rootPath };
      }
    }

    throw new Error(`Pack not found: ${packId}`);
  }

  async listPacks(): Promise<StickerPack[]> {
    await this.ensureReady();
    const packsRoot = this.getPacksRoot();
    const entries = await fs.readdir(packsRoot, { withFileTypes: true });
    const packs = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const rootPath = path.join(packsRoot, entry.name);
          const record = await this.tryReadPackRecordFromEntry(entry.name, rootPath);
          return record ? buildStickerPack(record, rootPath) : null;
        }),
    );

    return packs
      .filter((pack): pack is StickerPack => pack !== null)
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async getPack(packId: string): Promise<StickerPackDetails> {
    const { record, rootPath } = await this.readPackRecordById(packId);
    return hydratePackDetails(record, rootPath);
  }

  async findPackByTelegramStickerSetId(stickerSetId: string) {
    await this.ensureReady();
    const packsRoot = this.getPacksRoot();
    const entries = await fs.readdir(packsRoot, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const rootPath = path.join(packsRoot, entry.name);
      const record = await this.tryReadPackRecordFromEntry(entry.name, rootPath);
      if (!record) {
        continue;
      }
      if (record.telegram?.stickerSetId === stickerSetId) {
        return { record, rootPath };
      }
    }

    return null;
  }
}
