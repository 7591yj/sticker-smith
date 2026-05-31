import type {
  DownloadState,
  SourceMediaKind,
  StickerPackRecord,
  TelegramPackSummary,
  TelegramStickerMetadata,
} from "@sticker-smith/shared";

export interface TelegramMirrorStickerInput {
  id?: string;
  relativePath: string;
  emojiList: string[];
  kind?: SourceMediaKind;
  downloadState: DownloadState;
  telegram: TelegramStickerMetadata;
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
  stickers: TelegramMirrorStickerInput[];
}

export type StickerRecord = StickerPackRecord["stickers"][number];
export type ExistingStickerByTelegramId = Map<string, StickerRecord>;

export type BuildMirrorRecordInput = {
  existing: StickerPackRecord | null;
  upsertInput: TelegramMirrorUpsertInput;
  storedThumbnailPath: string | null;
};
