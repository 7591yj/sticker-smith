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
  syncState: TelegramPackSummary["syncState"];
  lastSyncError?: string | null;
  publishedFromLocalPackId: string | null;
  lastSyncedAt: string | null;
  assets: TelegramMirrorAssetInput[];
  iconStickerId?: string | null;
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

function extToKind(filePath: string): SourceMediaKind | null {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  return supportedMediaKindsSet.has(extension as SourceMediaKind)
    ? (extension as SourceMediaKind)
    : null;
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
) {
  const sourceRoot = path.join(rootPath, "source");
  await fs.mkdir(sourceRoot, { recursive: true });
  const entries = await fs.readdir(sourceRoot, { withFileTypes: true });
  await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.isFile() && entry.name.startsWith("telegram-pack-icon."),
      )
      .map((entry) => fs.rm(path.join(sourceRoot, entry.name), { force: true })),
  );

  if (!thumbnailPath) {
    return null;
  }

  const extension = path.extname(thumbnailPath) || ".bin";
  const destination = path.join(sourceRoot, `telegram-pack-icon${extension}`);
  await fs.copyFile(thumbnailPath, destination);
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

  const currentAbsolutePath = path.join(rootPath, "source", currentRelativePath);
  const nextAbsolutePath = path.join(rootPath, "source", nextRelativePath);
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

  return path.join(rootPath, "source", asset.relativePath);
}

