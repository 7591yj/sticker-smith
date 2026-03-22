export const APP_SERVICE_NAME = "Sticker Smith";
export const TELEGRAM_ACCOUNT_KEY = "default";

export const GUI_API_BINARY =
  process.platform === "win32" ? "gui-api.exe" : "gui-api";
export const FFMPEG_BINARY =
  process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
export const FFPROBE_BINARY =
  process.platform === "win32" ? "ffprobe.exe" : "ffprobe";

export const COMMAND_HEALTH_CHECK_TIMEOUT_MS = 5_000;

export const FULL_FILE_DOWNLOAD_LIMIT = 1_000_000_000;
export const OWNED_STICKER_SETS_PAGE_SIZE = 100;

export const PREVIEW_PROTOCOL = "stickersmith-media";
export const PREVIEW_MIME_TYPES: Readonly<Record<string, string>> = {
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".tiff": "image/tiff",
  ".tif": "image/tiff",
  ".webm": "video/webm",
  ".webp": "image/webp",
};
