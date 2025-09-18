#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/aiva-backend"

if [ -f "$BACKEND_DIR/requirements.txt" ]; then
  if [ -z "${SKIP_BACKEND_INSTALL:-}" ] && [ ! -d "$BACKEND_DIR/.venv" ]; then
    echo "[run_backend_checks] Backend dependencies not installed (no .venv directory detected)."
    echo "[run_backend_checks] Install dependencies manually or export SKIP_BACKEND_INSTALL=1 to bypass this message."
  fi
fi

echo "[run_backend_checks] Verifying Python modules compile..."
python -m compileall "$BACKEND_DIR/app.py" "$BACKEND_DIR/ai_service.py" \
  "$BACKEND_DIR/speech_service.py" "$BACKEND_DIR/tts_service.py"

if command -v pytest >/dev/null 2>&1; then
  if [ -d "$BACKEND_DIR/tests" ]; then
    echo "[run_backend_checks] Running pytest suite..."
    (cd "$BACKEND_DIR" && pytest -q)
  else
    echo "[run_backend_checks] No pytest suite detected (skipping)."
  fi
else
  echo "[run_backend_checks] Pytest not installed; skipping test execution."
fi
