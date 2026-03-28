"""
tools/senso.py — Senso.ai knowledge-base integration.

Provides two capabilities:
  1. **Ingest** — Convert permit / violation records into Senso documents
     via the `senso` CLI (`senso kb create-raw`).
  2. **Search** — Query the Senso knowledge base for previously ingested
     records via `senso search context`.

The Senso CLI must be installed globally (`npm install -g @senso-ai/cli`)
and `SENSO_API_KEY` must be set in the environment.

We shell out to the `senso` CLI rather than calling the REST API directly
because the shipables skills document CLI usage and handle auth, retries,
and output formatting for us.
"""

import asyncio
import json
import os
import shutil
from config import SENSO_API_KEY


# ── Helpers ──────────────────────────────────────────────────────────────────

async def _run_senso_cmd(args: list[str]) -> dict | list:
    """
    Run a `senso` CLI command and return parsed JSON output.

    Every command gets `--output json --quiet` appended (per the senso-search
    and senso-ingest skill docs).

    Args:
        args: List of CLI arguments *after* "senso" — e.g. ["search", "context", "my query"].

    Returns:
        Parsed JSON (dict or list) from the CLI stdout.

    Raises:
        RuntimeError: If the CLI exits with a non-zero code.
    """
    if not SENSO_API_KEY:
        raise RuntimeError("SENSO_API_KEY is not set")

    if shutil.which("senso"):
        base_cmd = ["senso"]
    elif shutil.which("npx"):
        # Local dev often has the CLI available through npx even when the
        # global `senso` binary is not installed.
        base_cmd = ["npx", "@senso-ai/cli"]
    else:
        raise RuntimeError(
            "Senso CLI not found. Install @senso-ai/cli or provide npx in PATH."
        )

    cmd = base_cmd + ["--api-key", SENSO_API_KEY] + args + ["--output", "json", "--quiet"]

    # Pass through the environment as-is so local config and CI secrets still work.
    env = os.environ.copy()
    env["SENSO_API_KEY"] = SENSO_API_KEY

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=env,
    )
    stdout, stderr = await proc.communicate()

    if proc.returncode != 0:
        err_msg = stderr.decode().strip() or stdout.decode().strip()
        raise RuntimeError(f"senso CLI error (exit {proc.returncode}): {err_msg}")

    return json.loads(stdout.decode())


# ── Normalization ────────────────────────────────────────────────────────────

def permit_to_senso_doc(permit: dict) -> dict:
    """
    Convert a raw DataSF permit record into a Senso document payload.

    The output dict has `title`, `text` and is ready to be passed to
    `senso kb create-raw --data '...' `.

    Args:
        permit: A single permit row from the Socrata API.

    Returns:
        Dict with "title" and "text" fields for Senso ingestion.
    """
    # Build a human-readable address string
    address = (
        f"{permit.get('street_number', '')} "
        f"{permit.get('street_name', '')} "
        f"{permit.get('street_suffix', '')}"
    ).strip()

    title = f"Permit {permit.get('permit_number', 'UNKNOWN')} — {address}"

    text = f"""Building Permit {permit.get('permit_number', 'UNKNOWN')}
Address: {address}, San Francisco {permit.get('zipcode', '')}
Parcel: Block {permit.get('block', '?')}, Lot {permit.get('lot', '?')}
Type: {permit.get('permit_type_definition', 'Unknown')}
Status: {permit.get('status', 'Unknown')}
Filed: {permit.get('filed_date', 'N/A')}
Issued: {permit.get('issued_date', 'N/A')}
Completed: {permit.get('completed_date', 'N/A')}
Estimated Cost: ${permit.get('estimated_cost', 'N/A')}
Existing Use: {permit.get('existing_use', 'N/A')}
Proposed Use: {permit.get('proposed_use', 'N/A')}
Units: {permit.get('existing_units', '?')} existing → {permit.get('proposed_units', '?')} proposed
Neighborhood: {permit.get('neighborhoods_analysis_boundaries', 'Unknown')}
Supervisor District: {permit.get('supervisor_district', '?')}
Description: {permit.get('description', 'No description')}"""

    return {"title": title, "text": text}


