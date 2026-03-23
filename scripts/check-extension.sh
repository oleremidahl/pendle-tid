#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "Checking JavaScript syntax..."
for file in background.js content.js options.js; do
  node --check "$file"
done

echo "Validating manifest and referenced assets..."
python3 - <<'PY'
import json
import re
import sys
from pathlib import Path

root = Path(".")
manifest_path = root / "manifest.json"
manifest = json.loads(manifest_path.read_text())

errors = []

if manifest.get("manifest_version") != 3:
    errors.append("manifest_version must be 3.")

version = str(manifest.get("version", "")).strip()
if not re.fullmatch(r"\d+\.\d+\.\d+", version):
    errors.append("version must use x.y.z format.")

for key in ("name", "description", "homepage_url"):
    if not str(manifest.get(key, "")).strip():
        errors.append(f"{key} must be present.")

background_worker = manifest.get("background", {}).get("service_worker")
if not background_worker:
    errors.append("background.service_worker must be configured.")
elif not (root / background_worker).exists():
    errors.append(f"Missing background service worker: {background_worker}")

for key in ("icons",):
    values = manifest.get(key, {})
    if not values:
        errors.append(f"{key} must be configured.")
    for asset in values.values():
        if not (root / asset).exists():
            errors.append(f"Missing icon asset referenced in manifest: {asset}")

content_scripts = manifest.get("content_scripts", [])
if not content_scripts:
    errors.append("At least one content script definition is required.")

for entry in content_scripts:
    for asset in entry.get("js", []):
        if not (root / asset).exists():
            errors.append(f"Missing content script JS asset: {asset}")
    for asset in entry.get("css", []):
        if not (root / asset).exists():
            errors.append(f"Missing content script CSS asset: {asset}")

options_page = manifest.get("options_page")
if not options_page:
    errors.append("options_page must be configured.")
elif not (root / options_page).exists():
    errors.append(f"Missing options page asset: {options_page}")

required_runtime_files = [
    "manifest.json",
    "background.js",
    "content.css",
    "content.js",
    "options.css",
    "options.html",
    "options.js",
]

for asset in required_runtime_files:
    if not (root / asset).exists():
        errors.append(f"Missing required runtime file: {asset}")

if errors:
    for error in errors:
        print(error, file=sys.stderr)
    raise SystemExit(1)
PY

echo "Packaging extension..."
./scripts/package-extension.sh

VERSION="$(python3 - <<'PY'
import json
from pathlib import Path

manifest = json.loads(Path("manifest.json").read_text())
print(manifest["version"])
PY
)"

ZIP_PATH="dist/finn-pendle-tid-webstore-v${VERSION}.zip"
CHECKSUM_PATH="${ZIP_PATH}.sha256"

if [[ ! -f "$ZIP_PATH" ]]; then
  echo "Expected package missing: $ZIP_PATH" >&2
  exit 1
fi

if [[ ! -f "$CHECKSUM_PATH" ]]; then
  echo "Expected checksum missing: $CHECKSUM_PATH" >&2
  exit 1
fi

echo "Verifying packaged archive contents..."
archive_entries="$(unzip -Z1 "$ZIP_PATH" | LC_ALL=C sort)"
expected_entries="$(
  {
    printf '%s\n' \
      manifest.json \
      background.js \
      content.css \
      content.js \
      icons/ \
      options.css \
      options.html \
      options.js
    find icons -type f -print
  } | LC_ALL=C sort
)"

if [[ "$archive_entries" != "$expected_entries" ]]; then
  echo "Packaged archive contents differ from the expected runtime file set." >&2
  echo "Expected:" >&2
  printf '%s\n' "$expected_entries" | sed 's/^/  /' >&2
  echo "Actual:" >&2
  printf '%s\n' "$archive_entries" | sed 's/^/  /' >&2
  exit 1
fi

echo "All checks passed."
