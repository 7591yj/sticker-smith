# Sticker Smith

Sticker Smith is an Electron desktop app for building Telegram sticker packs from local image and video assets and converting them to WebM.

## Workspace

- `apps/desktop`: Electron app, renderer, preload bridge, and packaging config
- `packages/shared`: shared types and Zod schemas used by the desktop app
- `tg-webm-converter`: Python conversion backend bundled into packaged builds

## Requirements

Use `devenv shell` on Nix.

Outside Nix, install:

- `bun`
- `node`
- `python3`
- `poetry`
- `ffmpeg`
- `ffprobe`

Packaged desktop builds bundle the backend plus `ffmpeg` and `ffprobe`. Development mode prefers the bundled backend in `tg-webm-converter/dist/backend` and falls back to Python source mode if that bundle is missing.

## Common Commands

- `devenv shell`
- `bun install`
- `bun run dev`
- `bun run build`
- `bun run test`
- `bun run lint`
- `bun run package:backend`
- `bun run package:linux`

## Development Notes

The desktop app persists data under:

- Linux: `~/.local/share/StickerSmith`
- macOS: `~/Library/Application Support/StickerSmith`
- Windows: `%APPDATA%/StickerSmith`

Pack data layout:

- Source assets live under `packs/<slug>-<uuid>/source`
- Converted outputs live under `packs/<slug>-<uuid>/webm`
- `pack.json` is the source of truth for each pack

## Architecture

- `apps/desktop/src/main`: Electron main process, IPC handlers, filesystem services, converter orchestration
- `apps/desktop/src/preload`: `window.stickerSmith` bridge exposed to the renderer
- `apps/desktop/src/renderer`: React UI
- `packages/shared/src/bridge.ts`: preload contract
- `packages/shared/src/types.ts`: shared domain types
- `packages/shared/src/schema.ts`: IPC validation schemas

## Backend Behavior

- Development mode prefers `tg-webm-converter/dist/backend/gui-api`
- Packaged builds use the bundled backend from Electron resources
- The backend reads a JSON job from stdin and emits newline-delimited JSON events on stdout
- Conversion completion updates pack metadata through `LibraryService`
