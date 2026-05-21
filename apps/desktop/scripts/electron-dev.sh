#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
case "$(uname -s)" in
  Darwin)
    ELECTRON_BIN="$APP_DIR/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
    ;;
  *)
    ELECTRON_BIN="$APP_DIR/node_modules/electron/dist/electron"
    ;;
esac

if [[ ! -x "$ELECTRON_BIN" ]]; then
  echo "Electron binary not found at $ELECTRON_BIN" >&2
  echo "Run 'bun install' before starting dev mode." >&2
  exit 1
fi

unset ELECTRON_RUN_AS_NODE

if command -v steam-run >/dev/null 2>&1; then
  exec steam-run "$ELECTRON_BIN" "$@"
else
  exec "$ELECTRON_BIN" "$@"
fi
