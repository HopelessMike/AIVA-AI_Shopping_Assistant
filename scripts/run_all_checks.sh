#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"$ROOT_DIR/scripts/run_frontend_checks.sh"
"$ROOT_DIR/scripts/run_backend_checks.sh"
