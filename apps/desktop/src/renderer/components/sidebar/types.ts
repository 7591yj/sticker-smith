import type { MouseEvent } from "react";
import type { StickerPack, TelegramState } from "@sticker-smith/shared";

export interface SidebarProps {
  packs: StickerPack[];
  telegramState: TelegramState | null;
  telegramSyncInProgress: boolean;
  telegramSyncRecommended: boolean;
  selectedPackId: string | null;
  width: number;
  onSelect: (id: string) => void;
  onSubmitTelegramTdlibParameters: (input: {
    apiId: string;
    apiHash: string;
  }) => Promise<unknown>;
  onSubmitTelegramPhoneNumber: (input: {
    phoneNumber: string;
  }) => Promise<unknown>;
  onSubmitTelegramCode: (input: { code: string }) => Promise<unknown>;
  onSubmitTelegramPassword: (input: { password: string }) => Promise<unknown>;
  onLogoutTelegram: () => Promise<unknown>;
  onResetTelegram: () => Promise<unknown>;
  onSyncTelegramPacks: () => Promise<unknown>;
  refreshPacks: () => Promise<StickerPack[]>;
  setSelectedPackId: (id: string | null) => void;
}

export type SidebarPackFilter = "local" | "telegram";

export type PackContextMenuState = {
  mouseX: number;
  mouseY: number;
  pack: StickerPack;
} | null;

export type PackContextMenuHandler = (e: MouseEvent, pack: StickerPack) => void;
