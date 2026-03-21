import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type {
  AssetId,
  DownloadState,
  ImportResult,
  OutputArtifact,
  SourceAsset,
  SourceMediaKind,
  StickerPack,
  StickerPackDetails,
  StickerPackRecord,
  TelegramPackSummary,
} from "@sticker-smith/shared";
import { supportedMediaKinds } from "@sticker-smith/shared";

import type { SettingsService } from "./settingsService";
import {
  compareAssetsByOrder,
  compactStickerOrders,
  syncOutputOrders,
} from "./packNormalizer";
import {
  hydratePackDetails,
  PackRepository,
  resolvePackPaths,
} from "./packRepository";
import { TelegramMirrorStore } from "./telegramMirrorStore";
import { pathExists, sha256ForFile } from "../utils/fsUtils";
import { nowIso } from "../utils/timeUtils";
import { findStickerOutput } from "../utils/packQueries";

const supportedMediaKindsSet = new Set<SourceMediaKind>(supportedMediaKinds);

type StickerAssetRecord = StickerPackRecord["assets"][number];
type StickerOutputRecord = StickerPackRecord["outputs"][number];

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "pack"
  );
}

function normalizeRelativePath(input: string) {
  return input.replace(/\\/g, "/").replace(/^\/+/, "");
}

export function sourceAssetRelativePath(assetId: string, kind: SourceMediaKind) {
  return `${assetId}.${kind}`;
}

function stickerOutputRelativePath(assetId: string) {
  return `${assetId}.webm`;
}

function iconOutputRelativePath() {
  return "icon.webm";
}

function extToKind(filePath: string): SourceMediaKind | null {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  return supportedMediaKindsSet.has(extension as SourceMediaKind)
    ? (extension as SourceMediaKind)
    : null;
}

function nextStickerOrder(record: StickerPackRecord) {
  return (
    record.assets
      .filter((asset) => asset.id !== record.iconAssetId)
      .reduce((maxOrder, asset) => Math.max(maxOrder, asset.order), -1) + 1
  );
}

async function collectFiles(directoryPath: string): Promise<string[]> {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const result: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await collectFiles(absolutePath)));
    } else if (entry.isFile()) {
      result.push(absolutePath);
    }
  }

  return result;
}

export class LibraryService {
  private readonly repo: PackRepository;
  private readonly telegramMirrorStore: TelegramMirrorStore;

  constructor(private readonly settingsService: SettingsService) {
    this.repo = new PackRepository(settingsService);
    this.telegramMirrorStore = new TelegramMirrorStore(this.repo, settingsService);
  }

  private buildUpdatedPackDetails(record: StickerPackRecord, rootPath: string) {
    return hydratePackDetails(record, rootPath);
  }

  private markTelegramMirrorStale(record: StickerPackRecord) {
    if (record.telegram) {
      record.telegram.syncState = "stale";
    }
  }

  private async reconcileStaleTelegramMirror(
    record: StickerPackRecord,
    rootPath: string,
  ) {
    if (!record.telegram) {
      return;
    }

    this.markTelegramMirrorStale(record);
    await this.telegramMirrorStore.reconcileTelegramMirrorOutputs(record, rootPath);
  }

  private async finalizeStickerOrderMutation(
    record: StickerPackRecord,
    rootPath: string,
  ) {
    compactStickerOrders(record);
    await this.reconcileStaleTelegramMirror(record, rootPath);
  }

