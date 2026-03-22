import type { ConversionMode } from "@sticker-smith/shared";

interface StickerOutputLike {
  sourceAssetId: string;
  mode: ConversionMode;
}

export function findStickerOutput<T extends StickerOutputLike>(
  outputs: readonly T[],
  assetId: string,
) {
  return outputs.find(
    (output) => output.sourceAssetId === assetId && output.mode === "sticker",
  );
}
