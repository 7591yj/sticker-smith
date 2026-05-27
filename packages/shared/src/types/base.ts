export const supportedMediaKinds = [
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "bmp",
  "tiff",
  "mp4",
  "webm",
] as const;

export type SourceMediaKind = (typeof supportedMediaKinds)[number];
export type ConversionMode = "icon" | "sticker";
export type PackSource = "local" | "telegram";
export type TelegramAuthMode = "user";
export type TelegramConnectionStatus =
  | "disconnected"
  | "awaiting_credentials"
  | "connected";
export type TelegramAuthStep =
  | "choose_mode"
  | "wait_tdlib_parameters"
  | "wait_phone_number"
  | "wait_code"
  | "wait_password"
  | "ready"
  | "logged_out";
export type TelegramPackFormat =
  | "video"
  | "static"
  | "animated"
  | "mixed"
  | "unknown";
export type TelegramPackSyncState =
  | "idle"
  | "syncing"
  | "stale"
  | "error"
  | "unsupported";
export type DownloadState =
  | "missing"
  | "queued"
  | "downloading"
  | "ready"
  | "failed";
export type PackId = string;
export type StickerId = string;

export interface TelegramPackSummary {
  stickerSetId: string;
  shortName: string;
  title: string;
  format: TelegramPackFormat;
  thumbnailPath?: string | null;
  syncState: TelegramPackSyncState;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  publishedFromLocalPackId: string | null;
}

export interface TelegramStickerMetadata {
  stickerId: string;
  fileId: string | null;
  fileUniqueId: string | null;
  position: number;
  baselineStickerHash: string | null;
}

export interface StickerPack {
  id: PackId;
  source: PackSource;
  name: string;
  slug: string;
  rootPath: string;
  iconStickerId: StickerId | null;
  thumbnailPath: string | null;
  telegramShortName?: string | null;
  telegram?: TelegramPackSummary;
  createdAt: string;
  updatedAt: string;
}

export interface StickerItem {
  id: StickerId;
  packId: PackId;
  order: number;
  relativePath: string;
  absolutePath: string;
  originalFileName: string | null;
  emojiList: string[];
  sizeBytes: number;
  sha256: string | null;
  importedAt: string;
  updatedAt: string;
  downloadState?: DownloadState;
  telegram?: TelegramStickerMetadata;
}

export interface StickerPackRecord {
  schemaVersion: 4;
  id: PackId;
  source: PackSource;
  name: string;
  slug: string;
  iconStickerId: StickerId | null;
  telegramShortName?: string | null;
  telegram?: TelegramPackSummary;
  createdAt: string;
  updatedAt: string;
  stickers: Omit<StickerItem, "absolutePath">[];
}

export interface StickerPackDetails {
  pack: StickerPack;
  stickers: StickerItem[];
}

export interface LibraryConfig {
  version: number;
  libraryRoot: string;
  updatedAt: string;
}

export interface TelegramSessionUser {
  id: number;
  username: string | null;
  displayName: string;
}

export interface TelegramState {
  backend: "tdlib";
  status: TelegramConnectionStatus;
  authStep: TelegramAuthStep;
  selectedMode: TelegramAuthMode | null;
  recommendedMode: TelegramAuthMode;
  message: string;
  tdlib: {
    apiId: string | null;
    apiHashConfigured: boolean;
  };
  user: {
    phoneNumber: string | null;
  };
  sessionUser: TelegramSessionUser | null;
  lastError: string | null;
  updatedAt: string;
}
