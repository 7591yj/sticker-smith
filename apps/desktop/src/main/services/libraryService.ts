import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type {
  AssetId,
  ImportResult,
  OutputArtifact,
  PackSource,
  SourceAsset,
  SourceMediaKind,
  StickerPack,
  StickerPackDetails,
  StickerPackRecord,
} from "@sticker-smith/shared";
import { supportedMediaKinds } from "@sticker-smith/shared";

import type { SettingsService } from "./settingsService";

const supportedMediaKindsSet = new Set<SourceMediaKind>(supportedMediaKinds);

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

function buildStickerPack(
  record: StickerPackRecord,
  rootPath: string,
): StickerPack {
  const outputRoot = path.join(rootPath, "webm");
  const thumbnailPath = record.outputs.some(
    (output) => output.relativePath === "icon.webm",
  )
    ? path.join(outputRoot, "icon.webm")
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
      emojiList: asset.emojiList ?? [],
      absolutePath: path.join(rootPath, "source", asset.relativePath),
    })),
    outputs: record.outputs.map((output) => ({
      ...output,
      absolutePath: path.join(rootPath, "webm", output.relativePath),
    })),
  };
}

function normalizePackRecord(
  record: Omit<StickerPackRecord, "source"> & { source?: PackSource },
): StickerPackRecord {
  return {
    ...record,
    assets: record.assets.map((asset) => ({
      ...asset,
      emojiList: asset.emojiList ?? [],
    })),
    source: record.source ?? "local",
  };
}

export class LibraryService {
  constructor(private readonly settingsService: SettingsService) {}

  private async ensureReady() {
    await this.settingsService.ensureLibrary();
  }

