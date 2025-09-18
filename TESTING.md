# AIVA Quality Check Scripts

This project now includes helper scripts that wrap the most important health checks for the frontend and backend. They live in the `scripts/` directory at the repository root and can be combined or executed individually depending on the focus of your work.

## Available scripts

| Script | Description |
| --- | --- |
| `scripts/run_frontend_checks.sh` | Installs missing npm dependencies (if `node_modules/` is absent), then runs `npm run lint` and `npm run build` for the Vite frontend. |
| `scripts/run_backend_checks.sh` | Compiles the FastAPI source files to verify Python syntax and, when pytest is available with a `tests/` folder, runs the backend test suite. |
| `scripts/run_all_checks.sh` | Convenience wrapper that executes both the frontend and backend scripts sequentially. |

All scripts exit on the first failure so CI pipelines can rely on their return codes.

## Usage

From the repository root:

```bash
# Run frontend checks only
./scripts/run_frontend_checks.sh

# Run backend checks only
./scripts/run_backend_checks.sh

# Run the complete quality gate
./scripts/run_all_checks.sh
```

### Backend dependencies

The backend script looks for a virtual environment in `aiva-backend/.venv`. If you manage dependencies elsewhere, export `SKIP_BACKEND_INSTALL=1` before running the script to silence the reminder message.

### Custom pytest suite

If you add tests under `aiva-backend/tests/`, `run_backend_checks.sh` will automatically execute them (assuming `pytest` is on the PATH). This keeps the automation flexible as the backend evolves.
