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
import { KeyRoundIcon, Settings2Icon } from "lucide-react";

const GEMINI_KEY_STORAGE_KEY = "permitpulse.geminiApiKey";

export function Assistant() {
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [isHydrated, setIsHydrated] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    const savedKey = window.localStorage.getItem(GEMINI_KEY_STORAGE_KEY) ?? "";
    setGeminiApiKey(savedKey);
    setInputValue(savedKey);
    setIsHydrated(true);
  }, []);

  const runtime = useChatRuntime({
    transport: new TextStreamChatTransport({
      api: "/api/chat",
      body: geminiApiKey ? { geminiApiKey } : {},
    }),
  });

  const saveKey = () => {
    const trimmed = inputValue.trim();
    window.localStorage.setItem(GEMINI_KEY_STORAGE_KEY, trimmed);
    setGeminiApiKey(trimmed);
    setIsExpanded(false);
  };

  const clearKey = () => {
    window.localStorage.removeItem(GEMINI_KEY_STORAGE_KEY);
    setGeminiApiKey("");
    setInputValue("");
    setIsExpanded(true);
  };

  const hasKey = isHydrated && geminiApiKey.length > 0;

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="flex h-full flex-col">
        {/* Key banner — compact when key is saved, expanded when editing */}
        {(!hasKey || isExpanded) ? (
          <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/60">
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 md:flex-row md:items-center">
              <div className="flex-1">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  Gemini API Key
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Stored only in this browser.
                </p>
              </div>
              <div className="flex flex-1 flex-col gap-2 md:max-w-2xl md:flex-row">
                <input
                  type="password"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveKey()}
                  placeholder="Paste Gemini API key"
                  className="h-10 flex-1 rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none transition focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  autoFocus={isExpanded}
                />
                <div className="flex gap-2">
                  <Button type="button" onClick={saveKey} disabled={!isHydrated || !inputValue.trim()}>
                    Save Key
                  </Button>
                  {hasKey && (
                    <Button type="button" variant="outline" onClick={() => setIsExpanded(false)}>
                      Cancel
                    </Button>
                  )}
                  {hasKey && (
                    <Button type="button" variant="outline" onClick={clearKey}>
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="border-b border-zinc-200 bg-zinc-50/60 px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900/40">
            <div className="mx-auto flex w-full max-w-5xl items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500">
                <KeyRoundIcon className="size-3" />
                <span>Gemini API key configured</span>
              </div>
              <button
                onClick={() => { setInputValue(geminiApiKey); setIsExpanded(true); }}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
              >
                <Settings2Icon className="size-3" />
                Change
              </button>
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1">
          <Thread />
        </div>
      </div>
    </AssistantRuntimeProvider>
  );
}