  private async importAbsoluteFile(
    record: StickerPackRecord,
    rootPath: string,
    absolutePath: string,
    _relativePath: string,
  ): Promise<SourceAsset | null> {
    const kind = extToKind(absolutePath);
    if (!kind) {
      return null;
    }

    const assetId = randomUUID();
    const nextRelativePath = sourceAssetRelativePath(assetId, kind);
    const destination = path.join(
      resolvePackPaths(rootPath).sourceRoot,
      nextRelativePath,
    );
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(absolutePath, destination);

    const asset: SourceAsset = {
      id: assetId,
      packId: record.id,
      order: nextStickerOrder(record),
      relativePath: nextRelativePath,
      absolutePath: destination,
      originalFileName: path.basename(absolutePath),
      emojiList: [],
      kind,
      importedAt: nowIso(),
      originalImportPath: absolutePath,
      downloadState: "ready",
    };

    record.assets.push({
      id: asset.id,
      packId: asset.packId,
      order: asset.order,
      relativePath: asset.relativePath,
      originalFileName: asset.originalFileName,
      emojiList: asset.emojiList,
      kind: asset.kind,
      importedAt: asset.importedAt,
      originalImportPath: asset.originalImportPath,
      downloadState: asset.downloadState,
    });

    return asset;
  }

  private async deleteOutputsForAsset(
    record: StickerPackRecord,
    rootPath: string,
    assetId: AssetId,
  ) {
    await this.removeOutputs(
      record,
      rootPath,
      (output) => output.sourceAssetId === assetId,
    );
  }

  private async clearIconOutput(
    record: StickerPackRecord,
    rootPath: string,
  ) {
    await this.removeOutputs(record, rootPath, (output) => output.mode === "icon");
    await fs.rm(path.join(resolvePackPaths(rootPath).outputRoot, "icon.webm"), {
      force: true,
    });
  }

  private async removeOutputs(
    record: StickerPackRecord,
    rootPath: string,
    predicate: (output: StickerOutputRecord) => boolean,
  ) {
    const removedOutputs = record.outputs.filter(predicate);
    if (removedOutputs.length === 0) {
      return;
    }

    record.outputs = record.outputs.filter((output) => !predicate(output));
    await this.repo.deleteOutputFilesIfUnreferenced(record, rootPath, removedOutputs);
  }

  private async finalizeAssetMutation(
    record: StickerPackRecord,
    rootPath: string,
    assetIds: AssetId[],
  ) {
    if (record.telegram) {
      await this.reconcileStaleTelegramMirror(record, rootPath);
      return;
    }

    for (const assetId of assetIds) {
      await this.deleteOutputsForAsset(record, rootPath, assetId);
    }
  }

  private async deleteAssetRecord(
    record: StickerPackRecord,
    rootPath: string,
    assetId: AssetId,
  ) {
    const assetIndex = record.assets.findIndex((item) => item.id === assetId);
    if (assetIndex === -1) {
      throw new Error(`Asset not found: ${assetId}`);
    }

    const [asset] = record.assets.splice(assetIndex, 1);
    await fs.rm(
      path.join(resolvePackPaths(rootPath).sourceRoot, asset.relativePath),
      { force: true },
    );
    await this.deleteOutputsForAsset(record, rootPath, asset.id);

    if (record.iconAssetId === asset.id) {
      record.iconAssetId = null;
      await this.clearIconOutput(record, rootPath);
    }

    return asset;
  }

  private resolveUniqueRelativePath(
    record: StickerPackRecord,
    relativePath: string,
    excludedAssetId?: string,
  ) {
    const normalized = normalizeRelativePath(relativePath);
    const parsed = path.posix.parse(normalized);
    let candidate = normalized;
    let index = 1;

    while (
      record.assets.some(
        (asset) =>
          asset.relativePath === candidate && asset.id !== excludedAssetId,
      )
    ) {
      candidate = path.posix.join(
        parsed.dir,
        `${parsed.name}-${index}${parsed.ext}`,
      );
      index += 1;
    }

    return candidate;
  }

  private async relocateAsset(
    record: StickerPackRecord,
    rootPath: string,
    asset: StickerPackRecord["assets"][number],
    nextRelativePath: string,
  ) {
    const { sourceRoot } = resolvePackPaths(rootPath);
    const resolvedRelativePath = this.resolveUniqueRelativePath(
      record,
      nextRelativePath,
      asset.id,
    );
    const currentAbsolutePath = path.join(sourceRoot, asset.relativePath);
    const nextAbsolutePath = path.join(sourceRoot, resolvedRelativePath);

    await fs.mkdir(path.dirname(nextAbsolutePath), { recursive: true });
    if (await pathExists(currentAbsolutePath)) {
      await fs.rename(currentAbsolutePath, nextAbsolutePath);
    }

    asset.relativePath = resolvedRelativePath;
    await this.finalizeAssetMutation(record, rootPath, [asset.id]);
  }

