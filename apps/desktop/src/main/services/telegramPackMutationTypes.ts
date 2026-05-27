import type { StickerPackDetails, TelegramEvent } from "@sticker-smith/shared";

import type { LibraryService } from "./libraryService";
import type { TelegramAuthService } from "./telegramAuthService";
import type { TelegramMirrorService } from "./telegramMirrorService";
import type { TelegramSyncService } from "./telegramSyncService";

export interface TelegramPackMutationServiceOptions {
  auth: TelegramAuthService;
  syncService: TelegramSyncService;
  libraryService: LibraryService;
  mirrorService: TelegramMirrorService;
  emit: (event: TelegramEvent) => void;
}

export type StickerPackSticker = StickerPackDetails["stickers"][number];
export type StickerSticker = StickerPackSticker;
export type StickerOutput = StickerPackSticker | undefined;

export type UpdateTelegramPackContext = {
  details: StickerPackDetails;
  telegram: NonNullable<StickerPackDetails["pack"]["telegram"]>;
  stickerStickers: StickerSticker[];
};
