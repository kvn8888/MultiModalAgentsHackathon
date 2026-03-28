---
name: permit-pulse
description: >
  PermitPulse project skill — the living source of truth for this repository.
  Read this skill at the start of every new session to understand the project,
  its architecture, tech stack, APIs, file layout, and current feature status.
  Update this skill whenever features are added, changed, or removed so future
  LLM sessions never need to re-learn the codebase from scratch.
metadata:
  author: PermitPulse Team
  version: "0.2.0"
  hackathon: Multimodal Frontier Hackathon — March 28, 2026
---

# PermitPulse — Project Skill

> **Keep this file current.** Every time you add a feature, change architecture,
> or fix a significant bug, update the relevant section below. This is the
> onboarding doc for every future LLM session.

---

## 1. What Is PermitPulse?

**One-liner:** An autonomous agent that ingests SF building-permit and violation
data in real time, builds a growing knowledge base, and answers natural-language
regulatory-intelligence queries for real-estate investors and developers.

**Pitch:** Every major real-estate decision in San Francisco depends on
regulatory risk — permits, violations, inspection history — but that data is
scattered across municipal systems. PermitPulse continuously fetches, normalizes,
and indexes this data, then answers investor questions like:

- "Show me all active violations within 500 feet of 123 Main St"
- "What's the average permit approval time in District 6?"

The knowledge base improves with every query — a self-improving regulatory
intelligence engine.

**Target market:** Real-estate investors, developers, title companies, insurance
underwriters. The US building-permit data market alone serves a $2 T+ industry.

---

## 2. Tech Stack & Sponsor Tools

| Layer | Technology | Role |
|---|---|---|
| Agent orchestration | **Railtracks** (Python) | Define tools as `@rt.function_node`, agents as `rt.agent_node`, flows as `rt.Flow` |
| Knowledge layer | **Senso.ai** Context OS | Ingest permit/violation docs, semantic search for RAG |
| Frontend | **assistant-ui** (React) | Chat interface with streaming responses |
| Deployment | **DigitalOcean** App Platform | Host backend + frontend |
| Backend framework | **FastAPI** | HTTP API that bridges frontend ↔ Railtracks agent |
| LLM | Google Gemini 3.1 Flash Lite Preview | Agent reasoning |
| Data source | SF DataSF / Socrata SODA API | Live municipal data |

### Installed Shipables Skills

```
CoronRing/railtracks       1.0.0
senso-ai/senso-search      1.0.0
senso-ai/senso-ingest      1.0.0
assistant-ui/assistant-ui  1.0.0
```

---

## 3. Data Sources — SF DataSF (Socrata SODA)

Base URL: `https://data.sfgov.org/resource/{dataset_id}.json`
Auth: Unauthenticated (throttled to 1 000 req/hr — sufficient for hackathon).
Format: JSON + SoQL query language.
Pagination: `$limit` / `$offset`, default 1 000 rows.

| Dataset | ID | Key Join Field |
|---|---|---|
| Building Permits (primary) | `i98e-djp9` | `permit_number`, `block`+`lot` |
| Permit Contacts | `3mwf-svbh` | `permit_number` |
| DBI Complaints | `gm2e-bten` | `complaint_number`, `block`+`lot` |
| Notices of Violation | `nbtm-fbw5` | `complaint_number` |
| Permit Addenda / Routing | `87xy-gk8d` | `application_number` |

### Key SoQL patterns

```
# Recent permits in a neighborhood
?$where=neighborhoods_analysis_boundaries='Mission' AND filed_date > '2025-01-01'
&$order=filed_date DESC&$limit=50

# Permits by status in a district
?$select=status, count(*) as cnt&$where=supervisor_district='6'&$group=status

# High-value permits
?$where=estimated_cost > 1000000&$order=estimated_cost DESC&$limit=20
```

---

## 4. Architecture

