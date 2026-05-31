import type { StickerPackDetails } from "@sticker-smith/shared";

import { collectTelegramStickerSignatures } from "../stickerSignatures";
import type { StickerSticker } from "./mutationTypes";
import { pathExists } from "../../../utils/fsUtils";
import { findSticker } from "../../../utils/stickerQueries";

export function getStickerStickers(details: StickerPackDetails) {
  return details.stickers
    .filter((sticker) => {
      if (sticker.id === details.pack.iconStickerId) {
        return false;
      }

      if (sticker.telegram) {
        return true;
      }

      return (
        sticker.emojiList.length > 0 ||
        findSticker(details.stickers, sticker.id) !== undefined
      );
    })
    .sort(
      (left, right) => left.order - right.order || left.id.localeCompare(right.id),
    );
}

export function getIconSticker(details: StickerPackDetails) {
  return details.pack.iconStickerId
    ? findSticker(details.stickers, details.pack.iconStickerId) ?? null
    : null;
}

export async function ensureStickerFileExists(
  absolutePath: string,
  description: string,
) {
  if (!(await pathExists(absolutePath))) {
    throw new Error(`${description} is missing at ${absolutePath}.`);
  }
}

export function assertStickerHasEmojis(
  sticker: { emojiList: readonly string[]; relativePath: string },
  context: string,
) {
  if (sticker.emojiList.length === 0) {
    throw new Error(
      `Every sticker must have at least one emoji before ${context}. Missing emoji for ${sticker.relativePath}.`,
    );
  }
}

export async function validateTelegramPackStickers(
  details: StickerPackDetails,
  options: { operation: "upload" | "update"; requireIconSticker: boolean },
) {
  const stickerStickers = getStickerStickers(details);
  const mismatchMessage = `Pack stickers are out of sync. Refresh the pack or add the missing stickers again before Telegram ${options.operation}.`;

  for (const sticker of stickerStickers) {
    const matchingSticker = findSticker(details.stickers, sticker.id);
    if (!matchingSticker) {
      if (options.operation === "upload") {
        throw new Error(
          `Sticker file for ${sticker.relativePath} is missing. Add the sticker again before Telegram upload.`,
        );
      }

      throw new Error(
        `Sticker file for ${sticker.relativePath} is missing. Add the sticker again before Telegram update.`,
      );
    }
  }

  const iconSticker = getIconSticker(details);
  if (iconSticker) {
    if (details.pack.iconStickerId === null || iconSticker.id !== details.pack.iconStickerId) {
      throw new Error(mismatchMessage);
    }
  } else if (options.requireIconSticker && details.pack.iconStickerId !== null) {
    throw new Error(
      `The selected icon file is missing. Choose the icon again before Telegram ${options.operation}.`,
    );
  }
}

export function getDuplicateLocalStickerStickerIds(details: StickerPackDetails) {
  const stickerStickers = getStickerStickers(details);
  const remoteSignatures = getRemoteStickerSignatures(details, stickerStickers);

  return new Set(
    stickerStickers
      .filter((sticker) => isDuplicateLocalSticker(details, sticker, remoteSignatures))
      .map((sticker) => sticker.id),
  );
}

function getRemoteStickerSignatures(
  details: StickerPackDetails,
  stickerStickers: readonly StickerSticker[],
) {
  const remoteSignatures = new Set<string>();

  for (const sticker of stickerStickers) {
    if (!sticker.telegram) {
      continue;
    }

    const telegramSticker = sticker as StickerSticker & {
      telegram: NonNullable<StickerSticker["telegram"]>;
    };
    for (const signature of collectExistingRemoteStickerSignatures(
      details,
      telegramSticker,
    )) {
      remoteSignatures.add(signature);
    }
  }

  return remoteSignatures;
}

function collectExistingRemoteStickerSignatures(
  details: StickerPackDetails,
  sticker: StickerSticker & { telegram: NonNullable<StickerSticker["telegram"]> },
) {
  const output = findSticker(details.stickers, sticker.id);
  return collectTelegramStickerSignatures({
    emojis: sticker.emojiList,
    sha256Values: [
      sticker.telegram.baselineStickerHash ?? null,
      output?.sha256 ?? null,
    ],
  }).filter(Boolean);
}

function isDuplicateLocalSticker(
  details: StickerPackDetails,
  sticker: StickerSticker,
  remoteSignatures: ReadonlySet<string>,
) {
  if (sticker.telegram) {
    return false;
  }

  return collectLocalStickerSignatures(details, sticker).some((signature) =>
    remoteSignatures.has(signature),
  );
}

function collectLocalStickerSignatures(
  details: StickerPackDetails,
  sticker: StickerSticker,
) {
  const output = findSticker(details.stickers, sticker.id);
  return collectTelegramStickerSignatures({
    emojis: sticker.emojiList,
    sha256Values: [output?.sha256 ?? null],
  });
}
