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

async function sha256ForFile(filePath: string): Promise<string | null> {
  try {
    const data = await fs.readFile(filePath);
    return createHash("sha256").update(data).digest("hex");
  } catch {
    return null;
  }
}

function createDefaultTelegramSummary(
  overrides: Partial<TelegramPackSummary> & Pick<TelegramPackSummary, "stickerSetId">,
): TelegramPackSummary {
  return {
    stickerSetId: overrides.stickerSetId,
    shortName: overrides.shortName ?? "",
    title: overrides.title ?? "",
    format: "video",
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
      ? iconAsset && iconAsset.downloadState === "ready"
        ? path.join(rootPath, "source", iconAsset.relativePath)
        : null
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
    const raw = await fs.readFile(path.join(rootPath, "pack.json"), "utf8");
    return normalizePackRecord(
      JSON.parse(raw) as Partial<StickerPackRecord> & {
        source?: PackSource;
      },
    );
  }

  private async writePackRecord(rootPath: string, record: StickerPackRecord) {
    record.schemaVersion = 2;
    record.updatedAt = new Date().toISOString();
    await this.ensurePackDirectories(rootPath);
    await fs.writeFile(
      path.join(rootPath, "pack.json"),
      JSON.stringify(record, null, 2),
    );
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
      const record = await this.readPackRecordFromRoot(rootPath);
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

  async listPacks(): Promise<StickerPack[]> {
    await this.ensureReady();
    const packsRoot = this.getPacksRoot();
    const entries = await fs.readdir(packsRoot, { withFileTypes: true });
    const packs = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const rootPath = path.join(packsRoot, entry.name);
          const record = await this.readPackRecordFromRoot(rootPath);
          return buildStickerPack(record, rootPath);
        }),
    );

    return packs.sort((left, right) => left.name.localeCompare(right.name));
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
      const record = await this.readPackRecordFromRoot(rootPath);
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
    const { record, rootPath } = await this.readPackRecordById(packId);
    await mutate(record, rootPath);
    await this.writePackRecord(rootPath, record);
    return hydratePackDetails(record, rootPath);
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

    const directoryName = `telegram-${input.stickerSetId}`;
    const rootPath = this.settingsService.getPackRoot(directoryName);
    const existing = (await pathExists(path.join(rootPath, "pack.json")))
      ? await this.readPackRecordFromRoot(rootPath)
      : null;
    const existingByStickerId = new Map(
      (existing?.assets ?? [])
        .filter((asset) => asset.telegram)
        .map((asset) => [asset.telegram!.stickerId, asset]),
    );
    const localOnlyAssets = (existing?.assets ?? []).filter(
      (asset) => asset.telegram === undefined,
    );
    const remoteAssets = input.assets
      .slice()
      .sort((left, right) => left.telegram.position - right.telegram.position)
      .map((assetInput, index) => {
        const existingAsset = existingByStickerId.get(assetInput.telegram.stickerId);
        return {
          id: existingAsset?.id ?? assetInput.id ?? randomUUID(),
          packId: existing?.id ?? directoryName,
          relativePath:
            existingAsset?.relativePath ??
            normalizeRelativePath(assetInput.relativePath),
          emojiList: assetInput.emojiList,
          kind: assetInput.kind ?? "webm",
          importedAt: existingAsset?.importedAt ?? new Date().toISOString(),
          originalImportPath: existingAsset?.originalImportPath ?? null,
          downloadState: assetInput.downloadState,
          telegram: {
            ...assetInput.telegram,
            baselineOutputHash:
              existingAsset?.telegram?.baselineOutputHash ??
              assetInput.telegram.baselineOutputHash ??
              null,
            position: index,
          },
        };
      });

    const record: StickerPackRecord = {
      schemaVersion: 2,
      id: existing?.id ?? directoryName,
      source: "telegram",
      name: input.title,
      slug: slugify(input.shortName || input.title),
      iconAssetId:
        remoteAssets.find(
          (asset) => asset.telegram?.stickerId === input.iconStickerId,
        )?.id ??
        existing?.iconAssetId ??
        remoteAssets[0]?.id ??
        null,
      telegram: createDefaultTelegramSummary({
        stickerSetId: input.stickerSetId,
        shortName: input.shortName,
        title: input.title,
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

    await this.writePackRecord(rootPath, record);
    return hydratePackDetails(record, rootPath);
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
      await this.removeAssetOutputs(record, rootPath, asset.id);
      if (record.telegram) {
        record.telegram.syncState = "stale";
      }
    });
  }

  async setAssetEmojis(input: {
    packId: string;
    assetId: string;
    emojis: string[];
  }) {
    return this.mutatePackRecord(input.packId, (record) => {
      const asset = record.assets.find((item) => item.id === input.assetId);

      if (!asset) {
        throw new Error(`Asset not found: ${input.assetId}`);
      }

      asset.emojiList = [...input.emojis];
      if (record.telegram) {
        record.telegram.syncState = "stale";
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
      await this.removeAssetOutputs(record, rootPath, asset.id);
      if (record.telegram) {
        record.telegram.syncState = "stale";
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
