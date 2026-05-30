import type { TelegramEvent } from "@sticker-smith/shared";
import type { LibraryService } from "../libraryService";
import type { TelegramAuthService } from "../telegramAuthService";
import type { TelegramMirrorService } from "../telegramMirrorService";

export interface TelegramSyncServiceOptions {
  auth: TelegramAuthService;
  libraryService: LibraryService;
  mirrorService: TelegramMirrorService;
  emit: (event: TelegramEvent) => void;
}

export type ActiveDownloadMap = Map<
  number,
  { packId: string; stickerId: string; stickerSetId: string }
>;
