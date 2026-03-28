# Building PermitPulse: From Open Data to Autonomous Regulatory Intelligence in a Hackathon Weekend

I set out to build an autonomous agent that could answer natural-language questions about San Francisco building permits and code violations — and keep getting smarter with every query. Twelve hours later, PermitPulse was live on DigitalOcean, stitching together five sponsor tools across Python and TypeScript, surviving three framework-breaking API changes, and automatically growing its own knowledge base. Here's how it happened.

## The Starting Point

The [Multimodal Frontier Hackathon](https://www.multimodalfrontier.com/) gave us four sponsor tools to integrate:

| Sponsor Tool | What It Does |
|---|---|
| **Railtracks** | Python agent orchestration framework — lets you define tools, agents, and flows with decorators |
| **Senso.ai** | Knowledge base ("Context OS") that stores documents and answers semantic queries via CLI |
| **assistant-ui** | React chat component library that plugs into Vercel's AI SDK |
| **DigitalOcean** | Cloud hosting via App Platform |

The challenge: build something that uses *all four* meaningfully, not just checks boxes. My idea was a **self-improving loop**: user asks a question → agent fetches fresh data from SF's open data portal → data gets ingested into Senso → future queries return richer answers because the knowledge base has grown. The agent would literally get smarter the more you use it.

## Step 1: Choosing the Architecture

I went with a two-service architecture:

```
User → Next.js Frontend (assistant-ui) → API Route → FastAPI Backend (Railtracks) → DataSF / Senso
```

**Why two services instead of one?** Railtracks is a Python framework — it uses decorators like `@rt.function_node` and constructs like `rt.agent_node()` that only work in Python. assistant-ui is a React library that expects an AI SDK streaming endpoint. Rather than fight this with some Python-to-JS bridge, I gave each runtime its own service and connected them with a simple HTTP proxy.

**Why FastAPI?** It's async-native (important because DataSF API calls are I/O-bound), it gives you automatic OpenAPI docs, and the Pydantic models play nicely with Railtracks' type-hinted tool definitions.

The backend's entry point is a Railtracks `Flow` — essentially a graph where the agent is the single node, and it has access to tool functions for fetching permits, fetching violations, and searching the knowledge base:

```python
# Each tool is a @rt.function_node that the agent can invoke
@rt.function_node
async def tool_fetch_permits(query_params: str) -> str:
    """Fetch building permits from SF DataSF based on filter criteria."""
    params = json.loads(query_params)
    # Route to appropriate fetcher based on provided parameters
    if params.get("neighborhood"):
        permits = await datasf.fetch_permits_by_neighborhood(...)
    else:
        permits = await datasf.fetch_permits(where_clause=params.get("where", ""))
    
    # Self-improvement loop: ingest fetched data into Senso
    if permits:
        await senso.ingest_permits(permits)
    
    return json.dumps({"count": len(permits), "permits": permits})

# Wire tools into an agent with an LLM
llm = GeminiLLM("gemini-2.0-flash")
permit_agent = rt.agent_node(
    "PermitPulse Agent",
    tool_nodes=[tool_fetch_permits, tool_fetch_violations, 
                tool_search_knowledge, tool_fetch_permit_details],
    llm=llm,
    system_message=SYSTEM_MESSAGE
)

# A Flow wraps the agent as the entry point for queries
query_flow = rt.Flow(name="PermitPulse Query", entry_point=permit_agent)
```

The key insight: **every data fetch also ingests into Senso**. The `try/except` around ingestion means a Senso outage doesn't break queries — the agent gracefully degrades.

## Step 2: Connecting to San Francisco's Open Data

San Francisco publishes building permit and violation data through the [DataSF portal](https://datasf.org/), which uses the Socrata SODA 2.x API. SODA uses SoQL — a SQL-like query language passed via URL parameters (`$where`, `$select`, `$order`, `$limit`).

I needed five datasets:

| Dataset | ID | What It Contains |
|---|---|---|
| Building Permits | `i98e-djp9` | Permit applications, statuses, costs |
| Permit Contacts | `3mwf-svbh` | Contractors, architects, owners |
| DBI Complaints | `gm2e-bten` | Code complaints filed by the public |
| Code Violations | `nbtm-fbw5` | Violations issued by inspectors |
| Permit Addenda | `87xy-gk8d` | Changes/additions to existing permits |

The pattern for every query is the same — build a URL, attach optional auth, return JSON:

```python
async def _query_socrata(dataset_id: str, params: dict) -> list[dict]:
    """Execute a Socrata SODA query and return the JSON response."""
    client = await get_client()
    url = f"{DATASF_BASE_URL}/{dataset_id}.json"
    
    headers = {}
    if DATASF_APP_TOKEN:
        headers["X-App-Token"] = DATASF_APP_TOKEN  # Higher rate limits
    
    response = await client.get(url, params=params, headers=headers)
    response.raise_for_status()
    return response.json()
```

I built convenience functions on top: `fetch_permits_by_address()`, `fetch_permits_by_neighborhood()`, `fetch_permits_by_district()`. Each one constructs the right SoQL `$where` clause. The agent's LLM decides which to call based on the user's natural language query.

**What I'd do differently:** I should have added `$select` clauses to avoid returning 40+ columns per row. The full Socrata responses are verbose, and trimming fields would reduce token usage when the LLM processes the results.

## Step 3: The Senso.ai Integration — CLI, Not REST

Here's something that tripped me up initially: Senso.ai's integration isn't a REST API — it's a **CLI tool**. You shell out to the `senso` command:

```python
async def _run_senso_cmd(args: list[str]) -> dict | list:
    """Run a `senso` CLI command and return parsed JSON output."""
    cmd = ["senso"] + args + ["--output", "json", "--quiet"]
    
    env = os.environ.copy()
    env["SENSO_API_KEY"] = SENSO_API_KEY
    
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.PIPE, 
        stderr=asyncio.subprocess.PIPE, env=env
    )
    stdout, stderr = await proc.communicate()
    
    if proc.returncode != 0:
        raise RuntimeError(f"senso CLI error: {stderr.decode().strip()}")
    return json.loads(stdout.decode())
```

Search and ingest are one-liners on top of this:
- **Search:** `senso search context "<query>" --output json --quiet`
- **Ingest:** `senso kb create-raw --data '<json>' --output json --quiet`

The self-improvement loop works like this: the agent calls `tool_fetch_permits` → it queries DataSF → it gets back raw permit JSON → it formats each permit as a Senso document → it ingests via `senso kb create-raw`. Next time someone asks about that same address, `tool_search_knowledge` will find enriched data in Senso *without* hitting DataSF again.

## The Gotcha: AI SDK v5 Broke Everything

This was the most educational debugging session of the entire build. When I scaffolded the Next.js frontend with `create-next-app` and installed `assistant-ui`, everything compiled. But the moment I tried to build, three separate errors appeared — all caused by the same root issue: **Vercel AI SDK v5 has significant breaking changes from v4**, and the documentation I was referencing (and most tutorials online) were written for v4.

### Bug 1: `toDataStreamResponse()` doesn't exist

```
Type error: Property 'toDataStreamResponse' does not exist
```

**Root cause:** AI SDK v5 renamed `toDataStreamResponse()` to `toTextStreamResponse()`.

**Fix:**
```typescript
// v4 (broken)
return result.toDataStreamResponse();

// v5 (working)
return result.toTextStreamResponse();
```

### Bug 2: `useChatRuntime({ api })` doesn't accept a string

```
Type error: Property 'api' does not exist on type
```

**Root cause:** In v5, `useChatRuntime` no longer accepts `{ api: "/api/chat" }`. You now need to construct a `TextStreamChatTransport` object that wraps the URL. This is a significant pattern change — the SDK moved from simple config objects to explicit transport classes.

**Fix:**
```typescript
// v4 (broken)
const runtime = useChatRuntime({ api: "/api/chat" });

// v5 (working)
import { TextStreamChatTransport } from "ai";
const runtime = useChatRuntime({
  transport: new TextStreamChatTransport({ api: "/api/chat" }),
});
```

### Bug 3: assistant-ui generated components had stale prop names

The `npx assistant-ui` scaffolding generated thread components with `delayMs` and `render=` props that don't exist in v5. The generated code was targeting the older assistant-ui version.

**Fix:** Added `@ts-nocheck` to the generated files (they work at runtime despite the type mismatches) and fixed the explicit `delayMs` → `delay` rename.

### The lesson

When using a fast-moving SDK at a hackathon, **don't trust scaffolding tools to generate compatible code**. The generated output may be written for the version the tool was built against, not the version you just installed. Always check the actual installed version and read the *migration guide*, not just the intro docs.

## Step 4: Deploying to DigitalOcean App Platform

DigitalOcean App Platform uses an app spec (YAML) that defines your services, environment variables, and routing:

```yaml
name: permit-pulse
region: sfo

services:
  - name: backend
    dockerfile_path: backend/Dockerfile
    source_dir: /backend
    internal_ports:        # Internal-only — not exposed to the internet
      - 8000
    envs:
      - key: GOOGLE_API_KEY
        scope: RUN_TIME
        type: SECRET

  - name: frontend
    dockerfile_path: frontend/Dockerfile
    source_dir: /frontend
    http_port: 3000        # Public-facing
    routes:
      - path: /
    envs:
      - key: BACKEND_URL
        scope: RUN_TIME
        value: ${backend.PRIVATE_URL}  # DO resolves this automatically
```

A few things I got wrong on the first try:

**The internal vs. external ports trap:** I initially set the backend to use `http_port: 8000`, which registers it as a public-facing service with a route. But the frontend also had `routes: [{ path: / }]`, and DO doesn't allow two services to claim the same route prefix. The fix: use `internal_ports` for the backend instead of `http_port`. This makes it accessible only via `${backend.PRIVATE_URL}` within the App Platform network — exactly what we want since only the frontend's API route talks to it.

**The `git submodule` trap:** `create-next-app` creates its own `.git` directory inside `frontend/`. When you try to `git add frontend/`, Git silently treats it as a submodule reference instead of adding the actual files. The fix: `rm -rf frontend/.git` before committing.

**Next.js standalone mode:** For Docker deployments, Next.js needs `output: "standalone"` in `next.config.ts`. Without it, the Dockerfile can't create a minimal production image — it tries to copy `node_modules` wholesale, which bloats the image and breaks the build.

The deployment command is refreshingly simple:

```bash
doctl apps create --spec .do/app.yaml
```

After that, `deploy_on_push: true` means every `git push` to `main` triggers an automatic rebuild and redeploy.

## The Revision: Switching from OpenAI to Gemini

Halfway through the hackathon, I decided to switch from OpenAI GPT-4o to Google Gemini 2.0 Flash. The switch needed to happen in two places:

**Backend (Railtracks):** Railtracks abstracts LLM providers behind a common interface. The switch was a one-line change:

```python
# Before
from railtracks.llm import OpenAILLM
llm = OpenAILLM("gpt-4o")

# After
from railtracks.llm import GeminiLLM
llm = GeminiLLM("gemini-2.0-flash")
```

This is where good framework design shines. Railtracks' `agent_node` accepts any LLM object, so the agent definition, tools, and flow stayed identical. The framework handled the Gemini-specific API formatting internally.

**Frontend (AI SDK):** The Next.js API route uses Vercel's AI SDK to create the streaming response that assistant-ui consumes. The change:

```typescript
// Before
import { openai } from "@ai-sdk/openai";
const result = streamText({ model: openai("gpt-4o-mini"), ... });

// After
import { google } from "@ai-sdk/google";
const result = streamText({ model: google("gemini-2.0-flash"), ... });
```

Same pattern — the AI SDK abstracts the provider, so `streamText()` and `toTextStreamResponse()` work identically regardless of which model backs them.

**Environment variables** changed from `OPENAI_API_KEY` to `GOOGLE_API_KEY` across config, `.env.example`, and the DO app spec. One `doctl apps update` command propagated the secret changes to production.

**Total time for the switch: 10 minutes.** This is the payoff of using provider-agnostic frameworks. If I'd hard-coded OpenAI's API format anywhere, this would have been a multi-hour refactor.

## What's Next

PermitPulse is live at [permit-pulse-27i6h.ondigitalocean.app](https://permit-pulse-27i6h.ondigitalocean.app), but there's plenty of room to grow:

- **Conversation memory:** The agent currently treats each message as independent. Adding session-based memory (via Railtracks or Senso) would let users have multi-turn conversations: "What permits are on 123 Main St?" → "Who's the contractor on the most recent one?"

- **Proactive monitoring:** Right now the agent is reactive — you ask, it answers. A background job could watch for new violations or permit status changes and push notifications.

- **Richer data display:** assistant-ui supports custom message components. Permit data could render as cards with status badges, maps, and timeline views instead of plain text.

- **SoQL optimization:** The agent currently returns all columns from Socrata. Adding `$select` clauses would reduce token usage significantly and speed up responses.

- **Multi-city expansion:** The Socrata API pattern is used by hundreds of cities. The `_query_socrata()` helper could be parameterized with different `DATASF_BASE_URL` values to support Oakland, Chicago, NYC, etc.

---

*The most dangerous assumption at a hackathon isn't "this will be hard" — it's "the docs are current." Build against the installed version, not the tutorial version.*