```
Frontend (assistant-ui / React)
  │  HTTP / WebSocket
  ▼
Backend (FastAPI + Railtracks)
  ├── Railtracks Flow: "query"
  │     1. PermitPulse Agent (agent_node) — routes intent, calls tools
  │     2. fetch_permits (function_node) — SoQL → DataSF → ingest into Senso
  │     3. fetch_violations (function_node) — complaints + NOVs
  │     4. search_knowledge (function_node) — Senso semantic search
  │     5. fetch_nearby_parcels (function_node) — radius-based lookup
  │
  ├── Railtracks Flow: "ingest" (background)
  │     - Startup + periodic: fetch last 7 days of permits & violations
  │     - Normalize → batch ingest into Senso
  │
  └── External APIs
        ├── DataSF Socrata  (data.sfgov.org)
        ├── Senso Context OS (sdk.senso.ai)
        └── Google Gemini 3.1 Flash Lite Preview
```

### Self-Improvement Loop

1. User asks a question about an area.
2. Agent fetches fresh data from DataSF for that area.
3. New records get ingested into Senso → knowledge base grows.
4. Future queries about the same area return richer, faster results.
5. This is the "continuously learns" differentiator.

---

## 5. Repository Layout

> **Update this section** whenever files or directories are added/moved.

```
MultiModalAgentsHackathon/
├── README.md                          # Project overview
├── .claude/skills/                    # Claude Code skills
│   ├── permit-pulse/SKILL.md          # ← YOU ARE HERE (project memory)
│   ├── railtracks/                    # Railtracks skill (shipables)
│   ├── senso-search/                  # Senso search skill (shipables)
│   ├── senso-ingest/                  # Senso ingest skill (shipables)
│   ├── assistant-ui/                  # assistant-ui skill (shipables)
│   └── skill-creator/                 # Skill authoring guide
├── .cursor/skills/                    # Cursor agent skills (mirrors .claude)
├── .agents/skills/                    # Codex / Copilot / Gemini skills
├── .github/                           # GitHub config
├── .vscode/                           # VS Code settings
├── .do/
│   └── app.yaml                       # DigitalOcean App Platform deployment spec
├── frontend/                          # Next.js 16 frontend
│   ├── src/app/page.tsx               # Main page — branding + chat
│   ├── src/app/layout.tsx             # Root layout with TooltipProvider
│   ├── src/app/api/chat/route.ts      # API route proxying to FastAPI backend
│   ├── src/components/Assistant.tsx    # assistant-ui chat component
│   ├── src/components/assistant-ui/   # Auto-generated assistant-ui primitives
│   ├── src/components/ui/             # shadcn UI components
│   ├── package.json                   # Next.js + AI SDK + assistant-ui deps
│   ├── tsconfig.json                  # TypeScript config
│   └── Dockerfile                     # Multi-stage Docker build (standalone)
└── backend/                           # Python backend
    ├── main.py                        # FastAPI app — routes, lifespan, CORS
    ├── agent.py                       # Railtracks agent + flow definition
    ├── config.py                      # Environment variables + constants
    ├── requirements.txt               # Python dependencies
    ├── .env.example                   # Template for env vars
    ├── Dockerfile                     # Multi-stage Python 3.11 build
    └── tools/                         # Tool implementations
        ├── __init__.py
        ├── datasf.py                  # DataSF Socrata API client
        └── senso.py                   # Senso CLI wrapper (ingest + search)
```

---

## 6. Environment Variables

| Variable | Purpose | Where |
|---|---|---|
| `GOOGLE_API_KEY` | LLM calls via Railtracks + AI SDK | backend `.env` + frontend |
| `SENSO_API_KEY` | Senso Context OS auth | backend `.env` |
| `SENSO_ORG_ID` | Senso organization ID | backend `.env` |
| `DATASF_APP_TOKEN` | (optional) higher Socrata rate limits | backend `.env` |
| `BACKEND_URL` | Python backend URL for API proxy | frontend (set by DO via `${backend.PRIVATE_URL}`) |

---

## 7. Feature Status

> Mark features as they are implemented. This is the canonical tracker.

