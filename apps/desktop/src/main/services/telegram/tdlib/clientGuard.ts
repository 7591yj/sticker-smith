import type { TdClient } from "./types";

export function requireTdlibClient(client: TdClient | null): TdClient {
  if (!client) {
    throw new Error("TDLib client is not started.");
  }

  return client;
}

export function requireNonEmptyStickerSetShortName(shortNameInput: string) {
  const shortName = shortNameInput.trim();
  if (!shortName) {
    throw new Error("Telegram sticker set short name must be non-empty.");
  }

  return shortName;
}
