import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type {
  AssetId,
  DownloadState,
  SourceMediaKind,
  StickerPackDetails,
  StickerPackRecord,
  TelegramAssetMetadata,
  TelegramPackSummary,
} from "@sticker-smith/shared";

import type { SettingsService } from "./settingsService";
import { collectTelegramAssetSignatures } from "./telegramAssetSignatures";
import {
  compareAssetsByOrder,
  compactStickerOrders,
  createDefaultTelegramSummary,
} from "./packNormalizer";
import {
  hydratePackDetails,
  PackRepository,
  resolvePackPaths,
} from "./packRepository";
import { findStickerOutput } from "../utils/packQueries";
import { pathExists, sha256ForFile } from "../utils/fsUtils";
import { nowIso } from "../utils/timeUtils";

export interface TelegramMirrorAssetInput {
  id?: string;
  relativePath: string;
  emojiList: string[];
  kind?: SourceMediaKind;
  downloadState: DownloadState;
  telegram: TelegramAssetMetadata;
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
  assets: TelegramMirrorAssetInput[];
}

type StickerAssetRecord = StickerPackRecord["assets"][number];

interface ResolvedTelegramMirrorAssets {
  remoteAssets: StickerAssetRecord[];
  localOnlyAssets: StickerAssetRecord[];
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

function sourceAssetRelativePath(assetId: string, kind: SourceMediaKind) {
  return `${assetId}.${kind}`;
}

function stickerOutputRelativePath(assetId: string) {
  return `${assetId}.webm`;
}

async function syncTelegramThumbnailFile(
  rootPath: string,
  thumbnailPath: string | null,
  options: {
    hasThumbnail?: boolean;
    preferredExtension?: string | null;
  } = {},
) {
  const { outputRoot } = resolvePackPaths(rootPath);
  await fs.mkdir(outputRoot, { recursive: true });
  const entries = await fs.readdir(outputRoot, { withFileTypes: true });
  const existingIconPaths = entries
    .filter(
      (entry) => entry.isFile() && entry.name.startsWith("telegram-pack-icon."),
    )
    .map((entry) => path.join(outputRoot, entry.name));

  const removeExistingIcons = async (excludedPath?: string) =>
    Promise.all(
      existingIconPaths
        .filter((existingPath) => existingPath !== excludedPath)
        .map((existingPath) => fs.rm(existingPath, { force: true })),
    );

  const resolveThumbnailExtension = (sourcePath: string | null) =>
    path.extname(sourcePath ?? "") || options.preferredExtension || ".bin";

  if (!thumbnailPath) {
    if (options.hasThumbnail && existingIconPaths.length > 0) {
      const existingPath = existingIconPaths[0]!;
      const expectedExtension =
        options.preferredExtension || path.extname(existingPath) || ".bin";
      const expectedPath = path.join(
        outputRoot,
        `telegram-pack-icon${expectedExtension}`,
      );

      if (existingPath !== expectedPath) {
        await fs.copyFile(existingPath, expectedPath);
        await removeExistingIcons(expectedPath);
        return expectedPath;
      }

      await removeExistingIcons(existingPath);
      return existingPath;
    }

    await removeExistingIcons();
    return null;
  }

  const extension = resolveThumbnailExtension(thumbnailPath);
  const destination = path.join(outputRoot, `telegram-pack-icon${extension}`);
  if (thumbnailPath !== destination) {
    await fs.copyFile(thumbnailPath, destination);
  }
  await removeExistingIcons(destination);
  return destination;
}

async function migrateTelegramAssetFile(
  rootPath: string,
  currentRelativePath: string | null,
  nextRelativePath: string,
) {
  if (!currentRelativePath || currentRelativePath === nextRelativePath) {
    return;
  }

  const { sourceRoot } = resolvePackPaths(rootPath);
  const currentAbsolutePath = path.join(sourceRoot, currentRelativePath);
  const nextAbsolutePath = path.join(sourceRoot, nextRelativePath);
  if (!(await pathExists(currentAbsolutePath))) {
    return;
  }

  await fs.mkdir(path.dirname(nextAbsolutePath), { recursive: true });
  if (await pathExists(nextAbsolutePath)) {
    await fs.rm(currentAbsolutePath, { force: true });
    return;
  }

  await fs.rename(currentAbsolutePath, nextAbsolutePath);
}

export class TelegramMirrorStore {
  constructor(
    private readonly repo: PackRepository,
    private readonly settingsService: SettingsService,
  ) {}

