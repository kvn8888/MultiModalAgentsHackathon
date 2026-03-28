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

## Step 5: "How Is This Different From a Chatbot?"

This question stopped me cold. I'd built a functional agent — it queried DataSF, ingested into Senso, answered questions accurately. But if you squinted, it looked like ChatGPT with a building permit system prompt. The agent was doing interesting work under the hood, but none of that was **visible** to the user. They saw a text box, a spinner, and an answer. That's a chatbot.

The insight: **an agent's value isn't just in what it does — it's in showing *that* it's doing it.** When a human researcher works, you can see them flipping through tabs, scanning documents, flagging anomalies. An agent should do the same thing, visually.

I identified four features to make the agent's work visible:

1. **Streaming activity steps** — Show each tool invocation as it happens, not after
2. **Rich permit cards** — Domain-specific data rendering instead of markdown tables
3. **Live data panel** — A split layout where fetched data lives separately from the conversation
4. **Proactive intelligence feed** — Background indexing visibility in the header

### The Backend: Server-Sent Events

The original `/api/chat` endpoint did all its work, then returned a single JSON response. The user saw nothing until everything was done. The fix was a new `/api/chat/stream` endpoint that emits Server-Sent Events (SSE) as the agent works:

```python
def _sse(event_type: str, data: dict | list) -> str:
    """Format a single SSE frame — the tiny protocol that makes streaming work."""
    return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"

@app.post("/api/chat/stream")
async def chat_stream(req: ChatRequest):
    async def generate():
        # Before each tool call, emit a "running" step
        yield _sse("step", {"tool": name, "status": "running",
                            "label": "Fetching live permits from DataSF…"})
        
        # Execute the tool
        result = await tool_fn(args)
        
        # After completion, emit structured data + "complete" step
        yield _sse("permits", permits)
        yield _sse("step", {"tool": name, "status": "complete", "count": len(permits)})
        
        # Finally, stream the LLM's answer
        yield _sse("answer", {"text": llm_response})
        yield _sse("done", {})
    
    return StreamingResponse(generate(), media_type="text/event-stream")
```

The event protocol is intentionally simple: `step` (running/complete), `permits` (data array), `violations` (data array), `answer` (text), `done` (close). Each event type maps to a different UI component on the frontend.

### The Transport Problem: Markers in the Text Stream

Here's where it gets tricky. assistant-ui uses `TextStreamChatTransport`, which only supports **plain text** streaming. There's no built-in mechanism for structured side-channel data. But I needed to send both the answer text AND structured permit/step data through the same stream.

My solution: embed structured markers as HTML comments in the text stream, then parse them out on the frontend:

```typescript
// In route.ts — convert SSE events to a text stream with embedded markers
if (event === "step") {
  controller.enqueue(encoder.encode(`<!-- STEP:${JSON.stringify(data)} -->\n`));
} else if (event === "permits") {
  controller.enqueue(encoder.encode(`<!-- PERMITS:${JSON.stringify(data)} -->\n`));
} else if (event === "answer") {
  controller.enqueue(encoder.encode(data.text));  // Pure text, no marker
}
```

The `AssistantMessage` component then parses these markers out of the streaming text, pushes structured data to a zustand store, and renders clean markdown with the markers stripped:

```typescript
// Regex patterns for extracting markers from the streaming text
const STEP_MARKER = /<!--\s*STEP:(.*?)-->/g;
const PERMITS_MARKER = /<!--\s*PERMITS:(.*?)-->/gs;

function AssistantMessage() {
  const rawText = useAuiState(/* extract text from message parts */);
  const steps = useMemo(() => parseSteps(rawText), [rawText]);
  const cleanText = useMemo(() => stripMarkers(rawText), [rawText]);
  
  // Push structured data to global store (for the side panel)
  useEffect(() => {
    const matches = rawText.matchAll(PERMITS_MARKER);
    for (const match of matches) {
      const permits = JSON.parse(match[1]);
      useAgentStore.getState().addPermits(permits);
    }
  }, [rawText]);
  
  return (
    <>
      {/* Animated activity steps */}
      {steps.map(step => <StepCard step={step} />)}
      {/* Clean answer text */}
      <MarkdownText content={cleanText} />
    </>
  );
}
```

