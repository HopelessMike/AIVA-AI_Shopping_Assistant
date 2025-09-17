"""Serverless entrypoint for Vercel deployment.

This module exposes the FastAPI ``app`` object defined in :mod:`app` so that
Vercel's Python runtime can import it as an ASGI handler.
"""

from app import app  # noqa: F401
