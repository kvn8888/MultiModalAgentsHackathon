/**
 * app/api/chat/route.ts — Next.js API route that proxies chat requests
 * to the PermitPulse FastAPI backend.
 *
 * assistant-ui sends messages in AI SDK format. This route:
 *   1. Extracts the latest user message from the AI SDK messages array.
 *   2. Forwards it to our FastAPI backend (/api/chat).
 *   3. Converts the response into a streaming format that assistant-ui expects.
 *
 * The route returns a plain text stream directly from the backend reply.
 * TextStreamChatTransport converts that into the UI message stream that
 * assistant-ui expects, so the frontend does not need its own model call.
 */

// Allow up to 60 seconds for the agent to think + fetch data
export const maxDuration = 60;

// URL of our Python FastAPI backend — defaults to localhost:8000 in dev
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

function toTextStreamResponse(text: string) {
  return new Response(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}

function extractUserText(message: any) {
  if (!message) return "";

  if (typeof message.content === "string") {
    return message.content;
  }

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

export async function POST(req: Request) {
  // Parse the incoming request. In production we may see slightly different
  // payload shapes depending on the transport/runtime version.
  const payload = await req.json();
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];

  // Extract the latest user message to send to our Python agent
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

  const geminiApiKey =
    typeof payload?.geminiApiKey === "string"
      ? payload.geminiApiKey
      : typeof payload?.gemini_api_key === "string"
        ? payload.gemini_api_key
        : "";

  // Get the text content from the message (handles both string and array formats)
  const userText =
    lastUserMessage == null
      ? fallbackUserText
      : extractUserText(lastUserMessage);

  try {
    // Call our FastAPI backend to get the agent's response
    const backendResponse = await fetch(`${BACKEND_URL}/api/chat`, {
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

    const data = await backendResponse.json();
    const agentReply = data.reply || "No response from the agent.";

    return toTextStreamResponse(agentReply);
  } catch (error) {
    console.error("Error calling PermitPulse backend:", error);

    const message =
      error instanceof Error
        ? `Sorry, I encountered an error connecting to the PermitPulse backend.\n\n${error.message}`
        : "Sorry, I encountered an error connecting to the PermitPulse backend.";

    return toTextStreamResponse(message);
  }
}
