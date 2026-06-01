export function packPublishTooltip(telegramConnected: boolean) {
  return telegramConnected
    ? "Publish this local pack as a Telegram video sticker set"
    : "Connect Telegram before uploading";
}

export function packMirrorTooltip(
  telegramUnsupported: boolean,
  unsupportedTelegramTooltip: string | null,
  telegramMirrorBusy: boolean,
) {
  if (telegramUnsupported) return unsupportedTelegramTooltip;
  if (telegramMirrorBusy) return "Telegram is already syncing this mirror";
  return "Push local mirror changes to Telegram";
}

export function packMediaTooltip(
  telegramUnsupported: boolean,
  unsupportedTelegramTooltip: string | null,
  telegramMirrorBusy: boolean,
  telegramMediaBusy: boolean,
) {
  if (telegramUnsupported) return unsupportedTelegramTooltip;
  if (telegramMirrorBusy || telegramMediaBusy) {
    return "Telegram media download is already in progress for this mirror";
  }
  return "Download missing Telegram sticker media for this mirror";
}
