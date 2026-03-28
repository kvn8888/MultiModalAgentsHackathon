"use client";

import { usePermitStats } from "@/lib/permit-stats";

export function KBCounter() {
  const kbRecords = usePermitStats((s) => s.kbRecords);

  return (
    <span className="flex items-center gap-1.5 text-xs text-zinc-400 border-l border-zinc-200 dark:border-zinc-700 pl-3 ml-1">
      <span className="font-medium tabular-nums text-zinc-500 dark:text-zinc-400">
        {kbRecords.toLocaleString()}
      </span>
      <span>records indexed</span>
    </span>
  );
}
