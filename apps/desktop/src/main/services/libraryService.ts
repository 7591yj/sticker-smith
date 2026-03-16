import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type {
  AssetId,
  DownloadState,
  ImportResult,
  OutputArtifact,
  PackSource,
  SourceAsset,
  SourceMediaKind,
  StickerPack,
  StickerPackDetails,
  StickerPackRecord,
  TelegramAssetMetadata,
  TelegramPackSummary,
} from "@sticker-smith/shared";
import { supportedMediaKinds } from "@sticker-smith/shared";

import type { SettingsService } from "./settingsService";

const supportedMediaKindsSet = new Set<SourceMediaKind>(supportedMediaKinds);

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
  hasThumbnail?: boolean;
  thumbnailExtension?: string | null;
  syncState: TelegramPackSummary["syncState"];
  lastSyncError?: string | null;
  publishedFromLocalPackId: string | null;
  lastSyncedAt: string | null;
  assets: TelegramMirrorAssetInput[];
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

function normalizeRelativePath(input: string) {
  return input.replace(/\\/g, "/").replace(/^\/+/, "");
}

function sourceAssetRelativePath(assetId: string, kind: SourceMediaKind) {
  return `${assetId}.${kind}`;
}

function stickerOutputRelativePath(assetId: string) {
  return `${assetId}.webm`;
}

function iconOutputRelativePath() {
  return "icon.webm";
}

function resolvePackPaths(rootPath: string) {
  return {
    packFilePath: path.join(rootPath, "pack.json"),
    sourceRoot: path.join(rootPath, "source"),
    outputRoot: path.join(rootPath, "webm"),
  };
}

function extToKind(filePath: string): SourceMediaKind | null {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  return supportedMediaKindsSet.has(extension as SourceMediaKind)
    ? (extension as SourceMediaKind)
    : null;
}

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

function compareAssetsByOrder(
  left: Pick<SourceAsset, "id" | "order" | "importedAt">,
  right: Pick<SourceAsset, "id" | "order" | "importedAt">,
) {
  return (
    left.order - right.order ||
    left.importedAt.localeCompare(right.importedAt) ||
    left.id.localeCompare(right.id)
  );
}

function syncOutputOrders(record: StickerPackRecord) {
  const assetOrderById = new Map(record.assets.map((asset) => [asset.id, asset.order]));

  for (const output of record.outputs) {
    output.order = assetOrderById.get(output.sourceAssetId) ?? output.order ?? 0;
  }
}

function compactStickerOrders(record: StickerPackRecord) {
  const stickerAssets = record.assets
    .filter((asset) => asset.id !== record.iconAssetId)
    .sort(compareAssetsByOrder);

  stickerAssets.forEach((asset, index) => {
    asset.order = index;
  });

  syncOutputOrders(record);
}

