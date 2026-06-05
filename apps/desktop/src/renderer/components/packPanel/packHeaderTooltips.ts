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
  if (telegramMirrorBusy) return "Telegram is already updating this pack";
  return "Update this pack on Telegram";
}

export function packMediaTooltip(
  telegramUnsupported: boolean,
  unsupportedTelegramTooltip: string | null,
  telegramMirrorBusy: boolean,
  telegramMediaBusy: boolean,
) {
  if (telegramUnsupported) return unsupportedTelegramTooltip;
  if (telegramMirrorBusy || telegramMediaBusy) {
    return "Telegram files are already downloading for this pack";
  }
  return "Download missing Telegram sticker files for this pack";
}