**Why markers instead of a separate WebSocket?** Two reasons: (1) assistant-ui's transport expects a single text stream, and fighting the framework would create more problems than it solves; (2) HTML comments are invisible if the markers aren't stripped — a safe fallback.

### The Infinite Loop: `zustand` Selector Gotcha

This one's worth a dedicated section because it's a common React trap. I built a `ProactiveIntelFeed` component that subscribes to the agent store:

```typescript
// BUG: This creates a new array on every render
const feed = useAgentStore((s) => s.intelFeed.slice(0, 3));
```

Looks innocent. But `.slice(0, 3)` returns a **new array reference** every time the selector runs. zustand uses `===` reference equality by default to decide whether state changed. New reference → "state changed" → re-render → new selector call → new `.slice()` → new reference → re-render → **infinite loop**.

The error message — `Maximum update depth exceeded` — doesn't point you toward the selector. The stack trace shows `forceStoreRerender → updateStoreInstance`, which is zustand's internal machinery. You have to reason about reference stability to find it.

The fix is simple: move the derivation outside the selector:

```typescript
// FIXED: Selector returns stable reference, slice happens in render
const intelFeed = useAgentStore((s) => s.intelFeed);
const feed = intelFeed.slice(0, 3);
```

**The rule:** Never call `.map()`, `.filter()`, `.slice()`, or any method that creates a new object/array inside a zustand selector. Either:
1. Return the raw state and derive in the component body
2. Use `useShallow` from `zustand/react/shallow` for object equality

This bug cost 20 minutes of debugging, but it's the kind of mistake you only make once.

### The Split Layout

The final piece is a split-pane layout: chat on the left, "LiveDataPanel" on the right. The panel shows three things simultaneously:

1. **Session stats** — queries made, records fetched, records indexed
2. **Live agent activity** — animated step cards with spinning loaders for running steps
3. **Permit cards** — styled cards with status-colored badges (issued = emerald, filed = amber, expired = red)

```tsx
function PermitCard({ permit }: { permit: Permit }) {
  const statusColor = STATUS_COLORS[permit.status?.toLowerCase() ?? ""] ?? "bg-zinc-100";
  return (
    <div className="rounded-lg border border-zinc-200 p-3 bg-white dark:bg-zinc-900">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs">{permit.permit_number}</span>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusColor}`}>
          {permit.status?.toUpperCase()}
        </span>
      </div>
      <p className="text-sm font-medium mt-1">{formatAddress(permit)}</p>
      <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{permit.description}</p>
    </div>
  );
}
```

The panel is 380px wide on large screens and collapses to a toggle button on smaller ones. The key architecture choice was using zustand as the bridge: `AssistantMessage` (in the chat) parses markers and pushes data to the store, `LiveDataPanel` (in the side panel) subscribes to the same store and renders it independently.

This means the chat shows the conversational answer, and the data panel shows the raw evidence — two different views of the same query, displayed simultaneously.

## What's Next

PermitPulse is live at [permit-pulse-27i6h.ondigitalocean.app](https://permit-pulse-27i6h.ondigitalocean.app). The streaming UI transformation is complete, but there's more to do:

- **Conversation memory:** The agent currently treats each message as independent. Adding session-based memory would let users have multi-turn conversations: "What permits are on 123 Main St?" → "Who's the contractor on the most recent one?"

- **Map visualization:** Permit data includes lat/lng coordinates. Plotting them on a Mapbox layer would turn the data panel into a genuine research tool.

- **SoQL optimization:** The agent currently returns all columns from Socrata. Adding `$select` clauses would reduce token usage significantly and speed up responses.

- **Multi-city expansion:** The Socrata API pattern is used by hundreds of cities. The `_query_socrata()` helper could be parameterized with different `DATASF_BASE_URL` values to support Oakland, Chicago, NYC, etc.

- **Background monitoring:** A cron job that watches for new violations and pushes them to the ProactiveIntelFeed without user queries — turning the agent fully autonomous.

---

*An agent that works invisibly is indistinguishable from autocomplete. The moment you show the work — the data flowing, the tools firing, the evidence accumulating — it stops being "just a chatbot" and starts being a tool you can trust.*