  private async importEntries(
    record: StickerPackRecord,
    rootPath: string,
    files: Array<{ absolutePath: string; relativePath: string }>,
  ) {
    const imported: SourceAsset[] = [];
    const skipped: string[] = [];

    for (const file of files) {
      const asset = await this.importAbsoluteFile(
        record,
        rootPath,
        file.absolutePath,
        file.relativePath,
      );
      if (asset) {
        imported.push(asset);
      } else {
        skipped.push(file.absolutePath);
      }
    }

    if (record.telegram && imported.length > 0) {
      this.markTelegramMirrorStale(record);
    }

    await this.repo.writePackRecord(rootPath, record);
    return { imported, skipped };
  }

  async listPacks(): Promise<StickerPack[]> {
    return this.repo.listPacks();
  }

  async getPack(packId: string): Promise<StickerPackDetails> {
    return this.repo.getPack(packId);
  }

  async getPackRecord(packId: string) {
    return this.repo.readPackRecordById(packId);
  }

  async findPackByTelegramStickerSetId(stickerSetId: string) {
    return this.repo.findPackByTelegramStickerSetId(stickerSetId);
  }

  async mutatePackRecord(
    packId: string,
    mutate: (
      record: StickerPackRecord,
      rootPath: string,
    ) => Promise<void> | void,
  ) {
    return this.repo.withPackMutationLock(packId, async () => {
      const { record, rootPath } = await this.repo.readPackRecordById(packId);
      await mutate(record, rootPath);
      await this.repo.writePackRecord(rootPath, record);
      return this.buildUpdatedPackDetails(record, rootPath);
    });
  }

  async createPack(input: { name: string }): Promise<StickerPack> {
    await this.repo.ensureReady();
    const id = randomUUID();
    const slug = slugify(input.name);
    const directoryName = `${slug}-${id}`;
    const rootPath = this.settingsService.getPackRoot(directoryName);

    await this.repo.ensurePackDirectories(rootPath);

    const now = nowIso();
    const record: StickerPackRecord = {
      schemaVersion: 3,
      id,
      source: "local",
      name: input.name,
      slug,
      iconAssetId: null,
      telegramShortName: null,
      createdAt: now,
      updatedAt: now,
      assets: [],
      outputs: [],
    };

    await this.repo.writePackRecord(rootPath, record);
    return hydratePackDetails(record, rootPath).pack;
  }

  async upsertTelegramMirror(input: Parameters<TelegramMirrorStore["upsertTelegramMirror"]>[0]) {
    return this.telegramMirrorStore.upsertTelegramMirror(input);
  }

  async renamePack(input: {
    packId: string;
    name: string;
  }): Promise<StickerPack> {
    const details = await this.mutatePackRecord(
      input.packId,
      (record) => {
        record.name = input.name;
        record.slug = slugify(input.name);
        if (record.telegram) {
          record.telegram.title = input.name;
          this.markTelegramMirrorStale(record);
        }
      },
    );
    return details.pack;
  }

  async deletePack(input: { packId: string }) {
    const { rootPath } = await this.repo.readPackRecordById(input.packId);
    await fs.rm(rootPath, { recursive: true, force: true });
  }

