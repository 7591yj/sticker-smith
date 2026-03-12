# Changelog

All notable project releases are documented here.

## 0.1.1-beta.2 - 2026-03-12

- Fix AppImage conversion fallback so packaged builds resolve healthy host
  `ffmpeg` and `ffprobe` binaries instead of reusing broken bundled paths.
- Remove the backend's pre-conversion `ffprobe` dimension check so sticker
  conversion no longer fails on PNG and GIF inputs when probing is unavailable.
- Show a conversion failure dialog in the desktop app when background pack
  conversion finishes with one or more failed assets.

## 0.1.1-beta.1 - 2026-03-11

- Support larger `.webm` previews in the desktop app by serving media previews
  with byte-range responses.
- Unify the assets and outputs browsers with shared gallery/list layouts and a
  synced view toggle.
- Render a fallback pack icon in the sidebar when a pack has no generated
  thumbnail yet.

## 0.1.0-beta.3 - 2026-03-11

- Fix the packaged Electron renderer path so the AppImage loads `dist/index.html`
  from `app.asar`.

## 0.1.0-beta.2 - 2026-03-11

- Fix backend packaging in CI by tracking the PyInstaller spec file.
- Publish tagged builds as downloadable GitHub Release assets.
- Write packaged desktop artifacts to `apps/desktop/release`.

## 0.1.0-beta.1 - 2026-03-11

First beta release of Sticker Smith.

- Add the Electron desktop app for assembling Telegram sticker packs from local
  assets.
- Add the shared bridge, types, and schema package used across the desktop app.
- Bundle the Python WebM conversion backend for development and packaged desktop
  builds.
