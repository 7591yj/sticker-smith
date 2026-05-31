import type { StickerPack } from "@sticker-smith/shared";
import type { SidebarPackFilter } from "./types";

export function getSidebarPackGroups(packs: StickerPack[]) {
  const localPacks = packs.filter((pack) => pack.source === "local");
  const telegramPacks = packs.filter(
    (pack) =>
      pack.source === "telegram" && pack.telegram?.syncState !== "unsupported",
  );
  const unsupportedTelegramPacks = packs.filter(
    (pack) =>
      pack.source === "telegram" && pack.telegram?.syncState === "unsupported",
  );

  return { localPacks, telegramPacks, unsupportedTelegramPacks };
}

export function getVisiblePacks(options: {
  activePackFilter: SidebarPackFilter;
  localPacks: StickerPack[];
  telegramPacks: StickerPack[];
  unsupportedTelegramPacks: StickerPack[];
  showUnsupportedTelegram: boolean;
}) {
  if (options.activePackFilter === "local") return options.localPacks;
  return options.showUnsupportedTelegram
    ? [...options.telegramPacks, ...options.unsupportedTelegramPacks]
    : options.telegramPacks;
}
