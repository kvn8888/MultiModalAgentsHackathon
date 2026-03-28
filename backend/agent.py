"""
agent.py — Railtracks agent and flow definitions for PermitPulse.

Defines the PermitPulse agent as a Railtracks agent_node with tool_nodes
for fetching permits, violations, and searching the Senso knowledge base.
The agent is wired into a Flow that serves as the entry point for queries.

Railtracks pattern:
  - Tools are decorated with @rt.function_node and have full type hints + docstrings
  - Agents are created with rt.agent_node(name, tool_nodes, llm, system_message)
  - Flows wrap an agent as the entry point: rt.Flow(name, entry_point)
"""

import json
import railtracks as rt
from railtracks.llm import OpenAILLM
from config import OPENAI_API_KEY

# Import the actual data-fetching and knowledge functions
from tools import datasf, senso

# ── Make sure the OpenAI key is available to railtracks ──────────────────────
import os
os.environ["OPENAI_API_KEY"] = OPENAI_API_KEY


# ── Tool Nodes ───────────────────────────────────────────────────────────────
# Each tool is a @rt.function_node that the agent can call.  Railtracks
# requires type hints and docstrings for tool descriptions sent to the LLM.

@rt.function_node
async def tool_fetch_permits(query_params: str) -> str:
    """Fetch building permits from SF DataSF based on filter criteria.

    Args:
        query_params: JSON string with optional keys:
            - "where": SoQL WHERE clause (e.g. "status='issued' AND estimated_cost > 100000")
            - "address_number": street number (e.g. "123")
            - "address_street": street name (e.g. "Main")
            - "neighborhood": neighborhood name (e.g. "Mission")
            - "district": supervisor district number (e.g. "6")
            - "limit": max rows (default 50)

    Returns:
        JSON string with the fetched permits, plus a count summary.
    """
    params = json.loads(query_params)

    # Route to the appropriate fetcher based on what parameters were provided
    if params.get("address_number") and params.get("address_street"):
        permits = await datasf.fetch_permits_by_address(
            street_number=params["address_number"],
            street_name=params["address_street"],
            limit=params.get("limit", 50),
        )
    elif params.get("neighborhood"):
        permits = await datasf.fetch_permits_by_neighborhood(
            neighborhood=params["neighborhood"],
            since_date=params.get("since_date", ""),
            limit=params.get("limit", 100),
        )
    elif params.get("district"):
        permits = await datasf.fetch_permits_by_district(
            district=params["district"],
            limit=params.get("limit", 100),
        )
    else:
        permits = await datasf.fetch_permits(
            where_clause=params.get("where", ""),
            limit=params.get("limit", 50),
        )

    # Ingest the fetched permits into Senso (self-improvement loop)
    if permits:
        try:
            await senso.ingest_permits(permits)
        except Exception:
            pass  # Don't fail the query if ingestion fails

    return json.dumps({
        "count": len(permits),
        "permits": permits,
    })


@rt.function_node
async def tool_fetch_violations(query_params: str) -> str:
    """Fetch code violations and DBI complaints for a specific parcel or area.

    Args:
        query_params: JSON string with optional keys:
            - "block": parcel block number (e.g. "3512")
            - "lot": parcel lot number (e.g. "001")
            - "complaint_number": specific complaint to look up
            - "where": SoQL WHERE clause for complaints
            - "limit": max rows (default 50)

    Returns:
        JSON string with complaints and violations, plus red-flag summary.
    """
    params = json.loads(query_params)

    # Fetch complaints
    complaints = await datasf.fetch_complaints(
        where_clause=params.get("where", ""),
        block=params.get("block", ""),
        lot=params.get("lot", ""),
        limit=params.get("limit", 50),
    )

    # Fetch violations (NOVs) — either by complaint_number or block/lot
    violations = await datasf.fetch_violations(
        complaint_number=params.get("complaint_number", ""),
        block=params.get("block", ""),
        lot=params.get("lot", ""),
        limit=params.get("limit", 50),
    )

    # Ingest into Senso for knowledge base growth
    if violations:
        try:
            await senso.ingest_violations(violations)
        except Exception:
            pass

    # Summarize red flags for the agent
    red_flags = []
    for v in violations:
        if v.get("work_without_permit") in ("true", True, "1"):
            red_flags.append(f"Complaint {v.get('complaint_number')}: WORK WITHOUT PERMIT")
        if v.get("unsafe_building") in ("true", True, "1"):
            red_flags.append(f"Complaint {v.get('complaint_number')}: UNSAFE BUILDING")
        if v.get("expired_permit") in ("true", True, "1"):
            red_flags.append(f"Complaint {v.get('complaint_number')}: EXPIRED PERMIT")

    return json.dumps({
        "complaints_count": len(complaints),
        "violations_count": len(violations),
        "red_flags": red_flags,
        "complaints": complaints,
        "violations": violations,
    })


