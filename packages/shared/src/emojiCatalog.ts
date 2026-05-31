import emojiCatalogData from "./emojiCatalogData.json";

export interface EmojiCatalogEntry {
  emoji: string;
  name: string;
  group: string;
  subgroup: string;
  searchText: string;
}

export const unicodeEmojiCatalog: EmojiCatalogEntry[] = emojiCatalogData;

export const unicodeEmojiSet = new Set(
  unicodeEmojiCatalog.map((entry) => entry.emoji),
);
