import type { TelegramDownloadedFile } from "./telegramTdlibTypes";
import { asNumber, getObjectValue } from "./telegramTdlibValues";

export function mapFile(file: any): TelegramDownloadedFile {
  const remote = getObjectValue(file, "remote");
  const local = getObjectValue(file, "local");
  const size = getObjectValue(file, "size") ?? getObjectValue(file, "expected_size");

  return {
    numericFileId: asNumber(getObjectValue(file, "id")),
    fileId: getObjectValue(remote, "id") ?? null,
    fileUniqueId: getObjectValue(remote, "unique_id") ?? null,
    localPath: getObjectValue(local, "path") || null,
    size: asNumber(size),
    downloadedSize: asNumber(getObjectValue(local, "downloaded_size")),
    isDownloaded: Boolean(getObjectValue(local, "is_downloading_completed")),
  };
}
