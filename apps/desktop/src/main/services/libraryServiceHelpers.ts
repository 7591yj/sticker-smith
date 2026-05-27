import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { SourceMediaKind, StickerItem, StickerPackRecord } from "@sticker-smith/shared";
import { supportedMediaKinds } from "@sticker-smith/shared";

import { resolvePackPaths } from "./packRepository";
import { sha256ForFile } from "../utils/fsUtils";
import { nowIso } from "../utils/timeUtils";

const supportedMediaKindsSet = new Set<SourceMediaKind>(supportedMediaKinds);

export function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "pack";
}

function extToKind(filePath: string): SourceMediaKind | null {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  return supportedMediaKindsSet.has(extension as SourceMediaKind) ? (extension as SourceMediaKind) : null;
}

function stickerRelativePath(stickerId: string) {
  return `${stickerId}.webm`;
}

export async function collectFiles(directoryPath: string): Promise<string[]> {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const result: string[] = [];
  for (const entry of entries) {
    const absolutePath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) result.push(...(await collectFiles(absolutePath)));
    else if (entry.isFile()) result.push(absolutePath);
  }
  return result.sort((a, b) => a.localeCompare(b));
}

function nextStickerOrder(record: StickerPackRecord) {
  return record.stickers.reduce((max, sticker) => Math.max(max, sticker.order), -1) + 1;
}

export async function importStickerFiles(record: StickerPackRecord, rootPath: string, filePaths: string[]) {
  const skipped: string[] = [];
  const imported: StickerItem[] = [];
  const { outputRoot } = resolvePackPaths(rootPath);
  await fs.mkdir(outputRoot, { recursive: true });

  for (const filePath of filePaths) {
    const sticker = await importStickerFile(record, outputRoot, filePath);
    if (sticker) imported.push(sticker);
    else skipped.push(filePath);
  }

  return { imported, skipped };
}

async function importStickerFile(record: StickerPackRecord, outputRoot: string, filePath: string) {
  const kind = extToKind(filePath);
  if (!kind) return null;

  const id = randomUUID();
  const relativePath = stickerRelativePath(id);
  const absolutePath = path.join(outputRoot, relativePath);
  await fs.copyFile(filePath, absolutePath);
  const stat = await fs.stat(absolutePath);
  const now = nowIso();
  const sticker: StickerPackRecord["stickers"][number] = {
    id,
    packId: record.id,
    order: nextStickerOrder(record),
    relativePath,
    originalFileName: path.basename(filePath),
    emojiList: [],
    sizeBytes: stat.size,
    sha256: await sha256ForFile(absolutePath),
    importedAt: now,
    updatedAt: now,
    downloadState: "ready",
  };
  record.stickers.push(sticker);
  return { ...sticker, absolutePath };
}

export function reorderStickers(record: StickerPackRecord, stickerId: string, beforeStickerId: string | null) {
  const stickers = [...record.stickers].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const current = stickers.findIndex((item) => item.id === stickerId);
  if (current === -1) throw new Error(`Sticker not found: ${stickerId}`);

  const [moved] = stickers.splice(current, 1);
  if (!moved) throw new Error(`Sticker not found: ${stickerId}`);
  const next = beforeStickerId === null ? stickers.length : stickers.findIndex((item) => item.id === beforeStickerId);
  if (next === -1) throw new Error(`Sticker not found: ${beforeStickerId}`);

  stickers.splice(next, 0, moved);
  stickers.forEach((sticker, order) => { sticker.order = order; });
  record.stickers = stickers;
}

export function removeStickers(record: StickerPackRecord, stickerIds: string[]) {
  const ids = new Set(stickerIds);
  const removed = record.stickers.filter((sticker) => ids.has(sticker.id));
  if (removed.length !== ids.size) throw new Error("Sticker not found");

  record.stickers = record.stickers.filter((sticker) => !ids.has(sticker.id));
  if (record.iconStickerId && ids.has(record.iconStickerId)) record.iconStickerId = null;
  return removed;
}
