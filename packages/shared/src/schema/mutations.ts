import { z } from "zod";

import {
  emojiListSchema,
  packIdSchema,
  stickerIdSchema,
  telegramRequiredEmojiListSchema,
  telegramShortNameSchema,
} from "./base";

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
  stickerId: stickerIdSchema.nullable(),
});

export const setPackTelegramShortNameSchema = z.object({
  packId: packIdSchema,
  shortName: telegramShortNameSchema.nullable(),
});

export const importFilesSchema = z.object({
  packId: packIdSchema,
  filePaths: z.array(z.string().min(1)).optional(),
});

export const importDirectorySchema = z.object({
  packId: packIdSchema,
  directoryPath: z.string().min(1).optional(),
});

export const renameStickerSchema = z.object({
  packId: packIdSchema,
  stickerId: stickerIdSchema,
  nextRelativePath: z.string().min(1),
});

export const renameManyStickersSchema = z.object({
  packId: packIdSchema,
  stickerIds: z.array(stickerIdSchema).min(1),
  baseName: z.string().trim().min(1),
});

export const setStickerEmojisSchema = z.object({
  packId: packIdSchema,
  stickerId: stickerIdSchema,
  emojis: emojiListSchema,
});

export const reorderStickerSchema = z.object({
  packId: packIdSchema,
  stickerId: stickerIdSchema,
  beforeStickerId: stickerIdSchema.nullable(),
});

export const setManyStickerEmojisSchema = z.object({
  packId: packIdSchema,
  stickerIds: z.array(stickerIdSchema).min(1),
  emojis: emojiListSchema,
});

export const moveStickerSchema = z.object({
  packId: packIdSchema,
  stickerId: stickerIdSchema,
  nextDirectory: z.string(),
});

export const deleteStickerSchema = z.object({
  packId: packIdSchema,
  stickerId: stickerIdSchema,
});

export const deleteManyStickersSchema = z.object({
  packId: packIdSchema,
  stickerIds: z.array(stickerIdSchema).min(1),
});

export const convertSchema = z.object({
  packId: packIdSchema,
  stickerIds: z.array(stickerIdSchema).min(1),
});

export const listStickersSchema = z.object({
  packId: packIdSchema,
});

export const revealStickerSchema = z.object({
  packId: packIdSchema,
  relativePath: z.string().min(1).optional(),
});

export const exportStickerFolderSchema = z.object({
  packId: packIdSchema,
});

export const setTelegramTdlibParametersSchema = z.object({
  apiId: z.string().min(1),
  apiHash: z.string().min(1),
});

export const setTelegramPhoneNumberSchema = z.object({
  phoneNumber: z.string().min(1),
});

export const submitTelegramCodeSchema = z.object({
  code: z.string().min(1),
});

export const submitTelegramPasswordSchema = z.object({
  password: z.string().min(1),
});

export const syncOwnedTelegramPacksSchema = z.object({});

export const downloadTelegramPackMediaSchema = z.object({
  packId: packIdSchema,
});

export const publishLocalPackSchema = z.object({
  packId: packIdSchema,
  title: z.string().trim().min(1),
  shortName: telegramShortNameSchema,
});

export const updateTelegramPackSchema = z.object({
  packId: packIdSchema,
});
