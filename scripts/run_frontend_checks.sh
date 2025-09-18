#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/aiva-frontend"

if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  echo "[run_frontend_checks] Installing frontend dependencies..."
  npm --prefix "$FRONTEND_DIR" install
fi

if find "$FRONTEND_DIR" -maxdepth 1 -name ".eslintrc*" | grep -q "."; then
  echo "[run_frontend_checks] Running ESLint..."
  npm --prefix "$FRONTEND_DIR" run lint
else
  echo "[run_frontend_checks] Skipping ESLint (no configuration file found)."
fi

echo "[run_frontend_checks] Building production bundle..."
npm --prefix "$FRONTEND_DIR" run build
