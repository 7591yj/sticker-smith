import { z } from "zod";

import { supportedMediaKinds } from "./types";

export const packIdSchema = z.string().min(1);
export const assetIdSchema = z.string().min(1);
export const mediaKindSchema = z.enum(supportedMediaKinds);
export const conversionModeSchema = z.enum(["icon", "sticker"]);
export const telegramAuthModeSchema = z.enum(["user", "bot"]);
export const emojiListSchema = z.array(z.string().min(1)).min(1).max(20);

export const conversionTaskSchema = z.object({
  assetId: assetIdSchema,
  sourcePath: z.string().min(1),
  mode: conversionModeSchema,
});

export const conversionJobRequestSchema = z.object({
  jobId: z.string().min(1),
  outputRoot: z.string().min(1),
  tasks: z.array(conversionTaskSchema),
});

export const createPackSchema = z.object({
  name: z.string().min(1),
});

export const renamePackSchema = z.object({
  packId: packIdSchema,
  name: z.string().min(1),
});

export const deletePackSchema = z.object({
  packId: packIdSchema,
});

export const setPackIconSchema = z.object({
  packId: packIdSchema,
  assetId: assetIdSchema.nullable(),
});

export const importFilesSchema = z.object({
  packId: packIdSchema,
  filePaths: z.array(z.string().min(1)).optional(),
});

export const importDirectorySchema = z.object({
  packId: packIdSchema,
  directoryPath: z.string().min(1).optional(),
});

export const renameAssetSchema = z.object({
  packId: packIdSchema,
  assetId: assetIdSchema,
  nextRelativePath: z.string().min(1),
});

export const setAssetEmojisSchema = z.object({
  packId: packIdSchema,
  assetId: assetIdSchema,
  emojis: emojiListSchema,
});

export const moveAssetSchema = z.object({
  packId: packIdSchema,
  assetId: assetIdSchema,
  nextDirectory: z.string(),
});

export const deleteAssetSchema = z.object({
  packId: packIdSchema,
  assetId: assetIdSchema,
});

export const convertSelectionSchema = z.object({
  packId: packIdSchema,
  assetIds: z.array(assetIdSchema),
});

export const listOutputsSchema = z.object({
  packId: packIdSchema,
});

export const revealOutputSchema = z.object({
  packId: packIdSchema,
  relativePath: z.string().min(1).optional(),
});

export const exportOutputFolderSchema = z.object({
  packId: packIdSchema,
});

export const selectTelegramAuthModeSchema = z.object({
  mode: telegramAuthModeSchema,
});
