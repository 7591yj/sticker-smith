import type { TelegramDownloadedFile } from "./types";
import { asNumber, getObjectValue } from "./values";

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
