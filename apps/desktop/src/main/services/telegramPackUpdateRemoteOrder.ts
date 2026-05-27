import type { TelegramPackMutationServiceOptions, StickerSticker } from "./telegramPackMutationTypes";
import type { TelegramRemoteSticker, TelegramRemoteStickerSet } from "./telegramTdlibService";

async function moveRemoteStickerToPosition(
  options: TelegramPackMutationServiceOptions,
  remoteStickers: TelegramRemoteSticker[],
  stickerId: string,
  targetIndex: number,
) {
  const currentIndex = remoteStickers.findIndex(
    (sticker) => sticker.stickerId === stickerId,
  );
  if (currentIndex === -1 || currentIndex === targetIndex) {
    return;
  }

  const movedSticker = remoteStickers[currentIndex];
  if (!movedSticker?.fileId) {
    throw new Error(
      `Telegram sticker ${stickerId} cannot be reordered because its remote file id is missing.`,
    );
  }

  await options.auth.tdlibService.setStickerPositionInSet({
    fileId: movedSticker.fileId,
    position: targetIndex,
  });

  remoteStickers.splice(currentIndex, 1);
  remoteStickers.splice(targetIndex, 0, movedSticker);
}

export async function reorderExistingRemoteStickerStickers(
  options: TelegramPackMutationServiceOptions,
  remoteSet: TelegramRemoteStickerSet,
  stickerStickers: StickerSticker[],
) {
  const remoteStickers = remoteSet.stickers.slice();
  const desiredRemoteStickerIds = stickerStickers
    .filter((sticker) => sticker.telegram)
    .map((sticker) => sticker.telegram!.stickerId);

  let nextPosition = 0;
  for (const stickerId of desiredRemoteStickerIds) {
    const currentIndex = remoteStickers.findIndex(
      (sticker) => sticker.stickerId === stickerId,
    );
    if (currentIndex === -1) {
      continue;
    }

    await moveRemoteStickerToPosition(
      options,
      remoteStickers,
      stickerId,
      nextPosition,
    );
    nextPosition += 1;
  }
}

export async function reorderAddedRemoteStickerStickers(
  options: TelegramPackMutationServiceOptions,
  remoteSet: TelegramRemoteStickerSet,
  stickerStickers: StickerSticker[],
  addedStickerIds: ReadonlySet<string>,
) {
  const addedStickers = stickerStickers.filter((sticker) => addedStickerIds.has(sticker.id));
  if (addedStickers.length === 0) {
    return;
  }

  const refreshedRemoteStickers = remoteSet.stickers.slice();
  const existingRemoteStickerIds = new Set(
    stickerStickers
      .filter((sticker) => sticker.telegram)
      .map((sticker) => sticker.telegram!.stickerId),
  );
  const unmatchedRemoteStickers = refreshedRemoteStickers.filter(
    (sticker) => !existingRemoteStickerIds.has(sticker.stickerId),
  );
  const addedRemoteStickers = unmatchedRemoteStickers.slice(-addedStickers.length);

  if (addedRemoteStickers.length < addedStickers.length) {
    return;
  }

  const addedStickerByStickerId = new Map(
    addedStickers.map((sticker, index) => [sticker.id, addedRemoteStickers[index]!]),
  );

  for (const [targetIndex, sticker] of stickerStickers.entries()) {
    const addedRemoteSticker = addedStickerByStickerId.get(sticker.id);
    if (!addedRemoteSticker) {
      continue;
    }

    await moveRemoteStickerToPosition(
      options,
      refreshedRemoteStickers,
      addedRemoteSticker.stickerId,
      targetIndex,
    );
  }
}
