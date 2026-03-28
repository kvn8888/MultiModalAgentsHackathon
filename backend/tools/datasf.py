"""
tools/datasf.py — DataSF Socrata SODA API client.

Provides async functions to query SF building permits, complaints, violations,
contacts, and permit addenda from the DataSF open-data portal.  All functions
return raw JSON (list[dict]) from the Socrata API.

The Socrata SODA 2.x API uses SoQL — a SQL-like query language passed as
URL query parameters ($where, $select, $order, $limit, $offset, etc.).
Docs: https://dev.socrata.com/docs/queries/
"""

import httpx
from config import (
    DATASF_BASE_URL,
    DATASF_APP_TOKEN,
    DATASET_PERMITS,
    DATASET_CONTACTS,
    DATASET_COMPLAINTS,
    DATASET_VIOLATIONS,
    DATASET_ADDENDA,
)

# ── Shared HTTP client ───────────────────────────────────────────────────────
# Reuse a single async client for connection pooling.  Created lazily via
# get_client() so the event loop is available.
_client: httpx.AsyncClient | None = None


async def get_client() -> httpx.AsyncClient:
    """Return (and lazily create) the shared async HTTP client."""
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=30.0)
    return _client


# ── Internal helper ──────────────────────────────────────────────────────────

async def _query_socrata(dataset_id: str, params: dict) -> list[dict]:
    """
    Execute a Socrata SODA query and return the JSON response.

    Args:
        dataset_id: The 9-character Socrata dataset identifier (e.g. "i98e-djp9").
        params:     Dict of SoQL query parameters (keys like "$where", "$limit").

    Returns:
        A list of row dicts from the API.
    """
    client = await get_client()

    # Build the endpoint URL — e.g. https://data.sfgov.org/resource/i98e-djp9.json
    url = f"{DATASF_BASE_URL}/{dataset_id}.json"

    # If we have an app token, attach it as a header for higher rate limits
    headers = {}
    if DATASF_APP_TOKEN:
        headers["X-App-Token"] = DATASF_APP_TOKEN

    # Default to 200 rows unless the caller overrides $limit
    if "$limit" not in params:
        params["$limit"] = "200"

    response = await client.get(url, params=params, headers=headers)
    response.raise_for_status()
    return response.json()


# ── Public query functions ───────────────────────────────────────────────────

async def fetch_permits(where_clause: str = "", limit: int = 200) -> list[dict]:
    """
    Fetch building permits from DataSF.

    Args:
        where_clause: A SoQL $where expression — e.g.
                      "neighborhoods_analysis_boundaries='Mission' AND filed_date > '2025-01-01'"
                      Pass empty string to fetch the most recent permits.
        limit:        Max rows to return (default 200, max 50000).

    Returns:
        List of permit dicts with fields like permit_number, status, filed_date, etc.
    """
    params: dict = {
        "$limit": str(limit),
        "$order": "filed_date DESC",
    }
    if where_clause:
        params["$where"] = where_clause

    return await _query_socrata(DATASET_PERMITS, params)


async def fetch_permit_contacts(permit_number: str) -> list[dict]:
    """
    Fetch contractor / architect contacts for a specific permit.

    Args:
        permit_number: The permit number to look up (joins on permit_number).

    Returns:
        List of contact dicts with fields like contact_type, company_name, license_number.
    """
    params = {
        "$where": f"permit_number='{permit_number}'",
        "$limit": "50",
    }
    return await _query_socrata(DATASET_CONTACTS, params)


async def fetch_complaints(
    where_clause: str = "",
    block: str = "",
    lot: str = "",
    limit: int = 200,
) -> list[dict]:
    """
    Fetch DBI complaints from DataSF.

    You can filter by a SoQL where clause, or by block+lot parcel identifiers,
    or both.

    Args:
        where_clause: SoQL $where expression.
        block:        Parcel block number (4-digit string).
        lot:          Parcel lot number (3-digit string).
        limit:        Max rows.

    Returns:
        List of complaint dicts.
    """
    # Build the where clause by combining the explicit clause with block/lot filters
    conditions: list[str] = []
    if where_clause:
        conditions.append(where_clause)
    if block:
        conditions.append(f"block='{block}'")
    if lot:
        conditions.append(f"lot='{lot}'")

    params: dict = {
        "$limit": str(limit),
        "$order": "date_filed DESC",
    }
    if conditions:
        params["$where"] = " AND ".join(conditions)

    return await _query_socrata(DATASET_COMPLAINTS, params)


async def fetch_violations(
    complaint_number: str = "",
    block: str = "",
    lot: str = "",
    limit: int = 200,
) -> list[dict]:
    """
    Fetch Notices of Violation (NOVs) from DataSF.

    Can filter by complaint_number (join key to complaints) or by block/lot.

    Args:
        complaint_number: Link to a specific complaint.
        block:            Parcel block number.
        lot:              Parcel lot number.
        limit:            Max rows.

    Returns:
        List of violation dicts with fields like nov_category_description,
        work_without_permit, unsafe_building, etc.
    """
    conditions: list[str] = []
    if complaint_number:
        conditions.append(f"complaint_number='{complaint_number}'")
    if block:
        conditions.append(f"block='{block}'")
    if lot:
        conditions.append(f"lot='{lot}'")

    params: dict = {
        "$limit": str(limit),
        "$order": "date_filed DESC",
    }
    if conditions:
        params["$where"] = " AND ".join(conditions)

    return await _query_socrata(DATASET_VIOLATIONS, params)


async def fetch_permit_addenda(application_number: str) -> list[dict]:
    """
    Fetch permit routing / addenda records for a specific application.

    Shows which review stations a permit passed through and where it got stuck.

    Args:
        application_number: The application/permit number to look up.

    Returns:
        List of addenda dicts with station_name, station_status, dates.
    """
    params = {
        "$where": f"application_number='{application_number}'",
        "$limit": "100",
        "$order": "date_received DESC",
    }
    return await _query_socrata(DATASET_ADDENDA, params)


async def fetch_permits_by_address(
    street_number: str,
    street_name: str,
    limit: int = 50,
) -> list[dict]:
    """
    Look up permits by street address.

    Args:
        street_number: e.g. "123"
        street_name:   e.g. "MAIN" (Socrata stores uppercase)

    Returns:
        List of matching permit dicts.
    """
    where = f"street_number='{street_number}' AND upper(street_name) LIKE '%{street_name.upper()}%'"
    return await fetch_permits(where_clause=where, limit=limit)


async def fetch_permits_by_neighborhood(
    neighborhood: str,
    since_date: str = "",
    limit: int = 100,
) -> list[dict]:
    """
    Fetch permits in a specific SF neighborhood.

    Args:
        neighborhood: The neighborhood name as stored in DataSF
                      (e.g. "Mission", "SoMa", "Financial District/South Beach").
        since_date:   ISO date string to filter only recent permits (e.g. "2025-01-01").
        limit:        Max rows.

    Returns:
        List of permit dicts.
    """
    conditions = [f"neighborhoods_analysis_boundaries='{neighborhood}'"]
    if since_date:
        conditions.append(f"filed_date > '{since_date}'")
    where = " AND ".join(conditions)
    return await fetch_permits(where_clause=where, limit=limit)


async def fetch_permits_by_district(
    district: str,
    limit: int = 100,
) -> list[dict]:
    """
    Fetch permits in a specific supervisor district (1-11).

    Args:
        district: District number as a string (e.g. "6").
        limit:    Max rows.

    Returns:
        List of permit dicts.
    """
    where = f"supervisor_district='{district}'"
    return await fetch_permits(where_clause=where, limit=limit)