@rt.function_node
async def tool_search_knowledge(query: str) -> str:
    """Search the Senso knowledge base for previously ingested permit and violation data.

    Args:
        query: Natural-language search query (e.g. "permits near 450 Valencia St"
               or "unsafe building violations in Mission district").

    Returns:
        JSON string with matching knowledge base chunks including titles and text.
    """
    try:
        result = await senso.search_knowledge(query, max_results=10)
        return json.dumps(result)
    except RuntimeError as e:
        # Senso might not be configured — return empty results gracefully
        return json.dumps({
            "results": [],
            "error": f"Knowledge base search unavailable: {e}",
        })


@rt.function_node
async def tool_fetch_permit_details(permit_number: str) -> str:
    """Fetch detailed information about a specific permit including contacts and routing.

    Args:
        permit_number: The permit number to look up (e.g. "202301015678").

    Returns:
        JSON string with permit details, contacts, and routing/addenda info.
    """
    # Fetch the permit itself
    permits = await datasf.fetch_permits(
        where_clause=f"permit_number='{permit_number}'",
        limit=1,
    )

    # Fetch associated contacts (contractor, architect, etc.)
    contacts = await datasf.fetch_permit_contacts(permit_number)

    # Fetch routing / addenda (approval pipeline)
    addenda = await datasf.fetch_permit_addenda(permit_number)

    return json.dumps({
        "permit": permits[0] if permits else None,
        "contacts": contacts,
        "addenda": addenda,
    })


# ── Agent Definition ─────────────────────────────────────────────────────────
# The PermitPulse agent has access to all four tools and a system message
# that guides its behavior.

SYSTEM_MESSAGE = """You are PermitPulse, an autonomous regulatory intelligence agent for San Francisco real estate.

You help investors, developers, and legal professionals understand regulatory risk by analyzing building permits, code violations, and inspection data from the City of San Francisco.

## Your Workflow

When a user asks a question:
1. **Search the knowledge base first** — use tool_search_knowledge to check if we already have relevant data indexed in Senso.
2. **Fetch fresh data if needed** — if the knowledge base doesn't have sufficient data, use tool_fetch_permits or tool_fetch_violations to pull live data from DataSF. This also automatically ingests the data into the knowledge base for future queries.
3. **Get details when needed** — use tool_fetch_permit_details for deep dives on specific permits (contacts, routing status).
4. **Synthesize a clear answer** — combine knowledge base results and fresh data into a factual, well-structured response.

## Response Guidelines

- Always cite specific permit numbers (e.g. "Permit 202301015678") and complaint numbers.
- Always mention the neighborhood and supervisor district when available.
- Flag red flags prominently: unsafe building notices, work without permit, expired permits.
- When discussing costs, format as currency (e.g. "$1,500,000").
- When discussing dates, use human-readable format (e.g. "January 15, 2025").
- If data is unavailable or the query doesn't match any records, say so clearly.
- For aggregate questions (averages, counts), do the math from the raw data.

## Important Notes

- DataSF uses SoQL (SQL-like) query language. Common fields: permit_number, status, filed_date, issued_date, estimated_cost, neighborhoods_analysis_boundaries, supervisor_district, block, lot.
- Permit types: 1=new construction, 2=additions, 3=alterations, 8=demolition.
- Supervisor districts are numbered 1-11.
- Addresses in DataSF are uppercase (e.g. "MAIN" not "Main").
"""

# Create the LLM instance — Railtracks wraps OpenAI's API
llm = OpenAILLM("gpt-4o")

# Build the agent node with all tools attached
permit_agent = rt.agent_node(
    "PermitPulse Agent",
    tool_nodes=[
        tool_fetch_permits,
        tool_fetch_violations,
        tool_search_knowledge,
        tool_fetch_permit_details,
    ],
    llm=llm,
    system_message=SYSTEM_MESSAGE,
)

# ── Flow ─────────────────────────────────────────────────────────────────────
# The flow is the entry point — FastAPI will call flow.invoke(user_message).

query_flow = rt.Flow(name="PermitPulse Query", entry_point=permit_agent)