def violation_to_senso_doc(violation: dict) -> dict:
    """
    Convert a raw DataSF violation/complaint record into a Senso document.

    Args:
        violation: A single violation or complaint row from Socrata.

    Returns:
        Dict with "title" and "text" fields for Senso ingestion.
    """
    address = (
        f"{violation.get('street_number', '')} "
        f"{violation.get('street_name', '')}"
    ).strip()

    complaint_num = violation.get("complaint_number", "UNKNOWN")
    title = f"Violation {complaint_num} — {address}"

    # Build flags section — highlight the most dangerous violations
    flags = []
    if violation.get("work_without_permit") in ("true", True, "1"):
        flags.append("⚠️ WORK WITHOUT PERMIT")
    if violation.get("expired_permit") in ("true", True, "1"):
        flags.append("⚠️ EXPIRED PERMIT")
    if violation.get("unsafe_building") in ("true", True, "1"):
        flags.append("🚨 UNSAFE BUILDING")
    flags_str = " | ".join(flags) if flags else "None"

    text = f"""DBI Violation / Complaint {complaint_num}
Address: {address}, San Francisco
Parcel: Block {violation.get('block', '?')}, Lot {violation.get('lot', '?')}
Status: {violation.get('status', 'Unknown')}
Date Filed: {violation.get('date_filed', 'N/A')}
Category: {violation.get('nov_category_description', 'N/A')}
Item: {violation.get('nov_item_description', 'N/A')}
Code Violation: {violation.get('code_violation_desc', 'N/A')}
Red Flags: {flags_str}
Neighborhood: {violation.get('neighborhoods_analysis_boundaries', 'Unknown')}
Supervisor District: {violation.get('supervisor_district', '?')}"""

    return {"title": title, "text": text}


# ── Ingest ───────────────────────────────────────────────────────────────────

async def ingest_document(doc: dict) -> dict:
    """
    Ingest a single document into Senso via `senso kb create-raw`.

    Args:
        doc: A dict with at least "title" and "text" keys.

    Returns:
        The Senso CLI response (includes content_id of the created item).
    """
    payload = json.dumps(doc)
    result = await _run_senso_cmd(["kb", "create-raw", "--data", payload])
    return result


async def ingest_permits(permits: list[dict]) -> list[dict]:
    """
    Normalize and ingest a batch of permit records into Senso.

    Args:
        permits: List of raw permit dicts from the DataSF API.

    Returns:
        List of Senso CLI responses (one per permit).
    """
    results = []
    for permit in permits:
        doc = permit_to_senso_doc(permit)
        try:
            result = await ingest_document(doc)
            results.append(result)
        except RuntimeError as e:
            # Log but don't crash — some records may fail (duplicates, etc.)
            results.append({"error": str(e), "permit_number": permit.get("permit_number")})
    return results


async def ingest_violations(violations: list[dict]) -> list[dict]:
    """
    Normalize and ingest a batch of violation records into Senso.

    Args:
        violations: List of raw violation dicts from the DataSF API.

    Returns:
        List of Senso CLI responses.
    """
    results = []
    for violation in violations:
        doc = violation_to_senso_doc(violation)
        try:
            result = await ingest_document(doc)
            results.append(result)
        except RuntimeError as e:
            results.append({"error": str(e), "complaint_number": violation.get("complaint_number")})
    return results


# ── Search ───────────────────────────────────────────────────────────────────

async def search_knowledge(query: str, max_results: int = 10) -> dict:
    """
    Search the Senso knowledge base for relevant permit/violation records.

    Uses `senso search context` to get raw chunks without an AI-generated
    answer — the Railtracks agent will synthesize the answer itself.

    Args:
        query:       Natural-language query (e.g. "violations near 450 Valencia St").
        max_results: Number of results to return (1–20).

    Returns:
        Dict with "results" list of matching chunks, each containing
        content_id, title, chunk_text, score.
    """
    result = await _run_senso_cmd([
        "search", "context", query,
        "--max-results", str(max_results),
    ])
    return result


async def search_full(query: str, max_results: int = 5) -> dict:
    """
    Full Senso search — returns an AI-generated answer plus source chunks.

    Use this when you want Senso to synthesize an answer from its knowledge.

    Args:
        query:       Natural-language query.
        max_results: Number of source chunks to return.

    Returns:
        Dict with "answer" (string) and "results" (list of chunks).
    """
    result = await _run_senso_cmd([
        "search", query,
        "--max-results", str(max_results),
    ])
    return result