  private buildExistingTelegramAssetByStickerId(
    existing: StickerPackRecord | null,
  ) {
    return new Map(
      (existing?.assets ?? [])
        .filter((asset) => asset.telegram)
        .map((asset) => [asset.telegram!.stickerId, asset]),
    );
  }

  private async resolveTelegramMirrorAssets(
    rootPath: string,
    existing: StickerPackRecord | null,
    input: TelegramMirrorUpsertInput,
  ): Promise<ResolvedTelegramMirrorAssets> {
    const existingByStickerId = this.buildExistingTelegramAssetByStickerId(
      existing,
    );
    const remoteAssets = await Promise.all(
      input.assets
        .slice()
        .sort((left, right) => left.telegram.position - right.telegram.position)
        .map(async (assetInput, index) => {
          const existingAsset = existingByStickerId.get(
            assetInput.telegram.stickerId,
          );
          const assetId = existingAsset?.id ?? assetInput.id ?? randomUUID();
          const relativePath = sourceAssetRelativePath(
            assetId,
            assetInput.kind ?? "webm",
          );

          await migrateTelegramAssetFile(
            rootPath,
            existingAsset?.relativePath ?? null,
            relativePath,
          );

          const localFileExists = await pathExists(
            path.join(resolvePackPaths(rootPath).sourceRoot, relativePath),
          );

          return {
            id: assetId,
            packId: existing?.id ?? `telegram-${input.stickerSetId}`,
            order: index,
            relativePath,
            originalFileName:
              existingAsset?.originalFileName ??
              path.basename(assetInput.relativePath),
            emojiList: assetInput.emojiList,
            kind: assetInput.kind ?? "webm",
            importedAt: existingAsset?.importedAt ?? nowIso(),
            originalImportPath: existingAsset?.originalImportPath ?? null,
            downloadState: localFileExists ? "ready" : assetInput.downloadState,
            telegram: {
              ...assetInput.telegram,
              baselineOutputHash:
                existingAsset?.telegram?.baselineOutputHash ??
                assetInput.telegram.baselineOutputHash ??
                null,
              position: index,
            },
          } satisfies StickerAssetRecord;
        }),
    );

    const localOnlyAssets = (existing?.assets ?? [])
      .filter((asset) => asset.telegram === undefined)
      .slice()
      .sort(compareAssetsByOrder)
      .map((asset, index) => ({
        ...asset,
        order: remoteAssets.length + index,
      }));

    return {
      remoteAssets,
      localOnlyAssets,
    };
  }

  private resolveTelegramIconStickerId(
    existing: StickerPackRecord | null,
    input: TelegramMirrorUpsertInput,
    assets: StickerAssetRecord[],
  ) {
    const thumbnailAsset = input.thumbnailStickerId
      ? assets.find((asset) => asset.telegram?.stickerId === input.thumbnailStickerId)
      : null;
    if (thumbnailAsset) {
      return thumbnailAsset.id;
    }

    return existing?.iconStickerId &&
      assets.some((asset) => asset.id === existing.iconStickerId)
      ? existing.iconStickerId
      : null;
  }

