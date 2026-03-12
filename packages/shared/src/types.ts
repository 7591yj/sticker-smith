export const supportedMediaKinds = [
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "bmp",
  "tiff",
  "mp4",
] as const;

export type SourceMediaKind = (typeof supportedMediaKinds)[number];
export type ConversionMode = "icon" | "sticker";
export type PackSource = "local" | "telegram";
export type TelegramAuthMode = "user" | "bot";
export type TelegramConnectionStatus =
  | "disconnected"
  | "awaiting_credentials"
  | "connected";
export type PackId = string;
export type AssetId = string;

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
  createdAt: string;
  updatedAt: string;
}

export interface SourceAsset {
  id: AssetId;
  packId: PackId;
  relativePath: string;
  absolutePath: string;
  emojiList: string[];
  kind: SourceMediaKind;
  importedAt: string;
  originalImportPath: string | null;
}

export interface OutputArtifact {
  packId: PackId;
  sourceAssetId: AssetId;
  mode: ConversionMode;
  relativePath: string;
  absolutePath: string;
  sizeBytes: number;
  updatedAt: string;
}

export interface StickerPackRecord {
  id: PackId;
  source: PackSource;
  name: string;
  slug: string;
  iconAssetId: AssetId | null;
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

export interface TelegramState {
  backend: "tdlib";
  status: TelegramConnectionStatus;
  selectedMode: TelegramAuthMode | null;
  recommendedMode: TelegramAuthMode;
  message: string;
  updatedAt: string;
}

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
