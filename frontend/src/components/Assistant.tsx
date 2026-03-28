/**
 * Assistant.tsx — The main chat interface component for PermitPulse.
 *
 * Uses assistant-ui's Thread component with an AI SDK runtime.
 * The runtime connects to our Next.js API route (/api/chat) which
 * proxies requests to the Python FastAPI backend.
 *
 * This is a client component because assistant-ui manages state on the client.
 */

"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/react-ai-sdk";
import { Thread } from "@/components/assistant-ui/thread";
import { TextStreamChatTransport } from "ai";

export function Assistant() {
  // Create a chat runtime that sends messages to our API route.
  // TextStreamChatTransport matches since the route returns toTextStreamResponse().
  const runtime = useChatRuntime({
    transport: new TextStreamChatTransport({ api: "/api/chat" }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Thread />
    </AssistantRuntimeProvider>
  );
}
