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
export type TelegramPackFormat = "video" | "static" | "animated" | "mixed" | "unknown";
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
export type AssetId = string;

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

export interface TelegramAssetMetadata {
  stickerId: string;
  fileId: string | null;
  fileUniqueId: string | null;
  position: number;
  baselineOutputHash: string | null;
}

export interface StickerPack {
  id: PackId;
  source: PackSource;
  name: string;
  slug: string;
  rootPath: string;
  sourceRoot: string;
  outputRoot: string;
  iconAssetId: AssetId | null;
  thumbnailPath: string | null;
  telegram?: TelegramPackSummary;
  createdAt: string;
  updatedAt: string;
}

export interface SourceAsset {
  id: AssetId;
  packId: PackId;
  relativePath: string;
  absolutePath: string | null;
  emojiList: string[];
  kind: SourceMediaKind;
  importedAt: string;
  originalImportPath: string | null;
  downloadState: DownloadState;
  telegram?: TelegramAssetMetadata;
}

export interface OutputArtifact {
  packId: PackId;
  sourceAssetId: AssetId;
  mode: ConversionMode;
  relativePath: string;
  absolutePath: string;
  sizeBytes: number;
  sha256: string | null;
  updatedAt: string;
}

export interface StickerPackRecord {
  schemaVersion: 2;
  id: PackId;
  source: PackSource;
  name: string;
  slug: string;
  iconAssetId: AssetId | null;
  telegram?: TelegramPackSummary;
  createdAt: string;
  updatedAt: string;
  assets: Omit<SourceAsset, "absolutePath">[];
  outputs: Omit<OutputArtifact, "absolutePath">[];
}

export interface StickerPackDetails {
  pack: StickerPack;
  assets: SourceAsset[];
  outputs: OutputArtifact[];
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

export interface TelegramAuthStateChangedEvent {
  type: "auth_state_changed";
  state: TelegramState;
}

export interface TelegramSyncStartedEvent {
  type: "sync_started";
}

export interface TelegramPackSyncStartedEvent {
  type: "pack_sync_started";
  packId: string;
  stickerSetId: string;
}

export interface TelegramPackSyncCompletedEvent {
  type: "pack_sync_completed";
  packId: string;
  stickerSetId: string;
}

export interface TelegramPackSyncFailedEvent {
  type: "pack_sync_failed";
  packId: string | null;
  stickerSetId: string;
  error: string;
}

export interface TelegramFileDownloadProgressEvent {
  type: "file_download_progress";
  packId: string;
  assetId: string;
  stickerSetId: string;
  downloadedSize: number;
  totalSize: number;
}

export interface TelegramSyncFinishedEvent {
  type: "sync_finished";
  packIds: string[];
}

export interface TelegramPublishStartedEvent {
  type: "publish_started";
  localPackId: string;
}

export interface TelegramPublishFinishedEvent {
  type: "publish_finished";
  localPackId: string;
  packId: string;
  stickerSetId: string;
}

export interface TelegramPublishFailedEvent {
  type: "publish_failed";
  localPackId: string;
  error: string;
}

export interface TelegramUpdateStartedEvent {
  type: "update_started";
  packId: string;
  stickerSetId: string;
}

export interface TelegramUpdateFinishedEvent {
  type: "update_finished";
  packId: string;
  stickerSetId: string;
}

export interface TelegramUpdateFailedEvent {
  type: "update_failed";
  packId: string;
  stickerSetId: string;
  error: string;
}

export type TelegramEvent =
  | TelegramAuthStateChangedEvent
  | TelegramSyncStartedEvent
  | TelegramPackSyncStartedEvent
  | TelegramPackSyncCompletedEvent
  | TelegramPackSyncFailedEvent
  | TelegramFileDownloadProgressEvent
  | TelegramSyncFinishedEvent
  | TelegramPublishStartedEvent
  | TelegramPublishFinishedEvent
  | TelegramPublishFailedEvent
  | TelegramUpdateStartedEvent
  | TelegramUpdateFinishedEvent
  | TelegramUpdateFailedEvent;

export interface ImportResult {
  imported: SourceAsset[];
  skipped: string[];
}

export interface RenameAssetInput {
  packId: PackId;
  assetId: AssetId;
  nextRelativePath: string;
}

export interface SetAssetEmojisInput {
  packId: PackId;
  assetId: AssetId;
  emojis: string[];
}

export interface SetTelegramTdlibParametersInput {
  apiId: string;
  apiHash: string;
}

export interface SetTelegramPhoneNumberInput {
  phoneNumber: string;
}

export interface SubmitTelegramCodeInput {
  code: string;
}

export interface SubmitTelegramPasswordInput {
  password: string;
}

export interface SyncTelegramPackInput {
  packId: PackId;
}

export interface PublishLocalPackInput {
  packId: PackId;
  title: string;
  shortName: string;
}

export interface UpdateTelegramPackInput {
  packId: PackId;
}

export interface MoveAssetInput {
  packId: PackId;
  assetId: AssetId;
  nextDirectory: string;
}

export interface DeleteAssetInput {
  packId: PackId;
  assetId: AssetId;
}

export interface ConvertSelectionInput {
  packId: PackId;
  assetIds: AssetId[];
}

export interface ConversionTask {
  assetId: AssetId;
  sourcePath: string;
  mode: ConversionMode;
}

export interface ConversionJobEvent {
  type:
    | "job_started"
    | "asset_started"
    | "asset_completed"
    | "asset_failed"
    | "job_finished";
  jobId: string;
  assetId?: AssetId;
  mode?: ConversionMode;
  outputPath?: string;
  error?: string;
  sizeBytes?: number;
  taskCount?: number;
  successCount?: number;
  failureCount?: number;
}

export interface ConversionJobRequest {
  jobId: string;
  outputRoot: string;
  tasks: ConversionTask[];
}
