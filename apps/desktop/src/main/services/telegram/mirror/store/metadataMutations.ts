import type { DownloadState, TelegramPackSummary } from "@sticker-smith/shared";
import { hydratePackDetails, type PackRepository } from "../../../pack/repository";
import { syncTelegramThumbnailFile } from "./thumbnailFile";

export async function updateTelegramMirrorMetadata(
  repo: PackRepository,
  input: {
    packId: string;
    syncState?: TelegramPackSummary["syncState"];
    lastSyncedAt?: string | null;
    lastSyncError?: string | null;
    title?: string;
    shortName?: string;
    thumbnailPath?: string | null;
    publishedFromLocalPackId?: string | null;
  },
) {
  return repo.withPackMutationLock(input.packId, async () => {
    const { record, rootPath } = await repo.readPackRecordById(input.packId);
    if (!record.telegram)
      throw new Error(`Pack is not a Telegram mirror: ${input.packId}`);
    if (input.syncState !== undefined)
      record.telegram.syncState = input.syncState;
    if (input.lastSyncedAt !== undefined)
      record.telegram.lastSyncedAt = input.lastSyncedAt;
    if (input.lastSyncError !== undefined)
      record.telegram.lastSyncError = input.lastSyncError;
    if (input.title !== undefined) {
      record.name = input.title;
      record.telegram.title = input.title;
    }
    if (input.shortName !== undefined)
      record.telegram.shortName = input.shortName;
    if (input.thumbnailPath !== undefined)
      record.telegram.thumbnailPath = input.thumbnailPath;
    if (input.publishedFromLocalPackId !== undefined) {
      record.telegram.publishedFromLocalPackId = input.publishedFromLocalPackId;
    }
    await repo.writePackRecord(rootPath, record);
    return hydratePackDetails(record, rootPath);
  });
}

export async function syncTelegramThumbnail(
  repo: PackRepository,
  input: {
    packId: string;
    thumbnailPath: string | null;
    hasThumbnail?: boolean;
    thumbnailExtension?: string | null;
  },
) {
  return repo.withPackMutationLock(input.packId, async () => {
    const { record, rootPath } = await repo.readPackRecordById(input.packId);
    if (!record.telegram)
      throw new Error(`Pack is not a Telegram mirror: ${input.packId}`);
    record.telegram.thumbnailPath = await syncTelegramThumbnailFile(
      rootPath,
      input.thumbnailPath,
      {
        hasThumbnail: input.hasThumbnail,
        preferredExtension: input.thumbnailExtension,
      },
    );
    await repo.writePackRecord(rootPath, record);
    return hydratePackDetails(record, rootPath);
  });
}

export type TelegramStickerDownloadStateInput = DownloadState;
