# Supported File Formats

## Format Table

| Extension | MIME Type | Notes |
|-----------|-----------|-------|
| `.pdf` | `application/pdf` | Most common format for knowledge base documents |
| `.txt` | `text/plain` | Plain text files |
| `.csv` | `text/csv` | Comma-separated values |
| `.doc` | `application/msword` | Legacy Word format |
| `.docx` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | Modern Word format |
| `.xls` | `application/vnd.ms-excel` | Legacy Excel format |
| `.xlsx` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | Modern Excel format |
| `.ppt` | `application/vnd.ms-powerpoint` | Legacy PowerPoint format |
| `.pptx` | `application/vnd.openxmlformats-officedocument.presentationml.presentation` | Modern PowerPoint format |
| `.html` / `.htm` | `text/html` | Web pages |
| `.md` | `text/markdown` | Markdown documents |
| `.json` | `application/json` | JSON data files |
| `.xml` | `application/xml` | XML data files |

## Upload Limits

- **Maximum 10 files** per upload request
- Files are hashed (MD5) for duplicate detection
- Presigned S3 URLs expire after the time specified in the response (`expires_in` field)

## Processing Pipeline

After upload, each file goes through:

1. **Parse** — extract text content from the file format
2. **Chunk** — split text into semantically meaningful segments
3. **Embed** — generate vector embeddings for each chunk
4. **Index** — add to the vector search index

Processing status can be tracked via `senso content get <content_id>` or `senso kb sync-status`.
