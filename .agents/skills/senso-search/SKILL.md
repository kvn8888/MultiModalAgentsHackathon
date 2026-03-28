---
name: senso-search
description: >
  Search a Senso knowledge base for verified answers, context chunks, or content IDs.
  Use when the user asks a question that should be grounded in organizational knowledge,
  says "check Senso", or needs factual answers backed by verified documents.
license: MIT
compatibility: Requires @senso-ai/cli installed and SENSO_API_KEY set
metadata:
  author: senso
  version: "1.0.0"
---

# Senso Search

Search your organization's Senso knowledge base to ground responses in verified content. The Senso CLI provides three search variants — pick the right one for the task.

## Prerequisites

The `senso` CLI must be installed and authenticated:

```bash
npm install -g @senso-ai/cli
export SENSO_API_KEY=<your-key>
```

Verify with `senso whoami --output json --quiet`.

## Always Use These Flags

Every `senso` command must include `--output json --quiet` so output is machine-readable and free of banners.

## Search Variants

### 1. Full Search (default) — AI answer + source chunks

Use this when the user asks a question and wants a direct answer grounded in their knowledge base.

```bash
senso search "<query>" --output json --quiet
```

Returns:
- `answer` — AI-generated answer synthesized from matching chunks
- `results[]` — array of source chunks, each with:
  - `content_id` — UUID of the source document
  - `title` — document title
  - `chunk_text` — the relevant excerpt
  - `score` — relevance score (0–1, higher is better)
  - `version_id` — specific version matched
  - `chunk_index` — position within the document

**When to use:** The user wants a ready-made answer. This is the default choice.

### 2. Context Search — chunks only, no AI answer

Use this when you need raw verified chunks to build your own response, or when feeding context into another LLM.

```bash
senso search context "<query>" --output json --quiet
```

Returns the same `results[]` array as full search, but without the `answer` field.

**When to use:** You want to assemble your own response from verified sources, or the user is building a RAG pipeline.

### 3. Content Search — document IDs and titles only

Use this to discover which documents are relevant before fetching their full content.

```bash
senso search content "<query>" --output json --quiet
```

Returns deduplicated content IDs and titles — no chunks, no answer.

**When to use:** The user wants to know which documents exist on a topic, or you need IDs to pass to other commands like `senso content get <id>`.

## Options

All three variants accept the same options:

| Flag | Description |
|------|-------------|
| `--max-results <n>` | Number of results to return (1–20, default: 5) |
| `--content-ids <id1> <id2> ...` | Restrict search to specific content item UUIDs |
| `--require-scoped-ids` | Only return results from the specified `--content-ids` (without this flag, the API may fall back to all content) |

### Scoping search to specific documents

If the user says "search only in document X" or you already know the relevant content IDs:

```bash
senso search "query" --content-ids abc-123 def-456 --require-scoped-ids --output json --quiet
```

## How to Cite Results

When presenting search results to the user:

1. Lead with the answer (from full search) or your synthesized answer (from context search)
2. Cite sources by title and content ID — e.g., "According to *Refund Policy* (cnt_abc123)..."
3. If the user wants more detail on a source, fetch it with `senso content get <content_id> --output json --quiet`

## Retrieving Full Content

After identifying relevant documents via search, you can fetch the full content:

```bash
senso content get <content_id> --output json --quiet
```

This returns the complete content item including all versions, metadata, and publish status.

## Error Handling

| HTTP Status | Meaning | Action |
|-------------|---------|--------|
| 401 | Invalid or missing API key | Check `SENSO_API_KEY` is set correctly |
| 402 | Insufficient credits | Tell the user their credit balance is low — check with `senso credits --output json --quiet` |
| 403 | API key lacks search permission | The key may be scoped — ask the user to check key permissions |

## Additional Search Command

There is also a `full` alias that behaves identically to the default search:

```bash
senso search full "<query>" --output json --quiet
```
