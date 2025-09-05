#!/usr/bin/env python
"""
AIVA Backend Server Startup Script
Run with: python run.py
"""

from __future__ import annotations

import os
import sys
import logging
from importlib.metadata import version, PackageNotFoundError  # stdlib: Py3.8+

# -----------------------------------------------------------------------------
# Logging
# -----------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("AIVA.Server")

# -----------------------------------------------------------------------------
# Dependency checks (by distribution name, not import module)
# -----------------------------------------------------------------------------
REQUIRED_DISTS: list[str] = [
    "fastapi",
    "uvicorn",
    "pydantic",
    "httpx",
    "python-dotenv",
]


def missing_distributions(required: list[str]) -> list[str]:
    """Return the list of distribution names that are NOT installed."""
    missing: list[str] = []
    for dist in required:
        try:
            version(dist)  # raises PackageNotFoundError if not installed
        except PackageNotFoundError:
            missing.append(dist)
    return missing


# -----------------------------------------------------------------------------
# Env loading (optional if python-dotenv is available)
# -----------------------------------------------------------------------------
def load_env() -> None:
    """
    Load variables from a .env file if python-dotenv is installed.

    Distribution name: 'python-dotenv'  → Import package: 'dotenv'
    """
    try:
        from dotenv import load_dotenv  # type: ignore
    except Exception as e:
        # Keep running even if python-dotenv isn't present (use system env)
        logger.warning("⚠️  python-dotenv not available: %s", e)
        return

    load_dotenv()


# -----------------------------------------------------------------------------
# Diagnostics
# -----------------------------------------------------------------------------
def check_environment() -> None:
    """Check and display environment configuration."""
    logger.info("=" * 60)
    logger.info("AIVA E-commerce Voice Assistant Backend")
    logger.info("=" * 60)

    # OpenAI config (optional)
    if os.getenv("OPENAI_API_KEY"):
        logger.info("✅ OpenAI API Key configured")
        logger.info("   Model: %s", os.getenv("OPENAI_MODEL", "gpt-4o-mini"))
    else:
        logger.warning("⚠️  OpenAI API Key not configured")
        logger.warning("   Using fallback mode with limited functionality")
        logger.info("   Set OPENAI_API_KEY in .env for full AI capabilities")

    # CORS
    cors_origins = os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:5173,http://localhost:3000",
    )
    logger.info("📡 CORS Origins: %s", cors_origins)

    # Rate limiting
    logger.info("🛡️  Rate Limiting: %s req/min", os.getenv("MAX_REQUESTS_PER_MINUTE", 60))
    logger.info("🤖 AI Rate Limit: %s req/min", os.getenv("MAX_AI_REQUESTS_PER_MINUTE", 10))

    logger.info("=" * 60)


# -----------------------------------------------------------------------------
# Entry point
# -----------------------------------------------------------------------------
def main() -> None:
    # 1) Check required distributions (by PyPI name)
    missing = missing_distributions(REQUIRED_DISTS)
    if missing:
        logger.error("Missing required packages: %s", ", ".join(missing))
        logger.info("Please run: pip install -r requirements.txt")
        sys.exit(1)

    # 2) Load .env if available
    load_env()

    # 3) Print environment diagnostics
    check_environment()

    # 4) Start server (import uvicorn AFTER deps check)
    import uvicorn  # type: ignore

    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    reload = os.getenv("RELOAD", "true").lower() == "true"
    log_level = os.getenv("LOG_LEVEL", "info")

    logger.info("🚀 Starting server on http://%s:%s", host, port)
    logger.info("📚 API Documentation: http://%s:%s/api/docs", host, port)
    logger.info("📊 Alternative Docs: http://%s:%s/api/redoc", host, port)
    logger.info("Press CTRL+C to stop")
    logger.info("=" * 60)

    try:
        uvicorn.run(
            "app:app",
            host=host,
            port=port,
            reload=reload,
            log_level=log_level,
            access_log=True,
        )
    except KeyboardInterrupt:
        logger.info("\n👋 Shutting down server...")
        sys.exit(0)
    except Exception as e:
        logger.error("❌ Server error: %s", e)
        sys.exit(1)


if __name__ == "__main__":
    main()
