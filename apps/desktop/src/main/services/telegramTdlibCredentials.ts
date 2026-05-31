import type { TelegramTdlibCredentials } from "./telegramTdlibTypes";

export function summarizeTdlibParameters(credentials: TelegramTdlibCredentials) {
  return {
    apiId: credentials.apiId,
    apiHashLength: credentials.apiHash.length,
    databaseDirectory: credentials.databaseDirectory,
    filesDirectory: credentials.filesDirectory,
    databaseEncryptionKeyLength: credentials.databaseEncryptionKey.length,
  };
}
