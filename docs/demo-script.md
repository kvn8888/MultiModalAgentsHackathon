# PermitPulse Pitch And Demo Script

## One-Liner

PermitPulse is an autonomous regulatory-intelligence agent for San Francisco real estate. It fetches live permits, complaints, and violations from DataSF, grows a Senso-backed knowledge base with every query, and answers due-diligence questions in natural language.

## 30-Second Pitch

Every major real-estate decision in San Francisco depends on regulatory risk, but the underlying data is fragmented across municipal permit and violation systems. PermitPulse turns that mess into a conversational intelligence product. It fetches live records from DataSF, normalizes them, stores them in Senso as reusable context, and answers questions like: "What permit activity happened at this address?" or "Are there active violations within 500 feet?" The system gets smarter every time it runs because each query expands the knowledge base for the next one.

## 3-Minute Demo Script

### 0:00-0:30 — Problem

If you are underwriting a multi-million-dollar property deal in San Francisco, regulatory risk matters immediately: open violations, unpermitted work, delayed permits, routing bottlenecks, and inspection history. Today that means manual search across multiple city datasets. PermitPulse compresses that into a single chat workflow.

### 0:30-1:10 — Show The Product

Open the chat UI and ask:

"What building permits have been filed in the Mission district recently?"

Narration:

This is live city data, not a seed JSON file. The agent is pulling permits from the SF Data portal in real time, summarizing them, and citing actual permit numbers, addresses, statuses, and estimated costs.

### 1:10-1:50 — Show Intelligence

Ask:

"Give me details on permit 202603268347."

Narration:

Now we move from broad search into parcel-level due diligence. PermitPulse can pull permit-level details, summarize the project scope, surface revised costs, and flag anything that suggests risk or additional review.

Then ask:

"Are there any code violations at 811 Valencia St?"

Narration:

The system cross-references complaint and violation datasets, not just permits. This is where the regulatory-intelligence angle becomes much more useful than a standard permit search tool.

### 1:50-2:20 — Show The Self-Improving Loop

Narration:

The important part is that each query is not disposable. When the agent fetches records, it can ingest the normalized results into Senso. That means the next question about the same property, block, or neighborhood starts with richer context. The product improves as it is used.

### 2:20-2:45 — Business Case

Narration:

Real-estate investors, developers, title companies, and underwriters all need this intelligence. The San Francisco wedge is compelling because the data is public and high value, but the same architecture can generalize across thousands of US jurisdictions.

### 2:45-3:00 — Stack And Sponsor Callout

Narration:

PermitPulse is built with Railtracks for agent orchestration, Senso for the knowledge layer, assistant-ui for the chat frontend, and DigitalOcean for deployment. The system uses live DataSF permit and violation data and currently runs on Gemini 3.1 Flash Lite Preview.

## Recommended Demo Prompts

1. What building permits have been filed in the Mission district recently?
2. Give me details on permit 202603268347.
3. Are there any code violations at 811 Valencia St?
4. What red flags do you see in this recent permit activity?

## Judge-Facing Value Props

1. Live public-sector data turned into a usable intelligence product.
2. Self-improving knowledge base instead of one-shot answers.
3. Clear commercial buyer: investors, developers, title, underwriting.
4. Strong sponsor-tool integration across orchestration, knowledge, UI, and deployment.

---

## Devpost Submission Copy

### Inspiration

Every major real-estate decision in San Francisco carries regulatory risk — open violations, unpermitted work, stalled permits, routing bottlenecks. But the data lives in fragmented city systems that require manual cross-referencing across multiple municipal portals. We're building for a specific class of professionals — investors, developers, title companies, underwriters — who run that research daily and whose decisions are worth millions. The question was: what if an agent did it for them, got smarter with each query, and showed its work in real time?

### What it does

PermitPulse is an autonomous regulatory-intelligence agent for San Francisco real estate. Ask it a question — "What permits have been filed in the Mission recently?" or "Are there open violations at 811 Valencia?" — and it:

