import type { TelegramSessionUser } from "@sticker-smith/shared";

export interface TelegramTdlibCredentials {
  apiId: number;
  apiHash: string;
  phoneNumber: string | null;
  databaseDirectory: string;
  filesDirectory: string;
  databaseEncryptionKey: string;
}

export interface TelegramDownloadedFile {
  numericFileId: number;
  fileId: string | null;
  fileUniqueId: string | null;
  localPath: string | null;
  size: number;
  downloadedSize: number;
  isDownloaded: boolean;
}

export interface TelegramRemoteSticker {
  stickerId: string;
  fileId: string | null;
  fileUniqueId: string | null;
  numericFileId: number;
  position: number;
  emojiList: string[];
  format: "video" | "static" | "animated" | "unknown";
}

export interface TelegramRemoteStickerSet {
  stickerSetId: string;
  shortName: string;
  title: string;
  format: "video" | "static" | "animated" | "mixed" | "unknown";
  thumbnailStickerId: string | null;
  thumbnailFile?: TelegramDownloadedFile | null;
  stickers: TelegramRemoteSticker[];
}

export interface TelegramTdlibStateListener {
  onAuthStateChanged: (state: {
    authStep:
      | "wait_tdlib_parameters"
      | "wait_phone_number"
      | "wait_code"
      | "wait_password"
      | "ready"
      | "logged_out";
    message: string;
    sessionUser?: TelegramSessionUser | null;
    lastError?: string | null;
  }) => void;
  onFileDownloadProgress?: (update: {
    numericFileId: number;
    downloadedSize: number;
    totalSize: number;
  }) => void;
  onRuntimeError?: (error: Error) => void;
}

export type TelegramAuthStep = Parameters<
  TelegramTdlibStateListener["onAuthStateChanged"]
>[0]["authStep"];

export type TdClient = {
  invoke(request: Record<string, unknown>): Promise<any>;
  on(event: "update" | "error" | "close", listener: (...args: any[]) => void): void;
  close(): Promise<void>;
  isClosed(): boolean;
};

export interface PendingDownload {
  resolve: (file: TelegramDownloadedFile) => void;
  reject: (error: Error) => void;
}
