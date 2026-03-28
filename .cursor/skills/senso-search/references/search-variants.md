# Search Variant Comparison

## Decision Guide

| User Intent | Variant | Command |
|---|---|---|
| "What is our refund policy?" | Full search | `senso search "refund policy"` |
| "Find context about mortgage rates for my prompt" | Context search | `senso search context "mortgage rates"` |
| "Which documents mention onboarding?" | Content search | `senso search content "onboarding"` |
| "Search only in the HR folder documents" | Full + scoped | `senso search "query" --content-ids <id1> <id2> --require-scoped-ids` |

## Response Shape: Full Search

```json
{
  "answer": "Based on our documentation, the refund policy states...",
  "results": [
    {
      "content_id": "cnt_abc123",
      "version_id": "ver_def456",
      "title": "Refund Policy 2024",
      "chunk_text": "Customers may request a full refund within 30 days...",
      "chunk_index": 3,
      "score": 0.94,
      "vector_id": "vec_789"
    }
  ]
}
```

## Response Shape: Context Search

Same as full search but without the `answer` field — only `results[]`.

## Response Shape: Content Search

```json
[
  {
    "content_id": "cnt_abc123",
    "title": "Refund Policy 2024"
  },
  {
    "content_id": "cnt_def456",
    "title": "Returns Process Guide"
  }
]
```

## Score Interpretation

| Score Range | Meaning |
|---|---|
| 0.90–1.00 | Highly relevant — strong match |
| 0.75–0.89 | Relevant — good supporting context |
| 0.50–0.74 | Partially relevant — may contain useful info |
| Below 0.50 | Weak match — use with caution |
