---
name: senso-ingest
description: >
  Upload files or raw text into a Senso knowledge base. Handles file upload via presigned
  URLs, raw text/markdown creation, folder targeting, and processing status polling. Use when
  the user wants to add documents, files, or text content to their Senso KB.
license: MIT
compatibility: Requires @senso-ai/cli installed and SENSO_API_KEY set
metadata:
  author: senso
  version: "1.0.0"
---

# Senso Ingest

Add documents and text content to a Senso knowledge base. The CLI handles the full upload flow — reading files, computing hashes, requesting presigned S3 URLs, and uploading.

## Prerequisites

```bash
npm install -g @senso-ai/cli
export SENSO_API_KEY=<your-key>
```

## Always Use These Flags

Every `senso` command must include `--output json --quiet`.

## Ingestion Paths

### Path 1: Upload Files

Upload local files to the knowledge base. The CLI handles hashing, presigned URL requests, and S3 upload automatically.

```bash
senso ingest upload <file1> <file2> ... --output json --quiet
```

**Constraints:**
- Maximum **10 files** per upload call
- Supported formats: PDF, TXT, CSV, DOC, DOCX, XLS, XLSX, PPT, PPTX, HTML, MD, JSON, XML

**Upload to a specific folder:**

```bash
senso kb upload <file1> <file2> --folder-id <kb_node_id> --output json --quiet
```

The `kb upload` command accepts a `--folder-id` option to place files into a specific KB folder. Without it, files go to the root.

**Response includes:**
- `summary.total` — number of files submitted
- `summary.success` — number accepted for upload
- `summary.skipped` — number skipped (duplicate, conflict, invalid)
- `results[]` — per-file status with `content_id` for each accepted file

**Per-file statuses:**
- `upload_pending` — file accepted and uploaded to S3
- `duplicate` — identical file already exists (check `existing_content_id`)
- `conflict` — filename conflict
- `invalid` — unsupported format or other validation error

### Path 2: Create Raw Text/Markdown Content

Create a content item directly from text or markdown without uploading a file:

```bash
senso kb create-raw --data '{
  "title": "My Document",
  "text": "# Heading\n\nContent goes here...",
  "kb_folder_node_id": "<parent-folder-uuid>"
}' --output json --quiet
```

The `kb_folder_node_id` is optional — omit it to create at the root level. The `text` field accepts plain text or markdown.

### Path 3: Replace an Existing Document's File

To update an existing content item with a new version of a file:

```bash
senso ingest reprocess <kb_node_id> <new-file-path> --output json --quiet
```

Or using the KB command:

```bash
senso kb update-file <kb_node_id> <new-file-path> --output json --quiet
```

This replaces the file on the existing node and triggers background re-processing.

## Complete Upload Workflow

When the user asks to upload files, follow these steps:

### Step 1: Find or Create Target Folder (optional)

If the user wants files in a specific folder:

```bash
# List top-level folders
senso kb my-files --output json --quiet

# Search for a folder by name
senso kb find --query "folder name" --output json --quiet

# Create a new folder if needed
senso kb create-folder --name "New Folder" --output json --quiet

# Create a folder inside another folder
senso kb create-folder --name "Subfolder" --parent-id <parent_kb_node_id> --output json --quiet
```

### Step 2: Upload Files

```bash
senso ingest upload report.pdf handbook.docx --output json --quiet
```

Or with a target folder:

```bash
senso kb upload report.pdf handbook.docx --folder-id <kb_node_id> --output json --quiet
```

### Step 3: Verify Processing

After upload, files are parsed, chunked, and embedded by a background worker. Check status:

```bash
senso kb sync-status --output json --quiet
```

To check a specific content item's processing status:

```bash
senso content get <content_id> --output json --quiet
```

Look for `processing_status`:
- `processing` — still being parsed and embedded
- `complete` — ready for search
- `failed` — processing error

### Step 4: Confirm Searchability

Once processing is complete, verify the content is searchable:

```bash
senso search "a term from the uploaded document" --max-results 1 --output json --quiet
```

## Updating Raw Content

To update text/markdown content that was created with `kb create-raw`:

**Full replacement** (overwrites all fields):
```bash
senso kb update-raw <kb_node_id> --data '{
  "title": "Updated Title",
  "text": "# New content\n\nReplacement text..."
}' --output json --quiet
```

**Partial update** (only changes specified fields):
```bash
senso kb patch-raw <kb_node_id> --data '{
  "title": "Just Update the Title"
}' --output json --quiet
```

## Error Handling

| HTTP Status | Meaning | Action |
|-------------|---------|--------|
| 401 | Invalid or missing API key | Check `SENSO_API_KEY` |
| 402 | Insufficient credits | Check balance with `senso credits --output json --quiet` |
| 409 | Conflict (e.g., duplicate file) | Check the `existing_content_id` in the response — the file may already exist |
| 422 | Unprocessable — invalid file format or data | Verify the file format is supported |

## Tips

- If uploading more than 10 files, batch them into groups of 10
- Duplicate detection is based on content hash — re-uploading the same file will return `duplicate` status with the `existing_content_id`
- Background processing typically takes a few seconds for small files, longer for large PDFs
- Always confirm that `senso kb sync-status` shows the index is up to date before relying on search results for newly uploaded content
