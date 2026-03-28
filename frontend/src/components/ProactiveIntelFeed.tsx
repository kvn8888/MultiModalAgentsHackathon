/**
 * ProactiveIntelFeed.tsx — Background intelligence activity indicator.
 *
 * Shows a compact feed of what the agent has been doing proactively —
 * startup seeding, background indexing, query-driven ingestion.  This
 * signals that PermitPulse is "always watching" rather than just
 * responding to questions.
 *
 * Rendered in the header area, showing the most recent intel events
 * with timestamps and animated transitions.
 */

"use client";

import { useAgentStore } from "@/lib/agent-store";
import {
  BrainCircuitIcon,
  DatabaseIcon,
  SearchIcon,
  DownloadIcon,
  SparklesIcon,
} from "lucide-react";

// Icon mapping for different intel event types
const EVENT_ICONS: Record<string, React.ElementType> = {
  seed: DownloadIcon,
  fetch: DatabaseIcon,
  ingest: SparklesIcon,
  search: SearchIcon,
};

/** Format a timestamp as a relative time string (e.g. "2m ago") */
function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function ProactiveIntelFeed() {
  // Subscribe to the full feed + indexed count from the store.
  // IMPORTANT: do NOT call .slice() inside the selector — that creates a new
  // array reference on every render, causing zustand's strict-equality check
  // to think state changed → infinite re-render loop.
  const intelFeed = useAgentStore((s) => s.intelFeed);
  const totalIndexed = useAgentStore((s) => s.totalRecordsIndexed);

  // Derive the display slice outside the selector (safe: only runs per render)
  const feed = intelFeed.slice(0, 3);

  if (feed.length === 0) return null;

  return (
    <div className="flex items-center gap-3">
      {/* KB growth counter */}
      <div className="flex items-center gap-1.5 border-l border-zinc-200 pl-3 dark:border-zinc-700">
        <BrainCircuitIcon className="size-3.5 text-violet-500" />
        <div className="flex flex-col">
          <span className="text-xs font-semibold tabular-nums text-zinc-600 dark:text-zinc-300">
            {(20 + totalIndexed).toLocaleString()}
          </span>
          <span className="text-[9px] text-zinc-400">KB records</span>
        </div>
      </div>

      {/* Latest intel event */}
      <div className="hidden md:flex items-center gap-1.5 border-l border-zinc-200 pl-3 dark:border-zinc-700">
        {feed.slice(0, 1).map((event, i) => {
          const Icon = EVENT_ICONS[event.type] ?? SparklesIcon;
          return (
            <div
              key={i}
              className="flex items-center gap-1.5 animate-in fade-in slide-in-from-right-2 duration-300"
            >
              <Icon className="size-3 text-zinc-400" />
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 max-w-[200px] truncate">
                {event.message}
              </span>
              <span className="text-[9px] text-zinc-300 dark:text-zinc-600">
                {timeAgo(event.timestamp)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
