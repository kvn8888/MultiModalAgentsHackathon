"""
main.py — FastAPI application for PermitPulse backend.

Exposes:
  POST /api/chat       — Send a user message, get the agent's response.
  GET  /api/health     — Health check endpoint.
  POST /api/ingest     — Trigger a manual data ingestion run.

The chat endpoint invokes the Railtracks query_flow, which routes the
user's natural-language question through the PermitPulse agent and its
DataSF + Senso tools.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from config import CORS_ORIGINS, PORT, GEMINI_API_KEY
from agent import query_flow, SYSTEM_MESSAGE, tool_fetch_permits, tool_fetch_violations, tool_search_knowledge, tool_fetch_permit_details
from tools import datasf, senso


# ── Lifespan ─────────────────────────────────────────────────────────────────
# Startup / shutdown hooks.  On startup we do a small seed ingestion so the
# knowledge base has some data even before the first user query.

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run startup tasks (seed data) then yield, then cleanup on shutdown."""
    print("🏗️  PermitPulse starting up...")
    # Seed: fetch the 20 most recent permits and ingest into Senso
    try:
        recent = await datasf.fetch_permits(limit=20)
        if recent:
            await senso.ingest_permits(recent)
            print(f"✅ Seeded {len(recent)} permits into Senso knowledge base")
    except Exception as e:
        # Don't crash on startup if Senso or DataSF is down
        print(f"⚠️  Seed ingestion skipped: {e}")

    yield  # App is running

    # Shutdown: close the shared httpx client
    if datasf._client:
        await datasf._client.aclose()
    print("👋 PermitPulse shut down")


# ── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="PermitPulse",
    description="Regulatory intelligence agent for SF building permits & violations",
    version="0.1.0",
    lifespan=lifespan,
)

# Allow the frontend (assistant-ui on localhost:3000 or :5173) to call us
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response models ────────────────────────────────────────────────

class ChatRequest(BaseModel):
    """A user message sent to the PermitPulse agent."""
    message: str           # The natural-language query
    session_id: str = ""   # Optional session ID for conversation context


class ChatResponse(BaseModel):
    """The agent's response to a user query."""
    reply: str             # The agent's natural-language answer
    session_id: str = ""   # Echoed back for frontend tracking


class IngestRequest(BaseModel):
    """Trigger a manual data-ingestion run."""
    since_date: str = ""   # ISO date (e.g. "2025-01-01"). Empty = last 7 days.
    limit: int = 100       # Max records to fetch and ingest


class IngestResponse(BaseModel):
    """Result of a manual ingestion run."""
    permits_fetched: int
    permits_ingested: int
    violations_fetched: int
    violations_ingested: int


# ── Routes ───────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    """Health check — returns 200 if the server is up."""
    return {"status": "ok", "service": "PermitPulse"}


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """
    Send a message to the PermitPulse agent and get a response.

    Uses litellm directly with tool_choice so Gemini makes structured
    function calls. Railtracks tool nodes are called for the actual
    data fetching — we just bypass Railtracks' agent loop which doesn't
    set tool_choice for Gemini.
    """
    import asyncio
    import json
    import litellm

    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    # Map tool names to their async handler functions (the Railtracks @rt.function_node funcs)
    tool_handlers = {
        "tool_fetch_permits": tool_fetch_permits,
        "tool_fetch_violations": tool_fetch_violations,
        "tool_search_knowledge": tool_search_knowledge,
        "tool_fetch_permit_details": tool_fetch_permit_details,
    }

    # Define tools in litellm/OpenAI format for Gemini
    tools = [
        {
            "type": "function",
            "function": {
                "name": "tool_fetch_permits",
                "description": "Fetch building permits from SF DataSF. Use JSON query_params with keys like where, address_number, address_street, neighborhood, district, limit.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query_params": {"type": "string", "description": "JSON string with filter keys: where, address_number, address_street, neighborhood, district, limit"}
                    },
                    "required": ["query_params"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "tool_fetch_violations",
                "description": "Fetch code violations and DBI complaints. Use JSON query_params with keys like block, lot, complaint_number, where, limit.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query_params": {"type": "string", "description": "JSON string with filter keys: block, lot, complaint_number, where, limit"}
                    },
                    "required": ["query_params"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "tool_search_knowledge",
                "description": "Search the Senso knowledge base for previously ingested permit/violation data.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Natural-language search query"}
                    },
                    "required": ["query"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "tool_fetch_permit_details",
                "description": "Fetch detailed info about a specific permit including contacts and routing.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "permit_number": {"type": "string", "description": "The permit number to look up"}
                    },
                    "required": ["permit_number"],
                },
            },
        },
    ]

    # Build the message history
    messages = [
        {"role": "system", "content": SYSTEM_MESSAGE},
        {"role": "user", "content": req.message},
    ]

    try:
        # Tool call loop — keep calling until we get a text response (max 5 rounds)
        for round_num in range(5):
            # First round: force tool use. Later rounds: let model decide.
            current_tool_choice = "required" if round_num == 0 else "auto"
            
            resp = await asyncio.to_thread(
                litellm.completion,
                model="gemini/gemini-3.1-flash-lite-preview",
                messages=messages,
                tools=tools,
                tool_choice=current_tool_choice,
                api_key=GEMINI_API_KEY,
            )

            msg = resp.choices[0].message

            # If the model made tool calls, execute them and loop
            if msg.tool_calls:
                # Add the assistant's tool-call message to history
                messages.append(msg.model_dump())

                for tc in msg.tool_calls:
                    fn_name = tc.function.name
                    fn_args = json.loads(tc.function.arguments)

                    handler = tool_handlers.get(fn_name)
                    if handler:
                        # Call the Railtracks @rt.function_node function directly
                        # @rt.function_node preserves the original async callable
                        result = await handler(**fn_args)
                    else:
                        result = json.dumps({"error": f"Unknown tool: {fn_name}"})

                    # Add tool result to message history
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": str(result),
                    })
            else:
                # No tool calls — we have a final text response
                reply = msg.content or "I couldn't find relevant information for your query."
                return ChatResponse(reply=reply, session_id=req.session_id)

        # If we hit max rounds, return whatever we have
        return ChatResponse(
            reply="I ran out of processing steps. Please try a more specific question.",
            session_id=req.session_id,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent error: {str(e)}")


@app.post("/api/ingest", response_model=IngestResponse)
async def ingest(req: IngestRequest):
    """
    Manually trigger a data ingestion run.

    Fetches recent permits and violations from DataSF, normalizes them,
    and ingests into the Senso knowledge base.
    """
    # Calculate the default since_date (7 days ago) if not provided
    if not req.since_date:
        from datetime import datetime, timedelta
        since = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
    else:
        since = req.since_date

    # Fetch and ingest permits
    permits = await datasf.fetch_permits(
        where_clause=f"filed_date > '{since}'",
        limit=req.limit,
    )
    permit_results = []
    if permits:
        try:
            permit_results = await senso.ingest_permits(permits)
        except Exception:
            pass

    # Fetch and ingest violations
    violations = await datasf.fetch_violations(limit=req.limit)
    violation_results = []
    if violations:
        try:
            violation_results = await senso.ingest_violations(violations)
        except Exception:
            pass

    return IngestResponse(
        permits_fetched=len(permits),
        permits_ingested=len([r for r in permit_results if "error" not in r]),
        violations_fetched=len(violations),
        violations_ingested=len([r for r in violation_results if "error" not in r]),
    )


# ── Run directly ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)