  private buildTelegramMirrorRecord(input: {
    existing: StickerPackRecord | null;
    upsertInput: TelegramMirrorUpsertInput;
    storedThumbnailPath: string | null;
    remoteAssets: StickerAssetRecord[];
    localOnlyAssets: StickerAssetRecord[];
  }) {
    const allAssets = [...input.remoteAssets, ...input.localOnlyAssets];

    return {
      schemaVersion: 4,
      id: input.existing?.id ?? `telegram-${input.upsertInput.stickerSetId}`,
      source: "telegram",
      name: input.upsertInput.title,
      slug: slugify(input.upsertInput.shortName || input.upsertInput.title),
      iconStickerId: this.resolveTelegramIconStickerId(
        input.existing,
        input.upsertInput,
        allAssets,
      ),
      iconAssetId: this.resolveTelegramIconStickerId(
        input.existing,
        input.upsertInput,
        allAssets,
      ),
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
        publishedFromLocalPackId:
          input.upsertInput.publishedFromLocalPackId ??
          input.existing?.telegram?.publishedFromLocalPackId ??
          null,
      }),
      createdAt: input.existing?.createdAt ?? nowIso(),
      updatedAt: input.existing?.updatedAt ?? nowIso(),
      stickers: allAssets.map((asset) => {
        const existingOutput = input.existing?.outputs.find(
          (output) => output.sourceAssetId === asset.id && output.mode === "sticker",
        );

        return {
          id: asset.id,
          packId: asset.packId,
          order: asset.order,
          relativePath: existingOutput?.relativePath ?? stickerOutputRelativePath(asset.id),
          originalFileName: asset.originalFileName,
          emojiList: asset.emojiList,
          sizeBytes: existingOutput?.sizeBytes ?? 0,
          sha256: existingOutput?.sha256 ?? null,
          importedAt: asset.importedAt,
          updatedAt: existingOutput?.updatedAt ?? nowIso(),
          downloadState: asset.downloadState,
          telegram: asset.telegram,
        };
      }),
      assets: allAssets,
      outputs:
        input.existing?.outputs.filter((output) =>
          allAssets.some((asset) => asset.id === output.sourceAssetId),
        ) ?? [],
    } satisfies StickerPackRecord;
  }

  async reconcileTelegramMirrorOutputs(
    record: StickerPackRecord,
    rootPath: string,
    options: {
      baselineFallbackByAssetId?: ReadonlyMap<AssetId, string | null>;
    } = {},
  ) {
    if (record.source !== "telegram") {
      return;
    }

    void options;
    const { outputRoot } = resolvePackPaths(rootPath);
    const stickerById = new Map(record.stickers.map((sticker) => [sticker.id, sticker]));
    const nextOutputs: StickerPackRecord["outputs"] = [];

    for (const output of record.outputs) {
      if (output.mode !== "sticker") {
        nextOutputs.push(output);
        continue;
      }

      const sticker = stickerById.get(output.sourceAssetId);
      const outputPath = path.join(outputRoot, output.relativePath);
      if (!sticker || !(await pathExists(outputPath))) {
        if (sticker?.downloadState === "ready") {
          sticker.downloadState = "missing";
        }
        continue;
      }

      nextOutputs.push(output);
    }

    record.outputs = nextOutputs;

    for (const sticker of record.stickers) {
      if (!sticker.telegram || sticker.downloadState !== "ready") {
        continue;
      }

      const outputPath = path.join(outputRoot, sticker.relativePath);
      if (!(await pathExists(outputPath))) {
        sticker.downloadState = "missing";
        continue;
      }

      const stat = await fs.stat(outputPath);
      const sha256 = sticker.sha256 ?? (await sha256ForFile(outputPath));
      sticker.sizeBytes = stat.size;
      sticker.sha256 = sha256;
      sticker.telegram.baselineOutputHash ??= sha256;

      record.outputs = record.outputs.filter(
        (item) => !(item.mode === "sticker" && item.sourceAssetId === sticker.id),
      );
      record.outputs.push({
        packId: record.id,
        sourceAssetId: sticker.id,
        order: sticker.order,
        mode: "sticker",
        relativePath: sticker.relativePath,
        sizeBytes: stat.size,
        sha256,
        updatedAt: sticker.updatedAt,
      });
    }
  }

  async pruneDuplicateLocalTelegramAssets(
    record: StickerPackRecord,
    rootPath: string,
  ) {
    if (record.source !== "telegram") {
      return;
    }

    const { sourceRoot, outputRoot } = resolvePackPaths(rootPath);
    const remoteSignatures = new Set<string>();
    const duplicateAssetIds = new Set<AssetId>();

    for (const asset of record.assets) {
      if (!asset.telegram || asset.id === record.iconAssetId) {
        continue;
      }

      const output = findStickerOutput(record.outputs, asset.id);
      const sourcePath = path.join(sourceRoot, asset.relativePath);
      const sourceSha256 =
        asset.telegram.baselineOutputHash ?? (await sha256ForFile(sourcePath));

      for (const signature of collectTelegramAssetSignatures({
        emojis: asset.emojiList,
        sha256Values: [sourceSha256, output?.sha256 ?? null],
      })) {
        if (signature) {
          remoteSignatures.add(signature);
        }
      }
    }

    for (const asset of record.assets) {
      if (asset.telegram || asset.id === record.iconAssetId) {
        continue;
      }

      const output = findStickerOutput(record.outputs, asset.id);
      const signatures = collectTelegramAssetSignatures({
        emojis: asset.emojiList,
        sha256Values: [output?.sha256 ?? null],
      });
      if (!signatures.some((signature) => remoteSignatures.has(signature))) {
        continue;
      }

      duplicateAssetIds.add(asset.id);
    }

    if (duplicateAssetIds.size === 0) {
      return;
    }

    const removedAssets = record.assets.filter((asset) =>
      duplicateAssetIds.has(asset.id),
    );
    const removedOutputs = record.outputs.filter((output) =>
      duplicateAssetIds.has(output.sourceAssetId),
    );

    record.assets = record.assets.filter(
      (asset) => !duplicateAssetIds.has(asset.id),
    );
    record.outputs = record.outputs.filter(
      (output) => !duplicateAssetIds.has(output.sourceAssetId),
    );

    for (const asset of removedAssets) {
      if (
        record.assets.some(
          (candidate) => candidate.relativePath === asset.relativePath,
        )
      ) {
        continue;
      }

      await fs.rm(path.join(sourceRoot, asset.relativePath), { force: true });
    }

    for (const output of removedOutputs) {
      if (
        record.outputs.some(
          (candidate) => candidate.relativePath === output.relativePath,
        )
      ) {
        continue;
      }

      await fs.rm(path.join(outputRoot, output.relativePath), { force: true });
    }

    compactStickerOrders(record);
  }

  async upsertTelegramMirror(
    input: TelegramMirrorUpsertInput,
  ): Promise<StickerPackDetails> {
    await this.repo.ensureReady();

    return this.repo.withPackMutationLock(`telegram:${input.stickerSetId}`, async () => {
      const directoryName = `telegram-${input.stickerSetId}`;
      const rootPath = this.settingsService.getPackRoot(directoryName);
      const existing = (await pathExists(resolvePackPaths(rootPath).packFilePath))
        ? await this.repo.readPackRecordFromRoot(rootPath)
        : null;
      const storedThumbnailPath = await syncTelegramThumbnailFile(
        rootPath,
        input.thumbnailPath,
        {
          hasThumbnail: input.hasThumbnail,
          preferredExtension: input.thumbnailExtension,
        },
      );
      const { remoteAssets, localOnlyAssets } =
        await this.resolveTelegramMirrorAssets(rootPath, existing, input);
      const record = this.buildTelegramMirrorRecord({
        existing,
        upsertInput: input,
        storedThumbnailPath,
        remoteAssets,
        localOnlyAssets,
      });

      compactStickerOrders(record);
      await this.reconcileTelegramMirrorOutputs(record, rootPath);
      await this.pruneDuplicateLocalTelegramAssets(record, rootPath);
      await this.repo.writePackRecord(rootPath, record);
      return hydratePackDetails(record, rootPath);
    });
  }

  async writeTelegramAssetFile(input: {
    packId: string;
    assetId: string;
    sourceFilePath: string;
    relativePath?: string;
    baselineOutputHash?: string | null;
  }) {
    return this.repo.withPackMutationLock(input.packId, async () => {
      const { record, rootPath } = await this.repo.readPackRecordById(input.packId);
      const sticker = record.stickers.find((item) => item.id === input.assetId);
      if (!sticker) {
        throw new Error(`Sticker not found: ${input.assetId}`);
      }
      const asset = record.assets.find((item) => item.id === input.assetId);
      const baselineFallbackByAssetId = new Map<AssetId, string | null>();
      if (sticker.telegram) {
        baselineFallbackByAssetId.set(
          sticker.id,
          sticker.telegram.baselineOutputHash ?? null,
        );
      }

      const nextRelativePath = input.relativePath ?? stickerOutputRelativePath(sticker.id);
      const destination = path.join(
        resolvePackPaths(rootPath).outputRoot,
        nextRelativePath,
      );

      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.copyFile(input.sourceFilePath, destination);

      const sizeBytes = (await fs.stat(destination)).size;
      const sha256 = await sha256ForFile(destination);
      sticker.relativePath = nextRelativePath;
      sticker.downloadState = "ready";
      sticker.sizeBytes = sizeBytes;
      sticker.sha256 = sha256;
      sticker.updatedAt = nowIso();
      if (sticker.telegram && input.baselineOutputHash !== undefined) {
        sticker.telegram.baselineOutputHash = input.baselineOutputHash;
      } else if (sticker.telegram) {
        sticker.telegram.baselineOutputHash = sha256;
      }

      if (asset) {
        asset.relativePath = nextRelativePath;
        asset.downloadState = "ready";
        if (asset.telegram && sticker.telegram) {
          asset.telegram.baselineOutputHash = sticker.telegram.baselineOutputHash;
        }
      }
      record.outputs = record.outputs.filter(
        (output) => !(output.sourceAssetId === sticker.id && output.mode === "sticker"),
      );
      record.outputs.push({
        packId: record.id,
        sourceAssetId: sticker.id,
        order: sticker.order,
        mode: "sticker",
        relativePath: nextRelativePath,
        sizeBytes,
        sha256,
        updatedAt: sticker.updatedAt,
      });

      await this.reconcileTelegramMirrorOutputs(record, rootPath, {
        baselineFallbackByAssetId,
      });
      await this.pruneDuplicateLocalTelegramAssets(record, rootPath);
      await this.repo.writePackRecord(rootPath, record);
      return hydratePackDetails(record, rootPath);
    });
  }

  async setTelegramAssetDownloadState(input: {
    packId: string;
    assetId: string;
    downloadState: DownloadState;
  }) {
    return this.repo.withPackMutationLock(input.packId, async () => {
      const { record, rootPath } = await this.repo.readPackRecordById(input.packId);
      const sticker = record.stickers.find((item) => item.id === input.assetId);
      if (!sticker) {
        throw new Error(`Sticker not found: ${input.assetId}`);
      }
      sticker.downloadState = input.downloadState;
      const asset = record.assets.find((item) => item.id === input.assetId);
      if (asset) {
        asset.downloadState = input.downloadState;
      }
      await this.repo.writePackRecord(rootPath, record);
      return hydratePackDetails(record, rootPath);
    });
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
    return this.repo.withPackMutationLock(input.packId, async () => {
      const { record, rootPath } = await this.repo.readPackRecordById(input.packId);
      if (!record.telegram) {
        throw new Error(`Pack is not a Telegram mirror: ${input.packId}`);
      }

      if (input.title) {
        record.name = input.title;
        record.telegram.title = input.title;
      }
      if (input.shortName) {
        record.slug = slugify(input.shortName);
        record.telegram.shortName = input.shortName;
      }
      if (input.thumbnailPath !== undefined) {
        record.telegram.thumbnailPath = input.thumbnailPath;
      }
      if (input.syncState) {
        record.telegram.syncState = input.syncState;
      }
      if (input.lastSyncedAt !== undefined) {
        record.telegram.lastSyncedAt = input.lastSyncedAt;
      }
      if (input.lastSyncError !== undefined) {
        record.telegram.lastSyncError = input.lastSyncError;
      }
      if (input.publishedFromLocalPackId !== undefined) {
        record.telegram.publishedFromLocalPackId =
          input.publishedFromLocalPackId;
      }

      await this.repo.writePackRecord(rootPath, record);
      return hydratePackDetails(record, rootPath);
    });
  }

  async syncTelegramThumbnail(input: {
    packId: string;
    thumbnailPath: string | null;
    hasThumbnail?: boolean;
    thumbnailExtension?: string | null;
  }) {
    return this.repo.withPackMutationLock(input.packId, async () => {
      const { record, rootPath } = await this.repo.readPackRecordById(input.packId);
      if (!record.telegram) {
        throw new Error(`Pack is not a Telegram mirror: ${input.packId}`);
      }

      record.telegram.thumbnailPath = await syncTelegramThumbnailFile(
        rootPath,
        input.thumbnailPath,
        {
          hasThumbnail: input.hasThumbnail,
          preferredExtension: input.thumbnailExtension,
        },
      );

      await this.repo.writePackRecord(rootPath, record);
      return hydratePackDetails(record, rootPath);
    });
  }
}
