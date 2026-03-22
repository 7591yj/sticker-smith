export const env = {
  get STICKER_SMITH_ROOT() { return process.env.STICKER_SMITH_ROOT; },
  get STICKER_SMITH_BACKEND_DIR() { return process.env.STICKER_SMITH_BACKEND_DIR; },
  get STICKER_SMITH_FFMPEG() { return process.env.STICKER_SMITH_FFMPEG; },
  get STICKER_SMITH_FFPROBE() { return process.env.STICKER_SMITH_FFPROBE; },
  get STICKER_SMITH_PYTHONPATH() { return process.env.STICKER_SMITH_PYTHONPATH; },
  get PYTHON() { return process.env.PYTHON; },
  get VITE_DEV_SERVER_URL() { return process.env.VITE_DEV_SERVER_URL; },
  get APPDIR() { return process.env.APPDIR; },
  get PATH() { return process.env.PATH; },
};