1. **Searches its knowledge base first** for previously indexed context (powered by Senso)
2. **Fetches live records from DataSF** if fresh data is needed — building permits, DBI complaints, Notices of Violation
3. **Indexes everything it fetches** back into the knowledge base, so the next query on the same area starts richer
4. **Streams the answer progressively**, with a live activity trail showing each tool invocation as it happens, and a side panel where permit and violation cards appear in real time as the agent retrieves them

The result is a self-improving regulatory intelligence loop: the product gets more useful with every query.

### How we built it

- **Agent orchestration**: Railtracks — tools defined as `@rt.function_node`, the agent as `rt.agent_node`, the flow as `rt.Flow`. Four tools: fetch permits, fetch violations, fetch permit details, search knowledge base.
- **LLM**: Google Gemini 3.1 Flash Lite Preview via litellm with multi-round tool-calling
- **Knowledge layer**: Senso Context OS — every DataSF result is normalized and ingested; future queries on the same area benefit from accumulated context
- **Backend**: FastAPI with a real-time SSE streaming endpoint (`/api/chat/stream`) that emits `step`, `permits`, `violations`, `answer`, and `done` events as the agent works — making every tool invocation visible
- **Frontend**: Next.js 16 + assistant-ui + AI SDK v6, in a split-pane layout — chat on the left for Q&A, a live intelligence panel on the right that populates with permit and violation cards as the SSE stream arrives
- **Deployment**: DigitalOcean App Platform — separate Docker containers for backend and frontend, auto-deployed on push

### Challenges we ran into

**Making the agent's work visible.** The original version returned a JSON blob after the agent finished — all the interesting work was hidden behind a spinner. We rebuilt the backend to emit SSE events in real time, so users see each tool running as it happens. Getting those events to integrate cleanly with assistant-ui's text stream transport — embedding step markers that the frontend strips before rendering — required careful coordination across layers.

**Infinite re-render loops.** assistant-ui's `useAuiState` selector triggers a re-render whenever its return value changes by reference. Returning a parsed array from the selector caused a new reference on every render tick, producing React error #185 (too many re-renders) the moment the agent responded. The fix: return the raw JSON string (a stable primitive) and parse it with `useMemo` outside the selector.

**DataSF quirks.** The Socrata SODA API behaves differently across datasets — field names, filter syntax, and pagination are inconsistent. We had to handle dataset-specific differences in the fetcher layer to get clean, joinable results across permits, complaints, and violations.

### Accomplishments that we're proud of

- A genuinely self-improving loop: every query expands the knowledge base, so the second question about the Mission district is answered faster and with richer context than the first
- Real-time SSE streaming that makes the agent feel alive — each tool invocation animates in as it happens, not a spinner followed by a wall of text
- The split-pane UI: chat on the left, a live data panel on the right where permit and violation cards appear as the agent fetches them — it reads like a research tool, not a chatbot
- Clean integration of all four sponsor tools — Railtracks, Senso, assistant-ui, and DigitalOcean — each doing real work in the core product loop, not just a demo mention

### What we learned

Streaming changes the product feel more than almost any other single change. The same answer that feels like "wait, then text" becomes "watch the agent think" when you surface the intermediate steps. Showing work builds trust and makes an agent feel capable rather than magical.

We also learned that embedding structured data as invisible markers inside a text stream is a practical way to pass rich side-channel information — permit records, step status, violation counts — through a transport that only speaks text, without rebuilding the transport layer.

### What's next for PermitPulse

- **Expand jurisdictions**: The same architecture ports to any city with a Socrata-backed open data portal — Los Angeles, Chicago, New York. SF is the proof of concept for a national product.
- **Proactive monitoring**: Instead of only answering queries, PermitPulse should watch a saved list of addresses and alert investors when new permits or violations are filed.
- **Deeper data joins**: Cross-referencing permit contacts (contractors, architects) with violation history to surface pattern-of-practice risk at the entity level.
- **Spatial queries**: "Show me everything within 500 feet of this parcel" — visualized alongside the chat as the agent works.