  async setPackIcon(input: {
    packId: string;
    assetId: string | null;
  }): Promise<StickerPack> {
    const details = await this.mutatePackRecord(
      input.packId,
      async (record, rootPath) => {
        if (
          input.assetId !== null &&
          !record.assets.some((asset) => asset.id === input.assetId)
        ) {
          throw new Error(`Asset not found in pack: ${input.assetId}`);
        }

        const selectedAsset =
          input.assetId === null
            ? null
            : record.assets.find((asset) => asset.id === input.assetId) ?? null;
        record.iconAssetId = input.assetId;
        compactStickerOrders(record);
        if (
          selectedAsset &&
          !(record.source === "telegram" && selectedAsset.telegram)
        ) {
          await this.removeOutputs(
            record,
            rootPath,
            (output) =>
              output.sourceAssetId === input.assetId && output.mode === "sticker",
          );
        }
        await this.clearIconOutput(record, rootPath);
        if (record.telegram) {
          if (input.assetId === null) {
            record.telegram.thumbnailPath = null;
          }
          this.markTelegramMirrorStale(record);
        }
      },
    );

    return details.pack;
  }

  async setPackTelegramShortName(input: {
    packId: string;
    shortName: string | null;
  }): Promise<StickerPack> {
    const details = await this.mutatePackRecord(input.packId, (record) => {
      if (record.source !== "local") {
        throw new Error("Only local packs can store a Telegram short name.");
      }

      record.telegramShortName = input.shortName;
    });

    return details.pack;
  }

  async importFiles(
    packId: string,
    filePaths: string[],
  ): Promise<ImportResult> {
    const { record, rootPath } = await this.repo.readPackRecordById(packId);
    return this.importEntries(
      record,
      rootPath,
      [...filePaths].map((filePath) => ({
        absolutePath: filePath,
        relativePath: path.basename(filePath),
      })),
    );
  }

  async importDirectory(
    packId: string,
    directoryPath: string,
  ): Promise<ImportResult> {
    const { record, rootPath } = await this.repo.readPackRecordById(packId);
    const files = (await collectFiles(directoryPath)).sort();
    return this.importEntries(
      record,
      rootPath,
      files.map((filePath) => ({
        absolutePath: filePath,
        relativePath: normalizeRelativePath(path.relative(directoryPath, filePath)),
      })),
    );
  }

  async renameAsset(input: {
    packId: string;
    assetId: string;
    nextRelativePath: string;
  }) {
    return this.mutatePackRecord(input.packId, async (record, rootPath) => {
      const asset = record.assets.find((item) => item.id === input.assetId);

      if (!asset) {
        throw new Error(`Asset not found: ${input.assetId}`);
      }

      await this.relocateAsset(record, rootPath, asset, input.nextRelativePath);
    });
  }

  async renameManyAssets(input: {
    packId: string;
    assetIds: string[];
    baseName: string;
  }) {
    return this.mutatePackRecord(input.packId, async (record, rootPath) => {
      const selectedAssetIds = [...new Set(input.assetIds)];
      const assets = selectedAssetIds.map((assetId) => {
        const asset = record.assets.find((item) => item.id === assetId);
        if (!asset) {
          throw new Error(`Asset not found: ${assetId}`);
        }
        return asset;
      });

      const stagedMoves = assets.map((asset, index) => {
        const parsed = path.posix.parse(asset.relativePath);
        const candidate = path.posix.join(
          parsed.dir,
          `${input.baseName}-${String(index + 1).padStart(3, "0")}${parsed.ext}`,
        );
        const nextRelativePath = this.resolveUniqueRelativePath(
          record,
          candidate,
          asset.id,
        );

        return {
          asset,
          currentRelativePath: asset.relativePath,
          nextRelativePath,
          tempRelativePath: path.posix.join(
            parsed.dir,
            `.rename-${randomUUID()}${parsed.ext}`,
          ),
        };
      });

      for (const stagedMove of stagedMoves) {
        const currentAbsolutePath = path.join(
          rootPath,
          "source",
          stagedMove.currentRelativePath,
        );
        const tempAbsolutePath = path.join(
          rootPath,
          "source",
          stagedMove.tempRelativePath,
        );
        if (!(await pathExists(currentAbsolutePath))) {
          continue;
        }
        await fs.mkdir(path.dirname(tempAbsolutePath), { recursive: true });
        await fs.rename(currentAbsolutePath, tempAbsolutePath);
      }

      for (const stagedMove of stagedMoves) {
        const tempAbsolutePath = path.join(
          rootPath,
          "source",
          stagedMove.tempRelativePath,
        );
        const nextAbsolutePath = path.join(
          rootPath,
          "source",
          stagedMove.nextRelativePath,
        );
        if (await pathExists(tempAbsolutePath)) {
          await fs.mkdir(path.dirname(nextAbsolutePath), { recursive: true });
          await fs.rename(tempAbsolutePath, nextAbsolutePath);
        }
        stagedMove.asset.relativePath = stagedMove.nextRelativePath;
      }

      await this.finalizeAssetMutation(
        record,
        rootPath,
        stagedMoves.map((stagedMove) => stagedMove.asset.id),
      );
    });
  }

