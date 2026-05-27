import { z } from "zod";

import { unicodeEmojiSet } from "../emojiCatalog";
import { supportedMediaKinds } from "../types";

const rgiEmojiPattern = new RegExp("^\\p{RGI_Emoji}$", "v");

function isTelegramCompatibleEmoji(value: string) {
  const trimmed = value.trim();
  return unicodeEmojiSet.has(trimmed) || rgiEmojiPattern.test(trimmed);
}

export const packIdSchema = z.string().min(1);
export const stickerIdSchema = z.string().min(1);
export const mediaKindSchema = z.enum(supportedMediaKinds);
export const conversionModeSchema = z.enum(["icon", "sticker"]);
export const telegramAuthModeSchema = z.enum(["user"]);
export const emojiSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .refine(isTelegramCompatibleEmoji, {
    message: "Expected a Telegram-compatible emoji.",
  });
export const emojiListSchema = z.array(emojiSchema).max(20);
const storedEmojiSchema = z.string().trim().min(1).max(32);
const storedEmojiListSchema = z.array(storedEmojiSchema).max(20);
export const telegramRequiredEmojiListSchema = emojiListSchema.min(1);
export const telegramShortNameSchema = z
  .string()
  .trim()
  .min(5)
  .max(64)
  .regex(/^[A-Za-z][A-Za-z0-9_]*$/);

export const conversionTaskSchema = z.object({
  stickerId: stickerIdSchema,
  sourcePath: z.string().min(1),
  mode: conversionModeSchema,
  outputPath: z
    .string()
    .min(1)
    .regex(/\.webm$/i),
});

export const importConversionTaskSchema = z.object({
  sourcePath: z.string().min(1),
  originalFileName: z.string().min(1),
  outputPath: z
    .string()
    .min(1)
    .regex(/\.webm$/i),
});

export const downloadStateSchema = z.enum([
  "missing",
  "queued",
  "downloading",
  "ready",
  "failed",
]);

export const telegramStickerMetadataSchema = z
  .object({
    stickerId: z.string().min(1),
    fileId: z.string().nullable(),
    fileUniqueId: z.string().nullable(),
    position: z.number().int().nonnegative(),
    baselineStickerHash: z.string().min(1).nullable(),
  })
  .strict();

export const telegramPackSummarySchema = z
  .object({
    stickerSetId: z.string().min(1),
    shortName: z.string(),
    title: z.string(),
    format: z.enum(["video", "static", "animated", "mixed", "unknown"]),
    thumbnailPath: z.string().nullable().optional(),
    syncState: z.enum(["idle", "syncing", "stale", "error", "unsupported"]),
    lastSyncedAt: z.string().nullable(),
    lastSyncError: z.string().nullable(),
    publishedFromLocalPackId: z.string().nullable(),
  })
  .strict();

export const stickerItemSchema = z
  .object({
    id: stickerIdSchema,
    packId: packIdSchema,
    order: z.number().int().nonnegative(),
    relativePath: z
      .string()
      .min(1)
      .regex(/\.webm$/i),
    originalFileName: z.string().min(1).nullable(),
    emojiList: storedEmojiListSchema,
    sizeBytes: z.number().int().nonnegative(),
    sha256: z.string().min(1).nullable(),
    importedAt: z.string().min(1),
    updatedAt: z.string().min(1),
    downloadState: downloadStateSchema.optional(),
    telegram: telegramStickerMetadataSchema.optional(),
  })
  .strict();

export const stickerPackRecordSchema = z
  .object({
    schemaVersion: z.literal(4),
    id: packIdSchema,
    source: z.enum(["local", "telegram"]),
    name: z.string().min(1),
    slug: z.string().min(1),
    iconStickerId: stickerIdSchema.nullable(),
    telegramShortName: z.string().nullable().optional(),
    telegram: telegramPackSummarySchema.optional(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    stickers: z.array(stickerItemSchema),
  })
  .strict();

export const conversionJobRequestSchema = z.object({
  jobId: z.string().min(1),
  outputRoot: z.string().min(1),
  tasks: z.array(conversionTaskSchema),
});

export const conversionJobEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("job_started"),
    jobId: z.string().min(1),
    taskCount: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("sticker_started"),
    jobId: z.string().min(1),
    stickerId: stickerIdSchema,
    mode: conversionModeSchema,
  }),
  z.object({
    type: z.literal("sticker_completed"),
    jobId: z.string().min(1),
    stickerId: stickerIdSchema,
    mode: conversionModeSchema,
    outputPath: z.string().min(1),
    sizeBytes: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("sticker_failed"),
    jobId: z.string().min(1),
    stickerId: stickerIdSchema,
    mode: conversionModeSchema,
    error: z.string().min(1),
  }),
  z.object({
    type: z.literal("job_finished"),
    jobId: z.string().min(1),
    successCount: z.number().int().nonnegative(),
    failureCount: z.number().int().nonnegative(),
  }),
]);
