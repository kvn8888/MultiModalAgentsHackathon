/**
 * page.tsx — Main page of the PermitPulse app.
 *
 * Renders a full-screen chat interface powered by assistant-ui.
 * The header shows the PermitPulse branding, and the rest of the
 * viewport is the chat thread where users interact with the agent.
 */

import { Assistant } from "@/components/Assistant";
import { KBCounter } from "@/components/KBCounter";

export default function Home() {
  return (
    <div className="flex flex-col h-screen bg-white dark:bg-zinc-950">
      {/* Header bar with product branding */}
      <header className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-6 py-3">
        <div className="flex items-center gap-3">
          {/* Pulse icon — simple CSS circle with animation */}
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
        {/* Status indicators */}
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
          <span>Live — DataSF connected</span>
          <KBCounter />
        </div>
      </header>

      {/* Chat area — fills remaining viewport height */}
      <main className="flex-1 overflow-hidden">
        <Assistant />
      </main>
    </div>
  );
}
