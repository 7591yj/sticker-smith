import type { ConversionMode, StickerId, TelegramState } from "./base";

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
  stickerId: string;
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

export interface ConversionJobEvent {
  type:
    | "job_started"
    | "sticker_started"
    | "sticker_completed"
    | "sticker_failed"
    | "job_finished";
  jobId: string;
  stickerId?: StickerId;
  mode?: ConversionMode;
  outputPath?: string;
  error?: string;
  sizeBytes?: number;
  taskCount?: number;
  successCount?: number;
  failureCount?: number;
}
