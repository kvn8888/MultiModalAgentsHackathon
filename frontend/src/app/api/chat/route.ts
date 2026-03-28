/**
 * app/api/chat/route.ts — Next.js API route that proxies chat requests
 * to the PermitPulse FastAPI backend.
 *
 * assistant-ui sends messages in AI SDK format. This route:
 *   1. Extracts the latest user message from the AI SDK messages array.
 *   2. Forwards it to our FastAPI backend (/api/chat).
 *   3. Converts the response into a streaming format that assistant-ui expects.
 *
 * The AI SDK's streamText is used with a custom provider that wraps our
 * FastAPI backend, so assistant-ui gets a proper streaming experience.
 */

import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";

// Allow up to 60 seconds for the agent to think + fetch data
export const maxDuration = 60;

// URL of our Python FastAPI backend — defaults to localhost:8000 in dev
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

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

    // Use AI SDK's streamText to create a proper streaming response
    // that assistant-ui can consume. We use a system message with the
    // pre-computed answer so the LLM just echoes it back.
    const result = streamText({
      model: openai("gpt-4o-mini"),
      messages: [
        {
          role: "system",
          content: `You are a proxy. Respond with EXACTLY the following text, preserving all formatting, markdown, and line breaks. Do not add anything else:\n\n${agentReply}`,
        },
        {
          role: "user",
          content: "Please provide the response.",
        },
      ],
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error("Error calling PermitPulse backend:", error);

    // Return a streaming error message so assistant-ui can display it
    const result = streamText({
      model: openai("gpt-4o-mini"),
      messages: [
        {
          role: "system",
          content:
            "Respond with: 'Sorry, I encountered an error connecting to the PermitPulse backend. Please make sure the Python server is running on port 8000.'",
        },
        { role: "user", content: "Error" },
      ],
    });

    return result.toTextStreamResponse();
  }
}
