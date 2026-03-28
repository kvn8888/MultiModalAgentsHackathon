"""
config.py — Central configuration for PermitPulse backend.

Loads environment variables from .env and exposes them as module-level constants.
Every external key or tunable lives here so the rest of the codebase never
reads os.environ directly.
"""

import os
from dotenv import load_dotenv

# Load .env file (no-op if missing — prod uses real env vars)
load_dotenv()

# ── LLM ──────────────────────────────────────────────────────────────────────
# Google Gemini API key consumed by Railtracks when creating a GeminiLLM instance.
GEMINI_API_KEY: str = os.getenv("GOOGLE_API_KEY", "")

# ── Senso.ai ─────────────────────────────────────────────────────────────────
# API key for the Senso CLI (ingest + search).  Must be set before calling
# `senso` commands.
SENSO_API_KEY: str = os.getenv("SENSO_API_KEY", "")

# ── DataSF / Socrata ─────────────────────────────────────────────────────────
# Base URL for all Socrata SODA 2.x endpoints.
DATASF_BASE_URL: str = "https://data.sfgov.org/resource"

# Optional app token — unauthenticated requests are throttled to ≈1 000 req/hr,
# authenticated ones get ~10 000 req/hr.
DATASF_APP_TOKEN: str = os.getenv("DATASF_APP_TOKEN", "")

# Dataset IDs for each DataSF table we query.
DATASET_PERMITS: str = "i98e-djp9"        # Building Permits
DATASET_CONTACTS: str = "3mwf-svbh"       # Permit Contacts
DATASET_COMPLAINTS: str = "gm2e-bten"     # DBI Complaints
DATASET_VIOLATIONS: str = "nbtm-fbw5"     # Notices of Violation
DATASET_ADDENDA: str = "87xy-gk8d"        # Permit Addenda / Routing

# ── Server ───────────────────────────────────────────────────────────────────
# Port for uvicorn (can be overridden via env).
PORT: int = int(os.getenv("PORT", "8000"))

# Allowed CORS origins — comma-separated.  Default allows local dev frontends.
CORS_ORIGINS: list[str] = os.getenv(
    "CORS_ORIGINS", "http://localhost:3000,http://localhost:5173"
).split(",")