  async setAssetEmojis(input: {
    packId: string;
    assetId: string;
    emojis: string[];
  }) {
    return this.mutatePackRecord(input.packId, async (record, rootPath) => {
      const asset = record.assets.find((item) => item.id === input.assetId);

      if (!asset) {
        throw new Error(`Asset not found: ${input.assetId}`);
      }

      asset.emojiList = [...input.emojis];
      await this.reconcileStaleTelegramMirror(record, rootPath);
    });
  }

  async setManyAssetEmojis(input: {
    packId: string;
    assetIds: string[];
    emojis: string[];
  }) {
    return this.mutatePackRecord(input.packId, async (record, rootPath) => {
      for (const assetId of [...new Set(input.assetIds)]) {
        const asset = record.assets.find((item) => item.id === assetId);

        if (!asset) {
          throw new Error(`Asset not found: ${assetId}`);
        }

        asset.emojiList = [...input.emojis];
      }

      await this.reconcileStaleTelegramMirror(record, rootPath);
    });
  }

  async reorderAsset(input: {
    packId: string;
    assetId: string;
    beforeAssetId: string | null;
  }) {
    return this.mutatePackRecord(input.packId, async (record, rootPath) => {
      if (record.iconAssetId === input.assetId) {
        throw new Error("The icon asset cannot be reordered.");
      }

      if (input.beforeAssetId !== null && record.iconAssetId === input.beforeAssetId) {
        throw new Error("Sticker assets cannot be moved before the icon.");
      }

      const asset = record.assets.find((item) => item.id === input.assetId);
      if (!asset) {
        throw new Error(`Asset not found: ${input.assetId}`);
      }

      const stickerAssets = record.assets
        .filter((item) => item.id !== record.iconAssetId)
        .sort(compareAssetsByOrder);
      const currentIndex = stickerAssets.findIndex((item) => item.id === input.assetId);
      if (currentIndex === -1) {
        throw new Error(`Asset not found: ${input.assetId}`);
      }

      const [moved] = stickerAssets.splice(currentIndex, 1);
      if (!moved) {
        throw new Error(`Asset not found: ${input.assetId}`);
      }

      if (input.beforeAssetId === null) {
        stickerAssets.push(moved);
      } else {
        const nextIndex = stickerAssets.findIndex(
          (item) => item.id === input.beforeAssetId,
        );
        if (nextIndex === -1) {
          throw new Error(`Asset not found: ${input.beforeAssetId}`);
        }

        stickerAssets.splice(nextIndex, 0, moved);
      }

      stickerAssets.forEach((item, index) => {
        item.order = index;
      });
      syncOutputOrders(record);
      await this.reconcileStaleTelegramMirror(record, rootPath);
    });
  }

  async moveAsset(input: {
    packId: string;
    assetId: string;
    nextDirectory: string;
  }) {
    return this.mutatePackRecord(input.packId, async (record, rootPath) => {
      const asset = record.assets.find((item) => item.id === input.assetId);

      if (!asset) {
        throw new Error(`Asset not found: ${input.assetId}`);
      }

      const baseName = path.posix.basename(asset.relativePath);
      await this.relocateAsset(
        record,
        rootPath,
        asset,
        normalizeRelativePath(path.posix.join(input.nextDirectory, baseName)),
      );
    });
  }

