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