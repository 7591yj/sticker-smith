import { z } from "zod";

import { supportedMediaKinds } from "./types";

const keycapEmojiPattern = /^[#*0-9]\uFE0F?\u20E3$/u;
const emojiSequencePattern =
  /^[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Component}\u200D\uFE0F]+$/u;

function isTelegramCompatibleEmoji(value: string) {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return false;
  }

  if (keycapEmojiPattern.test(trimmed)) {
    return true;
  }

  return (
    /[\p{Extended_Pictographic}\p{Regional_Indicator}]/u.test(trimmed) &&
    emojiSequencePattern.test(trimmed)
  );
}

export const packIdSchema = z.string().min(1);
export const assetIdSchema = z.string().min(1);
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
export const telegramRequiredEmojiListSchema = emojiListSchema.min(1);
export const telegramShortNameSchema = z
  .string()
  .trim()
  .min(5)
  .max(64)
  .regex(/^[A-Za-z][A-Za-z0-9_]*$/);

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

export const renameManyAssetsSchema = z.object({
  packId: packIdSchema,
  assetIds: z.array(assetIdSchema).min(1),
  baseName: z.string().trim().min(1),
});

export const setAssetEmojisSchema = z.object({
  packId: packIdSchema,
  assetId: assetIdSchema,
  emojis: emojiListSchema,
});

export const setManyAssetEmojisSchema = z.object({
  packId: packIdSchema,
  assetIds: z.array(assetIdSchema).min(1),
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

export const deleteManyAssetsSchema = z.object({
  packId: packIdSchema,
  assetIds: z.array(assetIdSchema).min(1),
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

export const revealPackSourceFolderSchema = z.object({
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
