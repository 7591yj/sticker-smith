import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type {
  ImportResult,
  StickerPack,
  StickerPackDetails,
  StickerPackRecord,
} from "@sticker-smith/shared";

import type { SettingsService } from "./settingsService";
import { compactStickerOrders } from "./packNormalizer";
import {
  applyConversionResult,
  collectFiles,
  findStickerOrThrow,
  importStickerFiles,
  markTelegramMirrorStale,
  removeStickers,
  renameStickerFile,
  reorderStickers,
  setPackIconSticker,
  slugify,
} from "./libraryServiceHelpers";
import { hydratePackDetails, PackRepository } from "./packRepository";
import { TelegramMirrorStore } from "./telegramMirrorStore";
import { nowIso } from "../utils/timeUtils";

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
      markTelegramMirrorStale(record);
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
      setPackIconSticker(record, rootPath, input.stickerId);
    });
    return details.pack;
  }

  async importFiles(packId: string, filePaths: string[]): Promise<ImportResult> {
    let result: ImportResult = { imported: [], skipped: [] };
    await this.mutatePackRecord(packId, async (record, rootPath) => {
      result = await importStickerFiles(record, rootPath, filePaths);
      markTelegramMirrorStale(record);
    });
    return result;
  }

  async importDirectory(packId: string, directoryPath: string): Promise<ImportResult> {
    return this.importFiles(packId, await collectFiles(directoryPath));
  }

  async setStickerEmojis(input: { packId: string; stickerId: string; emojis: string[] }) {
    return this.mutatePackRecord(input.packId, (record) => {
      findStickerOrThrow(record, input.stickerId).emojiList = [...input.emojis];
      markTelegramMirrorStale(record);
    });
  }

  async setManyStickerEmojis(input: { packId: string; stickerIds: string[]; emojis: string[] }) {
    return this.mutatePackRecord(input.packId, (record) => {
      for (const stickerId of [...new Set(input.stickerIds)]) {
        findStickerOrThrow(record, stickerId).emojiList = [...input.emojis];
      }
      markTelegramMirrorStale(record);
    });
  }

  async reorderSticker(input: { packId: string; stickerId: string; beforeStickerId: string | null }) {
    return this.mutatePackRecord(input.packId, (record) => {
      reorderStickers(record, input.stickerId, input.beforeStickerId);
      markTelegramMirrorStale(record);
    });
  }

  async deleteSticker(input: { packId: string; stickerId: string }) {
    return this.deleteManyStickers({ packId: input.packId, stickerIds: [input.stickerId] });
  }

  async deleteManyStickers(input: { packId: string; stickerIds: string[] }) {
    return this.mutatePackRecord(input.packId, async (record, rootPath) => {
      const removed = removeStickers(record, input.stickerIds);
      await this.repo.deleteStickerFilesIfUnreferenced(record, rootPath, removed.map((sticker) => sticker.relativePath));
      markTelegramMirrorStale(record);
    });
  }

  async renameSticker(input: { packId: string; stickerId: string; nextRelativePath: string }) {
    return this.mutatePackRecord(input.packId, async (record, rootPath) => {
      await renameStickerFile(record, rootPath, input.stickerId, input.nextRelativePath);
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
    await applyConversionResult(record, rootPath, result);
    await this.repo.writePackRecord(rootPath, record);
  }

  async getConversionContext(packId: string) { return this.getPack(packId); }

  async upsertTelegramMirror(input: Parameters<TelegramMirrorStore["upsertTelegramMirror"]>[0]) { return this.telegramMirrorStore.upsertTelegramMirror(input); }
  async writeTelegramStickerFile(input: { packId: string; stickerId: string; sourceFilePath: string; relativePath?: string; baselineStickerHash?: string | null }) { return this.telegramMirrorStore.writeTelegramStickerFile(input); }
  async setTelegramStickerDownloadState(input: Parameters<TelegramMirrorStore["setTelegramStickerDownloadState"]>[0]) { return this.telegramMirrorStore.setTelegramStickerDownloadState(input); }
  async updateTelegramMirrorMetadata(input: Parameters<TelegramMirrorStore["updateTelegramMirrorMetadata"]>[0]) { return this.telegramMirrorStore.updateTelegramMirrorMetadata(input); }
  async syncTelegramThumbnail(input: Parameters<TelegramMirrorStore["syncTelegramThumbnail"]>[0]) { return this.telegramMirrorStore.syncTelegramThumbnail(input); }
}
