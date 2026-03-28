/**
 * LiveDataPanel.tsx — Right-side intelligence panel.
 *
 * This panel sits beside the chat and displays:
 *   1. Session statistics (queries made, records fetched, KB size)
 *   2. Live agent activity steps as they execute (streaming)
 *   3. Permit/violation cards fetched during this session
 *
 * It transforms PermitPulse from "a chatbot" into "a research tool" by
 * making the agent's data-fetching visible in real time, separate from
 * the conversational Q&A layer.
 */

"use client";

import { useAgentStore } from "@/lib/agent-store";
import { PermitCard } from "@/components/PermitCard";
import {
  ActivityIcon,
  DatabaseIcon,
  SearchIcon,
  AlertTriangleIcon,
  FileTextIcon,
  BrainCircuitIcon,
  Loader2Icon,
  ZapIcon,
} from "lucide-react";

// ── Tool icon mapping (for activity steps) ───────────────────────────────────
const TOOL_ICONS: Record<string, { icon: React.ElementType; color: string }> = {
  tool_fetch_permits: { icon: DatabaseIcon, color: "text-blue-500" },
  tool_search_knowledge: { icon: SearchIcon, color: "text-violet-500" },
  tool_fetch_violations: { icon: AlertTriangleIcon, color: "text-amber-500" },
  tool_fetch_permit_details: { icon: FileTextIcon, color: "text-emerald-500" },
};

const DEFAULT_TOOL_ICON = { icon: ZapIcon, color: "text-zinc-400" };

