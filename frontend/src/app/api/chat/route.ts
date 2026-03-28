/**
 * app/api/chat/route.ts — Next.js API route that proxies chat requests
 * to the PermitPulse FastAPI backend's SSE streaming endpoint.
 *
 * assistant-ui sends messages in AI SDK format.  This route:
 *   1. Extracts the latest user message from the AI SDK messages array.
 *   2. Forwards it to the FastAPI SSE endpoint (/api/chat/stream).
 *   3. Reads the SSE events and converts them into a progressive plain-text
 *      stream with embedded markers that the frontend components parse.
 *
 * Marker protocol (embedded in the text stream, parsed by AssistantMessage):
 *   <!-- STEP:{json} -->      — an agent tool step (running / complete / error)
 *   <!-- PERMITS:{json} -->   — array of permit records from DataSF
 *   <!-- VIOLATIONS:{json} --> — violations and complaints data
 *   Regular text              — the agent's answer (streams progressively)
 *
 * This means the frontend sees activity steps appearing in real time as the
 * agent works, then the answer text streams in — making the agent's work
 * visible instead of hiding behind a spinner.
 */

// Allow up to 60 seconds for the agent to think + fetch data
export const maxDuration = 60;

// URL of our Python FastAPI backend — defaults to localhost:8000 in dev
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Extract user text from an AI SDK message (handles both `parts` and `content`). */
function extractUserText(message: any) {
  if (!message) return "";

  // Simple string content (older format)
  if (typeof message.content === "string") {
    return message.content;
  }

  // AI SDK v6 uses `parts`, older versions use `content` as an array
  const parts = Array.isArray(message.parts)
    ? message.parts
    : Array.isArray(message.content)
      ? message.content
      : [];

  return parts
    .filter((part: { type?: string }) => part?.type === "text")
    .map((part: { text?: string }) => part.text ?? "")
    .join("\n");
}

/** Parse a single SSE event block ("event: ...\ndata: ...") into typed data. */
function parseSSEBlock(block: string): { event: string; data: any } {
  let event = "";
  const dataLines: string[] = [];

  for (const line of block.split("\n")) {
    if (line.startsWith("event: ")) event = line.slice(7).trim();
    else if (line.startsWith("data: ")) dataLines.push(line.slice(6));
  }

  const raw = dataLines.join("\n");
  try {
    return { event, data: JSON.parse(raw) };
  } catch {
    return { event, data: raw };
  }
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  // Parse the incoming request
  const payload = await req.json();
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];

  // Extract the latest user message
  const lastUserMessage = messages
    .filter((m: { role: string }) => m.role === "user")
    .pop();

  const fallbackUserText =
    typeof payload?.message === "string"
      ? payload.message
      : typeof payload?.prompt === "string"
        ? payload.prompt
        : typeof payload?.input === "string"
          ? payload.input
          : "";

  if (!lastUserMessage && !fallbackUserText.trim()) {
    return new Response("No user message found", { status: 400 });
  }

  // Allow runtime Gemini API key override from the frontend
  const geminiApiKey =
    typeof payload?.geminiApiKey === "string"
      ? payload.geminiApiKey
      : typeof payload?.gemini_api_key === "string"
        ? payload.gemini_api_key
        : "";

  const userText =
    lastUserMessage == null
      ? fallbackUserText
      : extractUserText(lastUserMessage);

  try {
    // Call the SSE streaming endpoint on the backend
    const backendResponse = await fetch(`${BACKEND_URL}/api/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: userText,
        gemini_api_key: geminiApiKey,
      }),
    });

    if (!backendResponse.ok) {
      const error = await backendResponse.text();
      throw new Error(`Backend error: ${error}`);
    }

    // Read the SSE stream from the backend and convert it into a
    // plain-text stream with embedded markers for the frontend to parse.
    const reader = backendResponse.body!.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        let buffer = "";

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Accumulate incoming bytes into a text buffer
          buffer += decoder.decode(value, { stream: true });

          // SSE events are separated by double newlines — parse complete ones
          while (true) {
            const eventEnd = buffer.indexOf("\n\n");
            if (eventEnd === -1) break;

            const eventBlock = buffer.slice(0, eventEnd);
            buffer = buffer.slice(eventEnd + 2);

            // Skip empty blocks
            if (!eventBlock.trim()) continue;

            const { event, data } = parseSSEBlock(eventBlock);

            if (event === "step") {
              // Emit an activity step marker — the AssistantMessage component
              // will parse these and render them as animated step cards.
              controller.enqueue(
                encoder.encode(`<!-- STEP:${JSON.stringify(data)} -->\n`)
              );
            } else if (event === "permits") {
              // Emit structured permit data for the data panel
              controller.enqueue(
                encoder.encode(`<!-- PERMITS:${JSON.stringify(data)} -->\n`)
              );
            } else if (event === "violations") {
              // Emit structured violation data
              controller.enqueue(
                encoder.encode(`<!-- VIOLATIONS:${JSON.stringify(data)} -->\n`)
              );
            } else if (event === "answer") {
              // Stream the answer text — this is what the user sees as the
              // "response" in the chat bubble
              if (typeof data?.text === "string") {
                controller.enqueue(encoder.encode(data.text));
              }
            } else if (event === "error") {
              controller.enqueue(
                encoder.encode(
                  `Sorry, I encountered an error: ${data?.message ?? "unknown error"}`
                )
              );
            }
            // "done" event — we just let the stream close naturally
          }
        }

        controller.close();
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("Error calling PermitPulse backend:", error);

    const message =
      error instanceof Error
        ? `Sorry, I encountered an error connecting to the PermitPulse backend.\n\n${error.message}`
        : "Sorry, I encountered an error connecting to the PermitPulse backend.";

    return new Response(message, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  }
}