  private async readPackRecordById(packId: string) {
    await this.ensureReady();
    const packsRoot = path.join(this.settingsService.getLibraryRoot(), "packs");
    const entries = await fs.readdir(packsRoot, { withFileTypes: true });
    const directories = entries.filter((entry) => entry.isDirectory());
    const directMatch = directories.find(
      (entry) => entry.name === packId || entry.name.endsWith(`-${packId}`),
    );

    if (directMatch) {
      const rootPath = path.join(packsRoot, directMatch.name);
      const record = await this.readPackRecordFromRoot(rootPath);
      if (record.id === packId) {
        return { record, rootPath };
      }
    }

    for (const entry of directories) {
      if (entry === directMatch) {
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

  private async readPackRecordFromRoot(
    rootPath: string,
  ): Promise<StickerPackRecord> {
    const raw = await fs.readFile(path.join(rootPath, "pack.json"), "utf8");
    return normalizePackRecord(
      JSON.parse(raw) as Omit<StickerPackRecord, "source"> & {
        source?: PackSource;
      },
    );
  }

  private async writePackRecord(rootPath: string, record: StickerPackRecord) {
    record.updatedAt = new Date().toISOString();
    await fs.writeFile(
      path.join(rootPath, "pack.json"),
      JSON.stringify(record, null, 2),
    );
  }

  private resolveUniqueRelativePath(
    record: StickerPackRecord,
    relativePath: string,
  ) {
    const normalized = normalizeRelativePath(relativePath);
    const parsed = path.posix.parse(normalized);
    let candidate = normalized;
    let index = 1;

    while (record.assets.some((asset) => asset.relativePath === candidate)) {
      candidate = path.posix.join(
        parsed.dir,
        `${parsed.name}-${index}${parsed.ext}`,
      );
      index += 1;
    }

    return candidate;
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
    };

    record.assets.push({
      id: asset.id,
      packId: asset.packId,
      relativePath: asset.relativePath,
      emojiList: asset.emojiList,
      kind: asset.kind,
      importedAt: asset.importedAt,
      originalImportPath: asset.originalImportPath,
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
    const packsRoot = path.join(this.settingsService.getLibraryRoot(), "packs");
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

  async createPack(input: { name: string }): Promise<StickerPack> {
    await this.ensureReady();
    const id = randomUUID();
    const slug = slugify(input.name);
    const directoryName = `${slug}-${id}`;
    const rootPath = this.settingsService.getPackRoot(directoryName);

    await fs.mkdir(path.join(rootPath, "source"), { recursive: true });
    await fs.mkdir(path.join(rootPath, "webm"), { recursive: true });

    const now = new Date().toISOString();
    const record: StickerPackRecord = {
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

  async renamePack(input: {
    packId: string;
    name: string;
  }): Promise<StickerPack> {
    const { record, rootPath } = await this.readPackRecordById(input.packId);
    record.name = input.name;
    record.slug = slugify(input.name);
    await this.writePackRecord(rootPath, record);
    return buildStickerPack(record, rootPath);
  }

  async deletePack(input: { packId: string }) {
    const { rootPath } = await this.readPackRecordById(input.packId);
    await fs.rm(rootPath, { recursive: true, force: true });
  }

  async setPackIcon(input: {
    packId: string;
    assetId: string | null;
  }): Promise<StickerPack> {
    const { record, rootPath } = await this.readPackRecordById(input.packId);

    if (
      input.assetId !== null &&
      !record.assets.some((asset) => asset.id === input.assetId)
    ) {
      throw new Error(`Asset not found in pack: ${input.assetId}`);
    }

    record.iconAssetId = input.assetId;
    record.outputs = record.outputs.filter((output) => output.mode !== "icon");
    await fs.rm(path.join(rootPath, "webm", "icon.webm"), { force: true });

    await this.writePackRecord(rootPath, record);
    return buildStickerPack(record, rootPath);
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

    await this.writePackRecord(rootPath, record);
    return { imported, skipped };
  }

  async renameAsset(input: {
    packId: string;
    assetId: string;
    nextRelativePath: string;
  }) {
    const { record, rootPath } = await this.readPackRecordById(input.packId);
    const asset = record.assets.find((item) => item.id === input.assetId);

    if (!asset) {
      throw new Error(`Asset not found: ${input.assetId}`);
    }

    const nextRelativePath = this.resolveUniqueRelativePath(
      record,
      input.nextRelativePath,
    );
    const currentAbsolutePath = path.join(
      rootPath,
      "source",
      asset.relativePath,
    );
    const nextAbsolutePath = path.join(rootPath, "source", nextRelativePath);

    await fs.mkdir(path.dirname(nextAbsolutePath), { recursive: true });
    await fs.rename(currentAbsolutePath, nextAbsolutePath);
    asset.relativePath = nextRelativePath;
    await this.removeAssetOutputs(record, rootPath, asset.id);
    await this.writePackRecord(rootPath, record);

    return hydratePackDetails(record, rootPath);
  }

  async setAssetEmojis(input: {
    packId: string;
    assetId: string;
    emojis: string[];
  }) {
    const { record, rootPath } = await this.readPackRecordById(input.packId);
    const asset = record.assets.find((item) => item.id === input.assetId);

    if (!asset) {
      throw new Error(`Asset not found: ${input.assetId}`);
    }

    asset.emojiList = [...input.emojis];
    await this.writePackRecord(rootPath, record);

    return hydratePackDetails(record, rootPath);
  }

  async moveAsset(input: {
    packId: string;
    assetId: string;
    nextDirectory: string;
  }) {
    const { record, rootPath } = await this.readPackRecordById(input.packId);
    const asset = record.assets.find((item) => item.id === input.assetId);

    if (!asset) {
      throw new Error(`Asset not found: ${input.assetId}`);
    }

    const baseName = path.posix.basename(asset.relativePath);
    const nextRelativePath = this.resolveUniqueRelativePath(
      record,
      normalizeRelativePath(path.posix.join(input.nextDirectory, baseName)),
    );

    const currentAbsolutePath = path.join(
      rootPath,
      "source",
      asset.relativePath,
    );
    const nextAbsolutePath = path.join(rootPath, "source", nextRelativePath);

    await fs.mkdir(path.dirname(nextAbsolutePath), { recursive: true });
    await fs.rename(currentAbsolutePath, nextAbsolutePath);
    asset.relativePath = nextRelativePath;
    await this.removeAssetOutputs(record, rootPath, asset.id);
    await this.writePackRecord(rootPath, record);

    return hydratePackDetails(record, rootPath);
  }

  async deleteAsset(input: { packId: string; assetId: string }) {
    const { record, rootPath } = await this.readPackRecordById(input.packId);
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

    await this.writePackRecord(rootPath, record);
    return hydratePackDetails(record, rootPath);
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
      updatedAt: new Date().toISOString(),
    });
    await this.writePackRecord(rootPath, record);
  }

  async getConversionContext(packId: string) {
    const details = await this.getPack(packId);
    return details;
  }
}