export function LiveDataPanel() {
  // Subscribe to the global agent store for real-time updates
  const steps = useAgentStore((s) => s.steps);
  const permits = useAgentStore((s) => s.permits);
  const violations = useAgentStore((s) => s.violations);
  const isProcessing = useAgentStore((s) => s.isProcessing);
  const sessionQueryCount = useAgentStore((s) => s.sessionQueryCount);
  const totalRecordsFetched = useAgentStore((s) => s.totalRecordsFetched);
  const totalRecordsIndexed = useAgentStore((s) => s.totalRecordsIndexed);

  const hasData = permits.length > 0 || violations.length > 0 || steps.length > 0;

  return (
    <div className="flex h-full flex-col border-l border-zinc-200 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-950/50">
      {/* Panel header */}
      <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <BrainCircuitIcon className="size-4 text-blue-500" />
        <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
          Intelligence Panel
        </span>
        {isProcessing && (
          <Loader2Icon className="ml-auto size-3.5 animate-spin text-blue-500" />
        )}
      </div>

      {/* Session stats bar */}
      <div className="grid grid-cols-3 gap-px border-b border-zinc-200 bg-zinc-200 dark:border-zinc-800 dark:bg-zinc-800">
        <StatCell label="Queries" value={sessionQueryCount} />
        <StatCell label="Fetched" value={totalRecordsFetched} />
        <StatCell label="Indexed" value={totalRecordsIndexed} />
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto">
        {/* Live activity steps */}
        {steps.length > 0 && (
          <div className="border-b border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center gap-1.5 px-4 py-2">
              <ActivityIcon className="size-3 text-zinc-400" />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
                Agent Activity
              </span>
            </div>
            <div className="flex flex-col gap-px px-2 pb-2">
              {steps.map((step, i) => {
                const toolConfig = TOOL_ICONS[step.tool] ?? DEFAULT_TOOL_ICON;
                const Icon = toolConfig.icon;
                const isRunning = step.status === "running";
                const isError = step.status === "error";

                return (
                  <div
                    key={i}
                    className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-all ${
                      isRunning
                        ? "bg-blue-50 dark:bg-blue-950/30"
                        : isError
                          ? "bg-red-50 dark:bg-red-950/30"
                          : "bg-transparent"
                    } ${
                      // Animate new steps sliding in from below
                      "animate-in fade-in slide-in-from-bottom-1 duration-200"
                    }`}
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    {/* Spinning loader for running steps, static icon for complete */}
                    {isRunning ? (
                      <Loader2Icon className="size-3.5 shrink-0 animate-spin text-blue-500" />
                    ) : (
                      <Icon className={`size-3.5 shrink-0 ${toolConfig.color}`} />
                    )}
                    <span
                      className={`flex-1 ${
                        isRunning
                          ? "text-blue-600 dark:text-blue-400"
                          : isError
                            ? "text-red-600 dark:text-red-400"
                            : "text-zinc-600 dark:text-zinc-400"
                      }`}
                    >
                      {step.label}
                    </span>
                    {step.count != null && step.status === "complete" && (
                      <span className="tabular-nums text-zinc-400">
                        {step.count}
                      </span>
                    )}
                    {step.red_flags != null && step.red_flags > 0 && (
                      <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 dark:bg-red-900/30 dark:text-red-400">
                        {step.red_flags} ⚠
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Permit cards */}
        {permits.length > 0 && (
          <div className="border-b border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center gap-1.5 px-4 py-2">
              <DatabaseIcon className="size-3 text-blue-400" />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
                Permits ({permits.length})
              </span>
            </div>
            <div className="flex flex-col gap-2 px-2 pb-3">
              {permits.slice(0, 20).map((permit, i) => (
                <div
                  key={`permit-${i}`}
                  className="animate-in fade-in slide-in-from-right-2 duration-300"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <PermitCard permit={permit} />
                </div>
              ))}
              {permits.length > 20 && (
                <p className="px-2 text-xs text-zinc-400">
                  +{permits.length - 20} more permits
                </p>
              )}
            </div>
          </div>
        )}

        {/* Violations summary */}
        {violations.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 px-4 py-2">
              <AlertTriangleIcon className="size-3 text-amber-400" />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
                Violations ({violations.length})
              </span>
            </div>
            <div className="flex flex-col gap-1 px-2 pb-3">
              {violations.slice(0, 15).map((v, i) => (
                <div
                  key={`violation-${i}`}
                  className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50/50 p-2 text-xs dark:border-amber-900/30 dark:bg-amber-950/20 animate-in fade-in slide-in-from-right-2 duration-300"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <AlertTriangleIcon className="mt-0.5 size-3 shrink-0 text-amber-500" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-zinc-700 dark:text-zinc-300 truncate">
                      {v.complaint_number ?? "Unknown"}{" "}
                      {v.nov_category_description && (
                        <span className="font-normal text-zinc-500">
                          — {v.nov_category_description}
                        </span>
                      )}
                    </p>
                    {/* Red flag badges */}
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(v.work_without_permit === "true" || v.work_without_permit === true) && (
                        <span className="rounded bg-red-100 px-1 py-0.5 text-[9px] font-bold text-red-700 dark:bg-red-900/40 dark:text-red-400">
                          NO PERMIT
                        </span>
                      )}
                      {(v.unsafe_building === "true" || v.unsafe_building === true) && (
                        <span className="rounded bg-red-100 px-1 py-0.5 text-[9px] font-bold text-red-700 dark:bg-red-900/40 dark:text-red-400">
                          UNSAFE
                        </span>
                      )}
                      {(v.expired_permit === "true" || v.expired_permit === true) && (
                        <span className="rounded bg-orange-100 px-1 py-0.5 text-[9px] font-bold text-orange-700 dark:bg-orange-900/40 dark:text-orange-400">
                          EXPIRED
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!hasData && (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
              <BrainCircuitIcon className="size-6 text-zinc-300 dark:text-zinc-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                No data yet
              </p>
              <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                Ask a question and watch live data appear here as the agent
                fetches permits and violations in real time.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Stat cell sub-component ──────────────────────────────────────────────────

function StatCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center gap-0.5 bg-white px-3 py-2 dark:bg-zinc-950">
      <span className="text-lg font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">
        {value.toLocaleString()}
      </span>
      <span className="text-[10px] uppercase tracking-wider text-zinc-400">
        {label}
      </span>
    </div>
  );
}
