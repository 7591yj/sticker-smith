import fs from "node:fs/promises";
import path from "node:path";
import type { StickerPackRecord } from "@sticker-smith/shared";
import {
  hydratePackDetails,
  type PackRepository,
  resolvePackPaths,
} from "../../../pack/repository";
import { markStickerFileReady } from "../../../pack/stickerFileState";
import { pathExists, sha256ForFile } from "../../../../utils/fsUtils";
import { stickerRelativePath } from "./stickerPaths";
import type { StickerRecord } from "./types";

function markMissingIfReady(sticker: StickerRecord) {
  if (sticker.downloadState === "ready") sticker.downloadState = "missing";
}

async function markMirrorStickerFileReady(
  sticker: StickerRecord,
  absolutePath: string,
) {
  const stat = await fs.stat(absolutePath);
  sticker.sizeBytes = stat.size;
  sticker.sha256 ??= await sha256ForFile(absolutePath);
  sticker.telegram && (sticker.telegram.baselineStickerHash ??= sticker.sha256);
  sticker.downloadState = "ready";
}

async function reconcileTelegramMirrorSticker(
  sticker: StickerRecord,
  outputRoot: string,
) {
  const absolutePath = path.join(outputRoot, sticker.relativePath);
  if (!(await pathExists(absolutePath))) {
    markMissingIfReady(sticker);
    return;
  }

  await markMirrorStickerFileReady(sticker, absolutePath);
}

export async function reconcileTelegramMirrorStickers(
  record: StickerPackRecord,
  rootPath: string,
) {
  if (record.source !== "telegram") return;
  const { outputRoot } = resolvePackPaths(rootPath);
  for (const sticker of record.stickers) {
    await reconcileTelegramMirrorSticker(sticker, outputRoot);
  }
}

function requireSticker(record: StickerPackRecord, stickerId: string) {
  const sticker = record.stickers.find((item) => item.id === stickerId);
  if (!sticker) throw new Error(`Sticker not found: ${stickerId}`);
  return sticker;
}

export async function writeTelegramStickerFile(
  repo: PackRepository,
  input: {
    packId: string;
    stickerId: string;
    sourceFilePath: string;
    relativePath?: string;
    baselineStickerHash?: string | null;
  },
) {
  return repo.withPackMutationLock(input.packId, async () => {
    const { record, rootPath } = await repo.readPackRecordById(input.packId);
    const sticker = requireSticker(record, input.stickerId);
    const relativePath = input.relativePath ?? stickerRelativePath(sticker.id);
    const absolutePath = path.join(
      resolvePackPaths(rootPath).outputRoot,
      relativePath,
    );
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.copyFile(input.sourceFilePath, absolutePath);
    const stat = await fs.stat(absolutePath);
    markStickerFileReady(sticker, {
      relativePath,
      sizeBytes: stat.size,
      sha256: await sha256ForFile(absolutePath),
    });
    if (sticker.telegram) {
      sticker.telegram.baselineStickerHash =
        input.baselineStickerHash ?? sticker.sha256;
    }
    await repo.writePackRecord(rootPath, record);
    return hydratePackDetails(record, rootPath);
  });
}

export async function setTelegramStickerDownloadState(
  repo: PackRepository,
  input: {
    packId: string;
    stickerId: string;
    downloadState: StickerRecord["downloadState"];
  },
) {
  return repo.withPackMutationLock(input.packId, async () => {
    const { record, rootPath } = await repo.readPackRecordById(input.packId);
    const sticker = requireSticker(record, input.stickerId);
    sticker.downloadState = input.downloadState;
    await repo.writePackRecord(rootPath, record);
    return hydratePackDetails(record, rootPath);
  });
}
