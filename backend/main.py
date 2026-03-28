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

from config import CORS_ORIGINS, PORT
from agent import query_flow
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

    The agent will:
      1. Search the Senso knowledge base for existing context.
      2. Fetch fresh data from DataSF if needed.
      3. Ingest new data into Senso (self-improvement).
      4. Synthesize a natural-language answer.
    """
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    try:
        # Invoke the Railtracks flow — this runs the full agent pipeline
        result = query_flow.invoke(req.message)

        # Railtracks returns the final agent output as a string
        reply = str(result) if result else "I couldn't find relevant information for your query."

        return ChatResponse(reply=reply, session_id=req.session_id)

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