function buildStickerPack(
  record: StickerPackRecord,
  rootPath: string,
): StickerPack {
  const outputRoot = path.join(rootPath, "webm");
  const iconOutput = record.outputs.find((output) => output.mode === "icon");
  const iconAsset =
    record.iconAssetId === null
      ? null
      : record.assets.find((asset) => asset.id === record.iconAssetId) ?? null;
  const thumbnailPath =
    record.source === "telegram"
      ? record.telegram?.thumbnailPath ??
        (iconAsset && iconAsset.downloadState === "ready"
          ? path.join(rootPath, "source", iconAsset.relativePath)
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
    sourceRoot: path.join(rootPath, "source"),
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
  return {
    pack: buildStickerPack(record, rootPath),
    assets: record.assets.map((asset) => ({
      ...asset,
      absolutePath: resolveAssetAbsolutePath(record, rootPath, asset),
    })),
    outputs: record.outputs.map((output) => ({
      ...output,
      absolutePath: path.join(rootPath, "webm", output.relativePath),
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

  return {
    schemaVersion: 2,
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
      relativePath: asset.relativePath ?? `sticker-${index + 1}.webm`,
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
      mode: output.mode ?? "sticker",
      relativePath: output.relativePath ?? "",
      sizeBytes: output.sizeBytes ?? 0,
      sha256: output.sha256 ?? null,
      updatedAt: output.updatedAt ?? now,
    })),
  };
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
    await fs.mkdir(path.join(rootPath, "source"), { recursive: true });
    await fs.mkdir(path.join(rootPath, "webm"), { recursive: true });
  }

  private async readPackRecordFromRoot(
    rootPath: string,
  ): Promise<StickerPackRecord> {
    const packFilePath = path.join(rootPath, "pack.json");
    const backupFilePath = `${packFilePath}.bak`;
    try {
      const raw = await fs.readFile(packFilePath, "utf8");
      return normalizePackRecord(
        JSON.parse(raw) as Partial<StickerPackRecord> & {
          source?: PackSource;
        },
      );
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
    record.schemaVersion = 2;
    record.updatedAt = new Date().toISOString();
    await this.ensurePackDirectories(rootPath);
    const packFilePath = path.join(rootPath, "pack.json");
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
    relativePath: string,
  ): Promise<SourceAsset | null> {
    const kind = extToKind(absolutePath);
    if (!kind) {
      return null;
    }

    const nextRelativePath = this.resolveUniqueRelativePath(
      record,
      relativePath,
    );
    const destination = path.join(rootPath, "source", nextRelativePath);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(absolutePath, destination);

    const asset: SourceAsset = {
      id: randomUUID(),
      packId: record.id,
      relativePath: nextRelativePath,
      absolutePath: destination,
      emojiList: [],
      kind,
      importedAt: new Date().toISOString(),
      originalImportPath: absolutePath,
      downloadState: "ready",
    };

    record.assets.push({
      id: asset.id,
      packId: asset.packId,
      relativePath: asset.relativePath,
      emojiList: asset.emojiList,
      kind: asset.kind,
      importedAt: asset.importedAt,
      originalImportPath: asset.originalImportPath,
      downloadState: asset.downloadState,
    });

    return asset;
  }

  private async removeAssetOutputs(
    record: StickerPackRecord,
    rootPath: string,
    assetId: AssetId,
  ) {
    const matching = record.outputs.filter(
      (output) => output.sourceAssetId === assetId,
    );
    record.outputs = record.outputs.filter(
      (output) => output.sourceAssetId !== assetId,
    );

    await Promise.all(
      matching.map(async (output) => {
        const target = path.join(rootPath, "webm", output.relativePath);
        await fs.rm(target, { force: true });
      }),
    );
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
    const assetById = new Map(record.assets.map((asset) => [asset.id, asset]));
    const nextOutputs: StickerPackRecord["outputs"] = [];

    for (const output of record.outputs) {
      if (output.mode !== "sticker") {
        nextOutputs.push(output);
        continue;
      }

      const asset = assetById.get(output.sourceAssetId);
      const sourcePath = asset
        ? path.join(rootPath, "source", asset.relativePath)
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

      await fs.rm(path.join(rootPath, "webm", output.relativePath), {
        force: true,
      });
    }

    record.outputs = nextOutputs;

    for (const asset of record.assets) {
      if (!asset.telegram || asset.kind !== "webm") {
        continue;
      }

      const sourcePath = path.join(rootPath, "source", asset.relativePath);
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
        const outputPath = path.join(rootPath, "webm", output.relativePath);
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

      const nextRelativePath = asset.relativePath;
      const nextAbsolutePath = path.join(rootPath, "webm", nextRelativePath);
      const previousOutputPath =
        output && output.relativePath !== nextRelativePath
          ? path.join(rootPath, "webm", output.relativePath)
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
        mode: "sticker",
        relativePath: nextRelativePath,
        sizeBytes: stat.size,
        sha256,
        updatedAt: new Date().toISOString(),
      });
    }
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
      return hydratePackDetails(record, rootPath);
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
      schemaVersion: 2,
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
      const existing = (await pathExists(path.join(rootPath, "pack.json")))
        ? await this.readPackRecordFromRoot(rootPath)
        : null;
      const storedThumbnailPath = await syncTelegramThumbnailFile(
        rootPath,
        input.thumbnailPath,
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
            const existingAsset = existingByStickerId.get(assetInput.telegram.stickerId);
            const relativePath = normalizeRelativePath(assetInput.relativePath);
            await migrateTelegramAssetFile(
              rootPath,
              existingAsset?.relativePath ?? null,
              relativePath,
            );
            const localFileExists = await pathExists(
              path.join(rootPath, "source", relativePath),
            );

            return {
              id: existingAsset?.id ?? assetInput.id ?? randomUUID(),
              packId: existing?.id ?? directoryName,
              relativePath,
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

      const record: StickerPackRecord = {
        schemaVersion: 2,
        id: existing?.id ?? directoryName,
        source: "telegram",
        name: input.title,
        slug: slugify(input.shortName || input.title),
        iconAssetId:
          remoteAssets.find(
            (asset) => asset.telegram?.stickerId === input.iconStickerId,
          )?.id ?? null,
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
        assets: [...remoteAssets, ...localOnlyAssets],
        outputs:
          existing?.outputs.filter((output) =>
            [...remoteAssets, ...localOnlyAssets].some(
              (asset) => asset.id === output.sourceAssetId,
            ),
          ) ?? [],
      };

      await this.reconcileTelegramMirrorOutputs(record, rootPath);
      await this.writePackRecord(rootPath, record);
      return hydratePackDetails(record, rootPath);
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

        record.iconAssetId = input.assetId;
        record.outputs = record.outputs.filter((output) => output.mode !== "icon");
        await fs.rm(path.join(rootPath, "webm", "icon.webm"), { force: true });
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
    const imported: SourceAsset[] = [];
    const skipped: string[] = [];

    for (const filePath of [...filePaths].sort()) {
      const asset = await this.importAbsoluteFile(
        record,
        rootPath,
        filePath,
        path.basename(filePath),
      );
      if (asset) {
        imported.push(asset);
      } else {
        skipped.push(filePath);
      }
    }

    if (record.telegram && imported.length > 0) {
      record.telegram.syncState = "stale";
    }

    await this.writePackRecord(rootPath, record);
    return { imported, skipped };
  }

  async importDirectory(
    packId: string,
    directoryPath: string,
  ): Promise<ImportResult> {
    const { record, rootPath } = await this.readPackRecordById(packId);
    const imported: SourceAsset[] = [];
    const skipped: string[] = [];
    const files = (await collectFiles(directoryPath)).sort();

    for (const filePath of files) {
      const relativePath = normalizeRelativePath(
        path.relative(directoryPath, filePath),
      );
      const asset = await this.importAbsoluteFile(
        record,
        rootPath,
        filePath,
        relativePath,
      );
      if (asset) {
        imported.push(asset);
      } else {
        skipped.push(filePath);
      }
    }

    if (record.telegram && imported.length > 0) {
      record.telegram.syncState = "stale";
    }

    await this.writePackRecord(rootPath, record);
    return { imported, skipped };
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

      const nextRelativePath = this.resolveUniqueRelativePath(
        record,
        input.nextRelativePath,
        asset.id,
      );
      const currentAbsolutePath = path.join(rootPath, "source", asset.relativePath);
      const nextAbsolutePath = path.join(rootPath, "source", nextRelativePath);

      await fs.mkdir(path.dirname(nextAbsolutePath), { recursive: true });
      if (await pathExists(currentAbsolutePath)) {
        await fs.rename(currentAbsolutePath, nextAbsolutePath);
      }

      asset.relativePath = nextRelativePath;
      if (record.telegram) {
        record.telegram.syncState = "stale";
        await this.reconcileTelegramMirrorOutputs(record, rootPath);
      } else {
        await this.removeAssetOutputs(record, rootPath, asset.id);
      }
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

      if (record.telegram) {
        record.telegram.syncState = "stale";
        await this.reconcileTelegramMirrorOutputs(record, rootPath);
      } else {
        await Promise.all(
          stagedMoves.map((stagedMove) =>
            this.removeAssetOutputs(record, rootPath, stagedMove.asset.id),
          ),
        );
      }
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
      const nextRelativePath = this.resolveUniqueRelativePath(
        record,
        normalizeRelativePath(path.posix.join(input.nextDirectory, baseName)),
        asset.id,
      );

      const currentAbsolutePath = path.join(rootPath, "source", asset.relativePath);
      const nextAbsolutePath = path.join(rootPath, "source", nextRelativePath);

      await fs.mkdir(path.dirname(nextAbsolutePath), { recursive: true });
      if (await pathExists(currentAbsolutePath)) {
        await fs.rename(currentAbsolutePath, nextAbsolutePath);
      }

      asset.relativePath = nextRelativePath;
      if (record.telegram) {
        record.telegram.syncState = "stale";
        await this.reconcileTelegramMirrorOutputs(record, rootPath);
      } else {
        await this.removeAssetOutputs(record, rootPath, asset.id);
      }
    });
  }

  async deleteAsset(input: { packId: string; assetId: string }) {
    return this.mutatePackRecord(input.packId, async (record, rootPath) => {
      const assetIndex = record.assets.findIndex(
        (item) => item.id === input.assetId,
      );

      if (assetIndex === -1) {
        throw new Error(`Asset not found: ${input.assetId}`);
      }

      const [asset] = record.assets.splice(assetIndex, 1);
      await fs.rm(path.join(rootPath, "source", asset.relativePath), {
        force: true,
      });
      await this.removeAssetOutputs(record, rootPath, asset.id);

      if (record.iconAssetId === asset.id) {
        record.iconAssetId = null;
        await fs.rm(path.join(rootPath, "webm", "icon.webm"), { force: true });
      }

      if (record.telegram) {
        record.telegram.syncState = "stale";
        await this.reconcileTelegramMirrorOutputs(record, rootPath);
      }
    });
  }

  async deleteManyAssets(input: { packId: string; assetIds: string[] }) {
    return this.mutatePackRecord(input.packId, async (record, rootPath) => {
      for (const assetId of [...new Set(input.assetIds)]) {
        const assetIndex = record.assets.findIndex((item) => item.id === assetId);

        if (assetIndex === -1) {
          throw new Error(`Asset not found: ${assetId}`);
        }

        const [asset] = record.assets.splice(assetIndex, 1);
        await fs.rm(path.join(rootPath, "source", asset.relativePath), {
          force: true,
        });
        await this.removeAssetOutputs(record, rootPath, asset.id);

        if (record.iconAssetId === asset.id) {
          record.iconAssetId = null;
          await fs.rm(path.join(rootPath, "webm", "icon.webm"), { force: true });
        }
      }

      if (record.telegram) {
        record.telegram.syncState = "stale";
        await this.reconcileTelegramMirrorOutputs(record, rootPath);
      }
    });
  }

  async listOutputs(packId: string): Promise<OutputArtifact[]> {
    const { record, rootPath } = await this.readPackRecordById(packId);
    return hydratePackDetails(record, rootPath).outputs;
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
    const absolutePath = path.join(rootPath, "webm", result.outputFileName);
    const sha256 = await sha256ForFile(absolutePath);
    record.outputs = record.outputs.filter(
      (output) =>
        !(
          output.sourceAssetId === result.assetId && output.mode === result.mode
        ),
    );
    record.outputs.push({
      packId: record.id,
      sourceAssetId: result.assetId,
      mode: result.mode,
      relativePath: result.outputFileName,
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

      const nextRelativePath = input.relativePath
        ? this.resolveUniqueRelativePath(record, input.relativePath, asset.id)
        : asset.relativePath;
      const destination = path.join(rootPath, "source", nextRelativePath);

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