| # | Feature | Status | Notes |
|---|---|---|---|
| 1 | Project scaffolding + sponsor skills installed | ✅ Done | Railtracks, Senso, assistant-ui |
| 2 | DataSF fetcher tools (permits, violations, contacts) | ✅ Done | backend/tools/datasf.py |
| 3 | Senso ingestion pipeline | ✅ Done | backend/tools/senso.py (ingest_permits, ingest_violations) |
| 4 | Senso search integration | ✅ Done | backend/tools/senso.py (search_knowledge, search_full) |
| 5 | Railtracks agent flow (query) | ✅ Done | backend/agent.py — 4 tool nodes + agent + flow |
| 6 | Railtracks background ingest flow | ✅ Done | Seed ingest on startup in main.py lifespan + /api/ingest |
| 7 | FastAPI backend API | ✅ Done | backend/main.py — /api/chat, /api/health, /api/ingest |
| 8 | assistant-ui frontend | ✅ Done | Next.js 16 + assistant-ui + AI SDK v5 |
| 9 | DigitalOcean deployment | ✅ Done | Dockerfiles + .do/app.yaml app spec |
| 10 | Demo video + Devpost submission | 🔲 Not started | |

---

## 8. Key Decisions & Gotchas

- **No maps or graph visualizations** — chat-only UI per spec.
- **Fallbacks**: If Senso is down → in-memory keyword search. If DataSF is
  slow → pre-fetched seed dataset cached in Senso.
- **Railtracks pattern**: Tools are `@rt.function_node` with type hints +
  docstrings. Agents are `rt.agent_node(...)`. Flows are `rt.Flow(...)`.
- **Senso pattern**: Ingest via CLI `senso kb create-raw --data '<json>'`,
  search via `senso search context "<query>"`. Both use `--output json --quiet`.
  See `senso-ingest` and `senso-search` skills for details.
- **Senso runtime**: The backend tries a global `senso` binary first and falls
  back to `npx @senso-ai/cli` in local dev. The backend Docker image installs
  `@senso-ai/cli` so per-query ingestion works in deployment too.
- **AI SDK v5 breaking changes**: `toTextStreamResponse()` not `toDataStreamResponse()`.
  `useChatRuntime` uses `transport: new TextStreamChatTransport({ api })` not `{ api }` directly.
- **assistant-ui auto-generated components** have `render=` prop patterns that may
  not type-check with latest radix/shadcn. Use `@ts-nocheck` on those files.
- **assistant-ui pattern**: Scaffold with `npx assistant-ui create`, connect to
  FastAPI backend via AI SDK route handler.
- **Frontend proxy pattern**: `frontend/src/app/api/chat/route.ts` forwards the
  latest user message to FastAPI and streams plain text back. The frontend does
  not need its own Gemini call just to echo backend output.
- **Secret hygiene**: `backend/.env.example` must contain placeholders only.
  Real keys belong in ignored local env files or deployment secrets, never in git.

---

## 9. Commands Cheat Sheet

```bash
# Install sponsor skills
npx @senso-ai/shipables install CoronRing/railtracks --all
npx @senso-ai/shipables install senso-ai/senso-search --all
npx @senso-ai/shipables install senso-ai/senso-ingest --all
npx @senso-ai/shipables install assistant-ui/assistant-ui --all

# List installed skills
npx @senso-ai/shipables list

# (future) Run backend
cd backend && uvicorn main:app --reload

# (future) Run frontend
cd frontend && npm run dev

# Deploy to DigitalOcean
doctl apps create --spec .do/app.yaml

# Build Docker images locally
cd backend && docker build -t permitpulse-backend .
cd frontend && docker build -t permitpulse-frontend .
```

---

## 10. How to Update This Skill

When you add or change a feature:

1. Update **Section 5 (Repo Layout)** if new files/dirs were created.
2. Update **Section 7 (Feature Status)** — mark the feature ✅ or 🔄.
3. Update **Section 8 (Decisions & Gotchas)** if you learned something new.
4. Bump the `version` in the YAML frontmatter if it's a significant change.
