#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ELECTRON_BIN="$APP_DIR/node_modules/electron/dist/electron"

if [[ ! -x "$ELECTRON_BIN" ]]; then
  echo "Electron binary not found at $ELECTRON_BIN" >&2
  echo "Run 'bun install' before starting dev mode." >&2
  exit 1
fi

unset ELECTRON_RUN_AS_NODE

exec steam-run "$ELECTRON_BIN" "$@"