function sortPackRecord(record: StickerPackRecord) {
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

async function pathExists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function isJsonParseError(error: unknown) {
  return error instanceof SyntaxError;
}

function isMissingPathError(error: unknown) {
  return (error as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
}

async function sha256ForFile(filePath: string): Promise<string | null> {
  try {
    const data = await fs.readFile(filePath);
    return createHash("sha256").update(data).digest("hex");
  } catch {
    return null;
  }
}

async function syncTelegramThumbnailFile(
  rootPath: string,
  thumbnailPath: string | null,
  options: {
    hasThumbnail?: boolean;
    preferredExtension?: string | null;
  } = {},
) {
  const { sourceRoot } = resolvePackPaths(rootPath);
  await fs.mkdir(sourceRoot, { recursive: true });
  const entries = await fs.readdir(sourceRoot, { withFileTypes: true });
  const existingIconPaths = entries
    .filter(
      (entry) => entry.isFile() && entry.name.startsWith("telegram-pack-icon."),
    )
    .map((entry) => path.join(sourceRoot, entry.name));

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
        sourceRoot,
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
  const destination = path.join(sourceRoot, `telegram-pack-icon${extension}`);
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

function createDefaultTelegramSummary(
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

function resolveAssetAbsolutePath(
  record: StickerPackRecord,
  rootPath: string,
  asset: StickerPackRecord["assets"][number],
) {
  if (record.source === "telegram" && asset.downloadState !== "ready") {
    return null;
  }

  return path.join(resolvePackPaths(rootPath).sourceRoot, asset.relativePath);
}

function buildStickerPack(
  record: StickerPackRecord,
  rootPath: string,
): StickerPack {
  const { sourceRoot, outputRoot } = resolvePackPaths(rootPath);
  const iconOutput = record.outputs.find((output) => output.mode === "icon");
  const iconAsset =
    record.iconAssetId === null
      ? null
      : record.assets.find((asset) => asset.id === record.iconAssetId) ?? null;
  const thumbnailPath =
    record.source === "telegram"
      ? record.telegram?.thumbnailPath ??
        (iconAsset && iconAsset.downloadState === "ready"
          ? path.join(sourceRoot, iconAsset.relativePath)
          : null)
      : iconOutput
        ? path.join(outputRoot, iconOutput.relativePath)
        : null;

  return {
    id: record.id,
    source: record.source,
    name: record.name,
    slug: record.slug,
    rootPath,
    sourceRoot,
    outputRoot,
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

function hydratePackDetails(
  record: StickerPackRecord,
  rootPath: string,
): StickerPackDetails {
  const { outputRoot } = resolvePackPaths(rootPath);

  return {
    pack: buildStickerPack(record, rootPath),
    assets: record.assets.map((asset) => ({
      ...asset,
      absolutePath: resolveAssetAbsolutePath(record, rootPath, asset),
    })),
    outputs: record.outputs.map((output) => ({
      ...output,
      absolutePath: path.join(outputRoot, output.relativePath),
    })),
  };
}

function normalizePackRecord(
  record:
    | (Partial<StickerPackRecord> & {
        source?: PackSource;
        assets?: Array<Partial<StickerPackRecord["assets"][number]>>;
        outputs?: Array<Partial<StickerPackRecord["outputs"][number]>>;
      })
    | null
    | undefined,
): StickerPackRecord {
  const now = new Date().toISOString();
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

function enforcePackOutputRoleInvariants(record: StickerPackRecord) {
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

export class LibraryService {
  private readonly packMutationQueues = new Map<string, Promise<void>>();

  constructor(private readonly settingsService: SettingsService) {}

  private async ensureReady() {
    await this.settingsService.ensureLibrary();
  }

  private getPacksRoot() {
    return path.join(this.settingsService.getLibraryRoot(), "packs");
  }

  private async ensurePackDirectories(rootPath: string) {
    const { sourceRoot, outputRoot } = resolvePackPaths(rootPath);
    await fs.mkdir(sourceRoot, { recursive: true });
    await fs.mkdir(outputRoot, { recursive: true });
  }

  private buildUpdatedPackDetails(record: StickerPackRecord, rootPath: string) {
    return hydratePackDetails(record, rootPath);
  }

  private async readPackRecordFromRoot(
    rootPath: string,
  ): Promise<StickerPackRecord> {
    const { packFilePath } = resolvePackPaths(rootPath);
    const backupFilePath = `${packFilePath}.bak`;
    try {
      const raw = await fs.readFile(packFilePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<StickerPackRecord> & {
        source?: PackSource;
      };
      const record = normalizePackRecord(parsed);
      if ((parsed.schemaVersion ?? 2) < 3) {
        await this.writePackRecord(rootPath, record);
      }
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

  private async writePackRecord(rootPath: string, record: StickerPackRecord) {
    const removedOutputs = enforcePackOutputRoleInvariants(record);
    await this.deleteOutputFilesIfUnreferenced(record, rootPath, removedOutputs);
    syncOutputOrders(record);
    sortPackRecord(record);
    record.schemaVersion = 3;
    record.updatedAt = new Date().toISOString();
    await this.ensurePackDirectories(rootPath);
    const { packFilePath } = resolvePackPaths(rootPath);
    const tempFilePath = `${packFilePath}.tmp`;
    const backupFilePath = `${packFilePath}.bak`;
    const serialized = JSON.stringify(record, null, 2);

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

  private async withPackMutationLock<T>(
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

  private async handleUnreadablePackRoot(
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

  private async tryReadPackRecordFromEntry(
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

  private async readPackRecordById(packId: string) {
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
      importedAt: new Date().toISOString(),
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

  private async deleteOutputFilesIfUnreferenced(
    record: StickerPackRecord,
    rootPath: string,
    outputs: StickerPackRecord["outputs"],
  ) {
    if (outputs.length === 0) {
      return;
    }

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

  private async removeOutputs(
    record: StickerPackRecord,
    rootPath: string,
    predicate: (output: StickerPackRecord["outputs"][number]) => boolean,
  ) {
    const removedOutputs = record.outputs.filter(predicate);
    if (removedOutputs.length === 0) {
      return;
    }

    record.outputs = record.outputs.filter((output) => !predicate(output));
    await this.deleteOutputFilesIfUnreferenced(record, rootPath, removedOutputs);
  }

  private async finalizeAssetMutation(
    record: StickerPackRecord,
    rootPath: string,
    assetIds: AssetId[],
  ) {
    if (record.telegram) {
      record.telegram.syncState = "stale";
      await this.reconcileTelegramMirrorOutputs(record, rootPath);
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
      record.telegram.syncState = "stale";
    }

    await this.writePackRecord(rootPath, record);
    return { imported, skipped };
  }

  private getStickerOutputForAsset(
    record: StickerPackRecord,
    assetId: AssetId,
  ) {
    return record.outputs.find(
      (output) => output.sourceAssetId === assetId && output.mode === "sticker",
    );
  }

  private async reconcileTelegramMirrorOutputs(
    record: StickerPackRecord,
    rootPath: string,
    options: {
      baselineFallbackByAssetId?: ReadonlyMap<AssetId, string | null>;
    } = {},
  ) {
    if (record.source !== "telegram") {
      return;
    }

    const baselineFallbackByAssetId =
      options.baselineFallbackByAssetId ?? new Map<AssetId, string | null>();
    const { sourceRoot, outputRoot } = resolvePackPaths(rootPath);
    const assetById = new Map(record.assets.map((asset) => [asset.id, asset]));
    const nextOutputs: StickerPackRecord["outputs"] = [];

    for (const output of record.outputs) {
      if (output.mode !== "sticker") {
        nextOutputs.push(output);
        continue;
      }

      const asset = assetById.get(output.sourceAssetId);
      const sourcePath = asset
        ? path.join(sourceRoot, asset.relativePath)
        : null;
      const sourceExists = sourcePath ? await pathExists(sourcePath) : false;
      const eligible =
        asset?.telegram &&
        asset.kind === "webm" &&
        asset.downloadState === "ready" &&
        sourceExists;

      if (eligible) {
        nextOutputs.push(output);
        continue;
      }

      if (asset?.telegram && asset.downloadState === "ready" && !sourceExists) {
        asset.downloadState = "missing";
      }

      await fs.rm(path.join(outputRoot, output.relativePath), {
        force: true,
      });
    }

    record.outputs = nextOutputs;

    for (const asset of record.assets) {
      if (!asset.telegram || asset.kind !== "webm") {
        continue;
      }

      const sourcePath = path.join(sourceRoot, asset.relativePath);
      if (asset.downloadState !== "ready" || !(await pathExists(sourcePath))) {
        if (asset.downloadState === "ready") {
          asset.downloadState = "missing";
        }
        continue;
      }

      const baselineHash =
        asset.telegram.baselineOutputHash ?? (await sha256ForFile(sourcePath));
      asset.telegram.baselineOutputHash = baselineHash;

      let output = this.getStickerOutputForAsset(record, asset.id);
      if (output) {
        const outputPath = path.join(outputRoot, output.relativePath);
        if (!(await pathExists(outputPath))) {
          record.outputs = record.outputs.filter(
            (item) =>
              !(
                item.mode === "sticker" &&
                item.sourceAssetId === asset.id &&
                item.relativePath === output!.relativePath
              ),
          );
          output = undefined;
        }
      }

      const priorBaselineHash =
        baselineFallbackByAssetId.get(asset.id) ?? asset.telegram.baselineOutputHash;
      const outputMatchesBaseline =
        output !== undefined &&
        (output.sha256 === baselineHash ||
          output.sha256 === priorBaselineHash);

      if (output && !outputMatchesBaseline) {
        continue;
      }

      const nextRelativePath = stickerOutputRelativePath(asset.id);
      const nextAbsolutePath = path.join(outputRoot, nextRelativePath);
      const previousOutputPath =
        output && output.relativePath !== nextRelativePath
          ? path.join(outputRoot, output.relativePath)
          : null;

      await fs.mkdir(path.dirname(nextAbsolutePath), { recursive: true });
      await fs.copyFile(sourcePath, nextAbsolutePath);
      const stat = await fs.stat(nextAbsolutePath);
      const sha256 = baselineHash ?? (await sha256ForFile(nextAbsolutePath));

      if (previousOutputPath) {
        await fs.rm(previousOutputPath, { force: true });
      }

      record.outputs = record.outputs.filter(
        (item) => !(item.mode === "sticker" && item.sourceAssetId === asset.id),
      );
      record.outputs.push({
        packId: record.id,
        sourceAssetId: asset.id,
        order: asset.order,
        mode: "sticker",
        relativePath: nextRelativePath,
        sizeBytes: stat.size,
        sha256,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  private async pruneDuplicateLocalTelegramAssets(
    record: StickerPackRecord,
    rootPath: string,
  ) {
    if (record.source !== "telegram") {
      return;
    }

    const { sourceRoot, outputRoot } = resolvePackPaths(rootPath);
    const remoteSignatures = new Set<string>();
    const duplicateAssetIds = new Set<AssetId>();

    const signatureFor = (sha256: string | null, emojis: string[]) =>
      sha256 ? `${sha256}\u0000${emojis.join(" ")}` : null;

    for (const asset of record.assets) {
      if (!asset.telegram || asset.id === record.iconAssetId) {
        continue;
      }

      const output = this.getStickerOutputForAsset(record, asset.id);
      const sourcePath = path.join(sourceRoot, asset.relativePath);
      const sourceSha256 =
        asset.telegram.baselineOutputHash ?? (await sha256ForFile(sourcePath));

      for (const signature of [
        signatureFor(sourceSha256, asset.emojiList),
        signatureFor(output?.sha256 ?? null, asset.emojiList),
      ]) {
        if (signature) {
          remoteSignatures.add(signature);
        }
      }
    }

    for (const asset of record.assets) {
      if (asset.telegram || asset.id === record.iconAssetId) {
        continue;
      }

      const output = this.getStickerOutputForAsset(record, asset.id);
      const signature = signatureFor(output?.sha256 ?? null, asset.emojiList);
      if (!signature || !remoteSignatures.has(signature)) {
        continue;
      }

      duplicateAssetIds.add(asset.id);
    }

    if (duplicateAssetIds.size === 0) {
      return;
    }

    const removedAssets = record.assets.filter((asset) => duplicateAssetIds.has(asset.id));
    const removedOutputs = record.outputs.filter((output) =>
      duplicateAssetIds.has(output.sourceAssetId),
    );

    record.assets = record.assets.filter((asset) => !duplicateAssetIds.has(asset.id));
    record.outputs = record.outputs.filter(
      (output) => !duplicateAssetIds.has(output.sourceAssetId),
    );

    for (const asset of removedAssets) {
      if (record.assets.some((candidate) => candidate.relativePath === asset.relativePath)) {
        continue;
      }

      await fs.rm(path.join(sourceRoot, asset.relativePath), { force: true });
    }

    for (const output of removedOutputs) {
      if (record.outputs.some((candidate) => candidate.relativePath === output.relativePath)) {
        continue;
      }

      await fs.rm(path.join(outputRoot, output.relativePath), { force: true });
    }

    compactStickerOrders(record);
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

  async getPackRecord(packId: string) {
    return this.readPackRecordById(packId);
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
  async mutatePackRecord(
    packId: string,
    mutate: (
      record: StickerPackRecord,
      rootPath: string,
      ) => Promise<void> | void,
  ) {
    return this.withPackMutationLock(packId, async () => {
      const { record, rootPath } = await this.readPackRecordById(packId);
      await mutate(record, rootPath);
      await this.writePackRecord(rootPath, record);
      return this.buildUpdatedPackDetails(record, rootPath);
    });
  }

  async createPack(input: { name: string }): Promise<StickerPack> {
    await this.ensureReady();
    const id = randomUUID();
    const slug = slugify(input.name);
    const directoryName = `${slug}-${id}`;
    const rootPath = this.settingsService.getPackRoot(directoryName);

    await this.ensurePackDirectories(rootPath);

    const now = new Date().toISOString();
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

    await this.writePackRecord(rootPath, record);
    return buildStickerPack(record, rootPath);
  }

  async upsertTelegramMirror(
    input: TelegramMirrorUpsertInput,
  ): Promise<StickerPackDetails> {
    await this.ensureReady();

    return this.withPackMutationLock(`telegram:${input.stickerSetId}`, async () => {
      const directoryName = `telegram-${input.stickerSetId}`;
      const rootPath = this.settingsService.getPackRoot(directoryName);
      const existing = (await pathExists(resolvePackPaths(rootPath).packFilePath))
        ? await this.readPackRecordFromRoot(rootPath)
        : null;
      const storedThumbnailPath = await syncTelegramThumbnailFile(
        rootPath,
        input.thumbnailPath,
        {
          hasThumbnail: input.hasThumbnail,
          preferredExtension: input.thumbnailExtension,
        },
      );
      const existingByStickerId = new Map(
        (existing?.assets ?? [])
          .filter((asset) => asset.telegram)
          .map((asset) => [asset.telegram!.stickerId, asset]),
      );
      const localOnlyAssets = (existing?.assets ?? []).filter(
        (asset) => asset.telegram === undefined,
      );
      const remoteAssets = await Promise.all(
        input.assets
          .slice()
          .sort((left, right) => left.telegram.position - right.telegram.position)
          .map(async (assetInput, index) => {
            const assetId =
              existingByStickerId.get(assetInput.telegram.stickerId)?.id ??
              assetInput.id ??
              randomUUID();
            const existingAsset = existingByStickerId.get(assetInput.telegram.stickerId);
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
              packId: existing?.id ?? directoryName,
              order: index,
              relativePath,
              originalFileName:
                existingAsset?.originalFileName ?? path.basename(assetInput.relativePath),
              emojiList: assetInput.emojiList,
              kind: assetInput.kind ?? "webm",
              importedAt: existingAsset?.importedAt ?? new Date().toISOString(),
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
            };
          }),
      );
      const normalizedLocalOnlyAssets = localOnlyAssets
        .slice()
        .sort(compareAssetsByOrder)
        .map((asset, index) => ({
          ...asset,
          order: remoteAssets.length + index,
        }));

      const record: StickerPackRecord = {
        schemaVersion: 3,
        id: existing?.id ?? directoryName,
        source: "telegram",
        name: input.title,
        slug: slugify(input.shortName || input.title),
        iconAssetId:
          existing?.iconAssetId &&
          [...remoteAssets, ...localOnlyAssets].some(
            (asset) => asset.id === existing.iconAssetId,
          )
            ? existing.iconAssetId
            : null,
        telegramShortName: null,
        telegram: createDefaultTelegramSummary({
          stickerSetId: input.stickerSetId,
          shortName: input.shortName,
          title: input.title,
          format: input.format,
          thumbnailPath: storedThumbnailPath,
          syncState: input.syncState,
          lastSyncedAt: input.lastSyncedAt,
          lastSyncError: input.lastSyncError,
          publishedFromLocalPackId:
            input.publishedFromLocalPackId ??
            existing?.telegram?.publishedFromLocalPackId ??
            null,
        }),
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        updatedAt: existing?.updatedAt ?? new Date().toISOString(),
        assets: [...remoteAssets, ...normalizedLocalOnlyAssets],
        outputs:
          existing?.outputs.filter((output) =>
            [...remoteAssets, ...normalizedLocalOnlyAssets].some(
              (asset) => asset.id === output.sourceAssetId,
            ),
          ) ?? [],
      };

      compactStickerOrders(record);
      await this.reconcileTelegramMirrorOutputs(record, rootPath);
      await this.pruneDuplicateLocalTelegramAssets(record, rootPath);
      await this.writePackRecord(rootPath, record);
      return this.buildUpdatedPackDetails(record, rootPath);
    });
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
          record.telegram.syncState = "stale";
        }
      },
    );
    return details.pack;
  }

  async deletePack(input: { packId: string }) {
    const { rootPath } = await this.readPackRecordById(input.packId);
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
          record.telegram.syncState = "stale";
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
    const { record, rootPath } = await this.readPackRecordById(packId);
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
    const { record, rootPath } = await this.readPackRecordById(packId);
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
      if (record.telegram) {
        record.telegram.syncState = "stale";
        await this.reconcileTelegramMirrorOutputs(record, rootPath);
      }
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

      if (record.telegram) {
        record.telegram.syncState = "stale";
        await this.reconcileTelegramMirrorOutputs(record, rootPath);
      }
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

      if (record.telegram) {
        record.telegram.syncState = "stale";
        await this.reconcileTelegramMirrorOutputs(record, rootPath);
      }
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
      compactStickerOrders(record);

      if (record.telegram) {
        record.telegram.syncState = "stale";
        await this.reconcileTelegramMirrorOutputs(record, rootPath);
      }
    });
  }

  async deleteManyAssets(input: { packId: string; assetIds: string[] }) {
    return this.mutatePackRecord(input.packId, async (record, rootPath) => {
      for (const assetId of [...new Set(input.assetIds)]) {
        await this.deleteAssetRecord(record, rootPath, assetId);
      }
      compactStickerOrders(record);

      if (record.telegram) {
        record.telegram.syncState = "stale";
        await this.reconcileTelegramMirrorOutputs(record, rootPath);
      }
    });
  }

  async listOutputs(packId: string): Promise<OutputArtifact[]> {
    const { record, rootPath } = await this.readPackRecordById(packId);
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
    const { record, rootPath } = await this.readPackRecordById(packId);
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
      updatedAt: new Date().toISOString(),
    });
    if (record.telegram) {
      record.telegram.syncState = "stale";
    }
    await this.writePackRecord(rootPath, record);
  }

  async writeTelegramAssetFile(input: {
    packId: string;
    assetId: string;
    sourceFilePath: string;
    relativePath?: string;
    baselineOutputHash?: string | null;
  }) {
    return this.mutatePackRecord(input.packId, async (record, rootPath) => {
      const asset = record.assets.find((item) => item.id === input.assetId);
      if (!asset) {
        throw new Error(`Asset not found: ${input.assetId}`);
      }
      const baselineFallbackByAssetId = new Map<AssetId, string | null>();
      if (asset.telegram) {
        baselineFallbackByAssetId.set(
          asset.id,
          asset.telegram.baselineOutputHash ?? null,
        );
      }

      const nextRelativePath = sourceAssetRelativePath(asset.id, asset.kind);
      const destination = path.join(
        resolvePackPaths(rootPath).sourceRoot,
        nextRelativePath,
      );

      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.copyFile(input.sourceFilePath, destination);

      asset.relativePath = nextRelativePath;
      asset.downloadState = "ready";
      if (asset.telegram && input.baselineOutputHash !== undefined) {
        asset.telegram.baselineOutputHash = input.baselineOutputHash;
      } else if (asset.telegram) {
        asset.telegram.baselineOutputHash = await sha256ForFile(destination);
      }
      await this.reconcileTelegramMirrorOutputs(record, rootPath, {
        baselineFallbackByAssetId,
      });
      await this.pruneDuplicateLocalTelegramAssets(record, rootPath);
    });
  }

  async setTelegramAssetDownloadState(input: {
    packId: string;
    assetId: string;
    downloadState: DownloadState;
  }) {
    return this.mutatePackRecord(input.packId, (record) => {
      const asset = record.assets.find((item) => item.id === input.assetId);
      if (!asset) {
        throw new Error(`Asset not found: ${input.assetId}`);
      }
      asset.downloadState = input.downloadState;
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
    return this.mutatePackRecord(input.packId, (record) => {
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
    });
  }

  async getConversionContext(packId: string) {
    return this.getPack(packId);
  }
}
