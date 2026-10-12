#!/usr/bin/env bash
# Build the Linux one-file binary locally (same steps as
# .github/workflows/linux-build.yml).
#
#   bash tools/build_linux.sh            # build (deps installed first time)
#   LEMPO_SKIP_DEPS=1 bash tools/build_linux.sh
#
# Needs: python3.10+ (3.14 recommended), g++, node/npm.
# Output: dist/LempoParticleEditor + LempoParticleEditor-linux-x86_64.tar.gz
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -z "${LEMPO_SKIP_DEPS:-}" ]]; then
  python3 -m pip install --user dearpygui glfw pillow pyinstaller
  [[ -d node_modules ]] || npm ci
fi

echo "+ core build"
python3 core/build_core.py

echo "+ pyinstaller"
python3 -m PyInstaller --noconfirm packaging/LempoParticleEditor.spec

OUT=dist/LempoParticleEditor
TARBALL=LempoParticleEditor-linux-x86_64.tar.gz
[[ -f "$OUT" ]] || { echo "missing $OUT"; exit 1; }
tar -C dist -czf "$TARBALL" LempoParticleEditor
ls -lh "$OUT" "$TARBALL"

# optional smoke boot (requires a display or xvfb-run)
if [[ -z "${LEMPO_SKIP_SMOKE:-}" ]] && command -v xvfb-run >/dev/null 2>&1; then
  echo "+ smoke boot under xvfb"
  xvfb-run -a "$OUT" &
  APP_PID=$!
  sleep 12
  if kill -0 "$APP_PID" 2>/dev/null; then
    echo "smoke boot alive after 12s"
    kill "$APP_PID" || true
  else
    echo "smoke FAILED: process exited early"
    exit 1
  fi
fi
echo "LINUX-BUILD-OK"
