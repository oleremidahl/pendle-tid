#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="$REPO_ROOT/dist"
cd "$REPO_ROOT"

VERSION="$(python3 - <<'PY'
import json
from pathlib import Path

manifest = json.loads(Path("manifest.json").read_text())
print(manifest["version"])
PY
)"
ZIP_NAME="finn-pendle-tid-webstore-v${VERSION}.zip"
ZIP_PATH="$DIST_DIR/$ZIP_NAME"
CHECKSUM_PATH="$ZIP_PATH.sha256"
FILES=(
  manifest.json
  background.js
  content.css
  content.js
  options.css
  options.html
  options.js
  icons
)

mkdir -p "$DIST_DIR"
rm -f "$ZIP_PATH" "$CHECKSUM_PATH"

zip -qr "$ZIP_PATH" "${FILES[@]}"

shasum -a 256 "$ZIP_PATH" > "$CHECKSUM_PATH"

echo "Created package:"
echo "  $ZIP_PATH"
echo "Checksum:"
echo "  $CHECKSUM_PATH"
