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

import { useEffect, useState } from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/react-ai-sdk";
import { Thread } from "@/components/assistant-ui/thread";
import { TextStreamChatTransport } from "ai";
import { Button } from "@/components/ui/button";

const GEMINI_KEY_STORAGE_KEY = "permitpulse.geminiApiKey";

export function Assistant() {
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const savedKey = window.localStorage.getItem(GEMINI_KEY_STORAGE_KEY) ?? "";
    setGeminiApiKey(savedKey);
    setIsHydrated(true);
  }, []);

  // Create a chat runtime that sends messages to our API route.
  // TextStreamChatTransport matches since the route returns toTextStreamResponse().
  const runtime = useChatRuntime({
    transport: new TextStreamChatTransport({
      api: "/api/chat",
      body: geminiApiKey ? { geminiApiKey } : {},
    }),
  });

  const saveKey = () => {
    window.localStorage.setItem(GEMINI_KEY_STORAGE_KEY, geminiApiKey.trim());
    setGeminiApiKey(geminiApiKey.trim());
  };

  const clearKey = () => {
    window.localStorage.removeItem(GEMINI_KEY_STORAGE_KEY);
    setGeminiApiKey("");
  };

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="flex h-full flex-col">
        <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/60">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 md:flex-row md:items-center">
            <div className="flex-1">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Runtime Gemini Key
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Stored only in this browser and sent with each chat request.
              </p>
            </div>
            <div className="flex flex-1 flex-col gap-2 md:max-w-2xl md:flex-row">
              <input
                type="password"
                value={geminiApiKey}
                onChange={(event) => setGeminiApiKey(event.target.value)}
                placeholder="Paste Gemini API key"
                className="h-10 flex-1 rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none transition focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <div className="flex gap-2">
                <Button type="button" onClick={saveKey} disabled={!isHydrated}>
                  Save Key
                </Button>
                <Button type="button" variant="outline" onClick={clearKey}>
                  Clear
                </Button>
              </div>
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1">
          <Thread />
        </div>
      </div>
    </AssistantRuntimeProvider>
  );
}
