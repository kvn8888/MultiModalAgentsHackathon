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

export async function POST(req: Request) {
  // Parse the incoming AI SDK request — contains the full message history
  const { messages } = await req.json();

  // Extract the latest user message to send to our Python agent
  const lastUserMessage = messages
    .filter((m: { role: string }) => m.role === "user")
    .pop();

  if (!lastUserMessage) {
    return new Response("No user message found", { status: 400 });
  }

  // Get the text content from the message (handles both string and array formats)
  const userText =
    typeof lastUserMessage.content === "string"
      ? lastUserMessage.content
      : lastUserMessage.content
          .filter((p: { type: string }) => p.type === "text")
          .map((p: { text: string }) => p.text)
          .join("\n");

  try {
    // Call our FastAPI backend to get the agent's response
    const backendResponse = await fetch(`${BACKEND_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: userText }),
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
