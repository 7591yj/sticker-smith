import { randomBytes } from "node:crypto";

export function describeTdlibError(error: unknown) {
  const message = (error as Error)?.message ?? "Telegram request failed.";

  if (/PHONE_CODE_INVALID/i.test(message)) {
    return "The Telegram login code is invalid.";
  }

  if (/PASSWORD_HASH_INVALID/i.test(message)) {
    return "The Telegram password is invalid.";
  }

  if (/FLOOD_WAIT/i.test(message)) {
    return message;
  }

  if (/STICKERSET_INVALID|STICKERSET_OWNER_ANONYMOUS/i.test(message)) {
    return "The selected Telegram sticker set is no longer owned by the current account.";
  }

  return message;
}

export function describeUnsupportedStickerSet(
  stickerSet: Pick<{ title: string; format: string }, "title" | "format">,
) {
  return `Telegram pack "${stickerSet.title}" uses ${stickerSet.format} stickers, and only video sticker packs are supported currently.`;
}

export function normalizeTdlibCredential(value: string) {
  return value
    .trim()
    .replace(/^[\'"`]+|[\'"`]+$/g, "")
    .replace(/[\s\u200B\u200C\u200D\u2060\uFEFF]+/gu, "");
}

export function parseTdlibParameters(input: {
  apiId: string;
  apiHash: string;
}) {
  const apiId = normalizeTdlibCredential(input.apiId);
  const apiHash = normalizeTdlibCredential(input.apiHash);

  if (!/^\d+$/.test(apiId)) {
    throw new Error("Telegram api_id should contain only digits.");
  }

  if (!/^[0-9a-f]{32}$/i.test(apiHash)) {
    throw new Error(
      "Telegram api_hash should be the 32-character hash from my.telegram.org.",
    );
  }

  return { apiId, apiHash };
}

export function normalizeTelegramPhoneNumber(value: string) {
  const trimmed = value.trim();
  const normalized = trimmed.replace(
    /[\s\u00A0\u200B\u200C\u200D\u2060\uFEFF()-]+/gu,
    "",
  );

  if (normalized.startsWith("00")) {
    return `+${normalized.slice(2)}`;
  }

  return normalized;
}

export const INVALID_TDLIB_CREDENTIALS_MESSAGE =
  "Stored Telegram TDLib credentials are invalid. Enter your api_id and api_hash from my.telegram.org again.";

export function isTdlibBytesString(value: string) {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) {
    return false;
  }

  try {
    return Buffer.from(value, "base64").toString("base64") === value;
  } catch {
    return false;
  }
}

export function createTdlibDatabaseEncryptionKey() {
  return randomBytes(32).toString("base64");
}
