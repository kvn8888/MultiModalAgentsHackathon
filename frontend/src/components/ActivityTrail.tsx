"use client";

import { useEffect } from "react";
import {
  DatabaseIcon,
  SearchIcon,
  AlertTriangleIcon,
  FileTextIcon,
  BookmarkCheckIcon,
} from "lucide-react";
import { usePermitStats } from "@/lib/permit-stats";

export interface ActivityStep {
  tool: string;
  label: string;
  status: "complete" | "error";
  count?: number;
  indexed?: number;
  red_flags?: number;
}

const TOOL_CONFIG: Record<
  string,
  { icon: React.ElementType; color: string; bg: string }
> = {
  tool_fetch_permits: {
    icon: DatabaseIcon,
    color: "text-blue-500",
    bg: "bg-blue-50 dark:bg-blue-950/40",
  },
  tool_search_knowledge: {
    icon: SearchIcon,
    color: "text-violet-500",
    bg: "bg-violet-50 dark:bg-violet-950/40",
  },
  tool_fetch_violations: {
    icon: AlertTriangleIcon,
    color: "text-amber-500",
    bg: "bg-amber-50 dark:bg-amber-950/40",
  },
  tool_fetch_permit_details: {
    icon: FileTextIcon,
    color: "text-emerald-500",
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
  },
};

export function ActivityTrail({ steps }: { steps: ActivityStep[] }) {
  const addRecords = usePermitStats((s) => s.addRecords);

  const totalIndexed = steps
    .filter((s) => s.tool === "tool_fetch_permits")
    .reduce((sum, s) => sum + (s.indexed ?? 0), 0);

  // Update global KB counter once when this trail mounts
  useEffect(() => {
    if (totalIndexed > 0) {
      addRecords(totalIndexed);
    }
    // Only run once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!steps.length) return null;

  return (
    <div className="mb-3 overflow-hidden rounded-xl border border-zinc-100 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="flex items-center gap-2 border-b border-zinc-100 px-3 py-1.5 dark:border-zinc-800">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
          Agent Activity
        </span>
        <span className="ml-auto text-[10px] text-zinc-300 dark:text-zinc-600">
          {steps.length} step{steps.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800">
        {steps.map((step, i) => {
          const config = TOOL_CONFIG[step.tool] ?? {
            icon: FileTextIcon,
            color: "text-zinc-400",
            bg: "bg-zinc-50 dark:bg-zinc-900",
          };
          const Icon = config.icon;

          return (
            <div key={i} className="flex items-center gap-3 px-3 py-2">
              <div
                className={`flex size-6 shrink-0 items-center justify-center rounded-md ${config.bg}`}
              >
                <Icon className={`size-3.5 ${config.color}`} />
              </div>
              <span className="flex-1 text-xs text-zinc-600 dark:text-zinc-400">
                {step.label}
              </span>
              <div className="flex items-center gap-1.5">
                {step.count != null && (
                  <span className="text-xs tabular-nums text-zinc-400 dark:text-zinc-500">
                    {step.count}{" "}
                    {step.tool === "tool_fetch_violations"
                      ? "violations"
                      : "records"}
                  </span>
                )}
                {step.red_flags != null && step.red_flags > 0 && (
                  <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 dark:bg-red-900/30 dark:text-red-400">
                    {step.red_flags} red flag
                    {step.red_flags !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {totalIndexed > 0 && (
          <div className="flex items-center gap-3 bg-emerald-50/60 px-3 py-2 dark:bg-emerald-950/20">
            <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-emerald-100 dark:bg-emerald-900/40">
              <BookmarkCheckIcon className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <span className="flex-1 text-xs text-emerald-700 dark:text-emerald-400">
              {totalIndexed} new records added to knowledge base
            </span>
            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
              KB growing
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
