import type { PackId, StickerId, StickerItem } from "./base";

export interface ImportResult {
  imported: StickerItem[];
  skipped: string[];
}

export interface RenameStickerInput {
  packId: PackId;
  stickerId: StickerId;
  nextRelativePath: string;
}

export interface RenameManyStickersInput {
  packId: PackId;
  stickerIds: StickerId[];
  baseName: string;
}

export interface SetStickerEmojisInput {
  packId: PackId;
  stickerId: StickerId;
  emojis: string[];
}

export interface ReorderStickerInput {
  packId: PackId;
  stickerId: StickerId;
  beforeStickerId: StickerId | null;
}

export interface SetManyStickerEmojisInput {
  packId: PackId;
  stickerIds: StickerId[];
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

export interface SetPackTelegramShortNameInput {
  packId: PackId;
  shortName: string | null;
}

export interface UpdateTelegramPackInput {
  packId: PackId;
}

export interface MoveStickerInput {
  packId: PackId;
  stickerId: StickerId;
  nextDirectory: string;
}

export interface DeleteStickerInput {
  packId: PackId;
  stickerId: StickerId;
}

export interface DeleteManyStickersInput {
  packId: PackId;
  stickerIds: StickerId[];
}

export interface ConvertInput {
  packId: PackId;
  stickerIds: StickerId[];
}
