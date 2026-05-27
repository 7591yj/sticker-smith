import { FULL_FILE_DOWNLOAD_LIMIT } from "../config/constants";
import { mapFile } from "./telegramTdlibMapping";
import type { PendingDownload, TdClient, TelegramDownloadedFile } from "./telegramTdlibTypes";

export class TelegramTdlibDownloadManager {
  private readonly pendingDownloads = new Map<number, PendingDownload>();

  constructor(
    private readonly getClient: () => TdClient | null,
    private readonly emitFileDownloadProgress: (update: {
      numericFileId: number;
      downloadedSize: number;
      totalSize: number;
    }) => void,
  ) {}

  handleFileUpdate(file: any) {
    const mapped = mapFile(file);
    this.emitFileDownloadProgress({
      numericFileId: mapped.numericFileId,
      downloadedSize: mapped.downloadedSize,
      totalSize: mapped.size,
    });

    if (!mapped.isDownloaded) {
      return;
    }

    const pending = this.pendingDownloads.get(mapped.numericFileId);
    if (!pending) {
      return;
    }

    this.pendingDownloads.delete(mapped.numericFileId);
    pending.resolve(mapped);
  }

  rejectPendingDownloads(error: Error) {
    for (const [numericFileId, pending] of this.pendingDownloads) {
      pending.reject(error);
      this.pendingDownloads.delete(numericFileId);
    }
  }

  async downloadFile(numericFileId: number) {
    const client = this.getClient();
    if (!client) {
      throw new Error("TDLib client is not started.");
    }

    const initial = mapFile(
      await client.invoke({
        _: "downloadFile",
        file_id: numericFileId,
        priority: 32,
        offset: 0,
        // Newer TDLib builds reject 0 here even though older docs allowed it.
        limit: FULL_FILE_DOWNLOAD_LIMIT,
        synchronous: false,
      }),
    );

    if (initial.isDownloaded) {
      return initial;
    }

    return new Promise<TelegramDownloadedFile>((resolve, reject) => {
      this.pendingDownloads.set(numericFileId, { resolve, reject });
    });
  }
}