  async deleteAsset(input: { packId: string; assetId: string }) {
    return this.mutatePackRecord(input.packId, async (record, rootPath) => {
      await this.deleteAssetRecord(record, rootPath, input.assetId);
      await this.finalizeStickerOrderMutation(record, rootPath);
    });
  }

  async deleteManyAssets(input: { packId: string; assetIds: string[] }) {
    return this.mutatePackRecord(input.packId, async (record, rootPath) => {
      for (const assetId of [...new Set(input.assetIds)]) {
        await this.deleteAssetRecord(record, rootPath, assetId);
      }
      await this.finalizeStickerOrderMutation(record, rootPath);
    });
  }

  async listOutputs(packId: string): Promise<OutputArtifact[]> {
    const { record, rootPath } = await this.repo.readPackRecordById(packId);
    return this.buildUpdatedPackDetails(record, rootPath).outputs;
  }

  async recordConversionResult(
    packId: string,
    result: {
      assetId: string;
      mode: "icon" | "sticker";
      outputFileName: string;
      sizeBytes: number;
    },
  ) {
    const { record, rootPath } = await this.repo.readPackRecordById(packId);
    const sourceAsset = record.assets.find((asset) => asset.id === result.assetId);
    const relativePath =
      result.mode === "icon"
        ? iconOutputRelativePath()
        : stickerOutputRelativePath(result.assetId);
    const absolutePath = path.join(resolvePackPaths(rootPath).outputRoot, relativePath);
    const sha256 = await sha256ForFile(absolutePath);
    if (
      result.mode === "icon" &&
      sourceAsset &&
      !(record.source === "telegram" && sourceAsset.telegram)
    ) {
      await this.removeOutputs(
        record,
        rootPath,
        (output) =>
          output.sourceAssetId === result.assetId && output.mode === "sticker",
      );
    }
    record.outputs = record.outputs.filter(
      (output) =>
        !(
          output.sourceAssetId === result.assetId && output.mode === result.mode
        ),
    );
    record.outputs.push({
      packId: record.id,
      sourceAssetId: result.assetId,
      order: sourceAsset?.order ?? 0,
      mode: result.mode,
      relativePath,
      sizeBytes: result.sizeBytes,
      sha256,
      updatedAt: nowIso(),
    });
    if (record.telegram) {
      this.markTelegramMirrorStale(record);
    }
    await this.repo.writePackRecord(rootPath, record);
  }

  async writeTelegramAssetFile(input: {
    packId: string;
    assetId: string;
    sourceFilePath: string;
    relativePath?: string;
    baselineOutputHash?: string | null;
  }) {
    return this.telegramMirrorStore.writeTelegramAssetFile(input);
  }

  async setTelegramAssetDownloadState(input: {
    packId: string;
    assetId: string;
    downloadState: DownloadState;
  }) {
    return this.telegramMirrorStore.setTelegramAssetDownloadState(input);
  }

  async updateTelegramMirrorMetadata(input: {
    packId: string;
    syncState?: TelegramPackSummary["syncState"];
    lastSyncedAt?: string | null;
    lastSyncError?: string | null;
    title?: string;
    shortName?: string;
    thumbnailPath?: string | null;
    publishedFromLocalPackId?: string | null;
  }) {
    return this.telegramMirrorStore.updateTelegramMirrorMetadata(input);
  }

  async syncTelegramThumbnail(input: {
    packId: string;
    thumbnailPath: string | null;
    hasThumbnail?: boolean;
    thumbnailExtension?: string | null;
  }) {
    return this.telegramMirrorStore.syncTelegramThumbnail(input);
  }

  async getConversionContext(packId: string) {
    return this.getPack(packId);
  }
}
