import type { StickerPackDetails, TelegramEvent } from "@sticker-smith/shared";

import type { LibraryService } from "../../libraryService";
import type { TelegramAuthService } from "../auth/service";
import type { TelegramMirrorService } from "../mirror/service";
import type { TelegramSyncService } from "../sync/service";

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
