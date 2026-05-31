import path from "node:path";
import type { DownloadState, TelegramPackSummary } from "@sticker-smith/shared";
import { compactStickerOrders } from "../../packNormalizer";
import { PackRepository } from "../../packRepository";
import type { SettingsService } from "../../settingsService";
import {
  updateTelegramMirrorMetadata as updateMirrorMetadata,
  syncTelegramThumbnail as syncMirrorThumbnail,
} from "./store/metadataMutations";
import { buildMirrorRecord } from "./store/recordBuilder";
import {
  reconcileTelegramMirrorStickers,
  setTelegramStickerDownloadState as setStickerDownloadState,
  writeTelegramStickerFile as writeStickerFile,
} from "./store/stickerFileState";
import { syncTelegramThumbnailFile } from "./store/thumbnailFile";
import type { TelegramMirrorUpsertInput } from "./store/types";

export type {
  TelegramMirrorStickerInput,
  TelegramMirrorUpsertInput,
} from "./store/types";

export class TelegramMirrorStore {
  constructor(
    private readonly repo: PackRepository,
    private readonly _settingsService: SettingsService,
  ) {}

  async reconcileTelegramMirrorStickers(
    record: Parameters<typeof reconcileTelegramMirrorStickers>[0],
    rootPath: string,
  ) {
    return reconcileTelegramMirrorStickers(record, rootPath);
  }

  private async writeUpsertedTelegramMirror(
    input: TelegramMirrorUpsertInput,
    existing: Awaited<
      ReturnType<PackRepository["findPackByTelegramStickerSetId"]>
    >,
    rootPath: string,
  ) {
    const storedThumbnailPath = await syncTelegramThumbnailFile(
      rootPath,
      input.thumbnailPath,
      {
        hasThumbnail: input.hasThumbnail,
        preferredExtension: input.thumbnailExtension,
      },
    );
    const record = buildMirrorRecord({
      existing: existing?.record ?? null,
      upsertInput: input,
      storedThumbnailPath,
    });
    await reconcileTelegramMirrorStickers(record, rootPath);
    compactStickerOrders(record);
    await this.repo.writePackRecord(rootPath, record);
    return { record, rootPath };
  }

  async upsertTelegramMirror(input: TelegramMirrorUpsertInput) {
    await this.repo.ensureReady();
    const existing = await this.repo.findPackByTelegramStickerSetId(
      input.stickerSetId,
    );
    const rootPath =
      existing?.rootPath ??
      path.join(this.repo.getPacksRoot(), `telegram-${input.stickerSetId}`);
    const lockId = existing?.record.id ?? `telegram-${input.stickerSetId}`;
    return this.repo.withPackMutationLock(lockId, () =>
      this.writeUpsertedTelegramMirror(input, existing, rootPath),
    );
  }

  async writeTelegramStickerFile(input: {
    packId: string;
    stickerId: string;
    sourceFilePath: string;
    relativePath?: string;
    baselineStickerHash?: string | null;
  }) {
    return writeStickerFile(this.repo, input);
  }

  async setTelegramStickerDownloadState(input: {
    packId: string;
    stickerId: string;
    downloadState: DownloadState;
  }) {
    return setStickerDownloadState(this.repo, input);
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
    return updateMirrorMetadata(this.repo, input);
  }

  async syncTelegramThumbnail(input: {
    packId: string;
    thumbnailPath: string | null;
    hasThumbnail?: boolean;
    thumbnailExtension?: string | null;
  }) {
    return syncMirrorThumbnail(this.repo, input);
  }
}
