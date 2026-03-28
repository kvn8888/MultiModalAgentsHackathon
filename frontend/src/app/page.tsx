/**
 * page.tsx — Main page of the PermitPulse app.
 *
 * Uses a split-pane layout:
 *   - Left: Chat interface (the Q&A layer)
 *   - Right: Live data panel (the intelligence layer)
 *
 * The split layout transforms PermitPulse from "a chatbot with a knowledge
 * base" into "a regulatory intelligence research tool" — the chat is where
 * you ask questions, the panel is where you see the data the agent found.
 */

import { Assistant } from "@/components/Assistant";
import { ProactiveIntelFeed } from "@/components/ProactiveIntelFeed";

export default function Home() {
  return (
    <div className="flex flex-col h-screen bg-white dark:bg-zinc-950">
      {/* Header bar with product branding */}
      <header className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-6 py-3">
        <div className="flex items-center gap-3">
          {/* Pulse icon — animated concentric circles */}
          <div className="relative flex h-8 w-8 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex h-5 w-5 rounded-full bg-blue-500" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              PermitPulse
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              SF Regulatory Intelligence Agent
            </p>
          </div>
        </div>

        {/* Right side: status + proactive intel feed */}
        <div className="flex items-center gap-3 text-xs text-zinc-400">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
            <span>Live — DataSF</span>
          </span>
          <ProactiveIntelFeed />
        </div>
      </header>

      {/* Split layout: chat + intelligence panel */}
      <main className="flex flex-1 overflow-hidden">
        <Assistant />
      </main>
    </div>
  );
}
