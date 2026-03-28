/**
 * PermitCard.tsx — A styled card displaying a single building permit.
 *
 * Shows the permit number, address, status badge (color-coded), estimated
 * cost, description, and filed date.  Used in the LiveDataPanel to display
 * permits fetched in real time by the agent, and is visually distinct from
 * a plain markdown table — making PermitPulse feel like a domain product
 * rather than a generic chatbot.
 */

"use client";

import type { Permit } from "@/lib/agent-store";
import {
  FileTextIcon,
  MapPinIcon,
  DollarSignIcon,
  CalendarIcon,
} from "lucide-react";

// ── Status badge color mapping ───────────────────────────────────────────────
// Each permit status gets a distinctive color scheme so users can scan quickly.
const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  issued: {
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    text: "text-emerald-700 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  complete: {
    bg: "bg-blue-50 dark:bg-blue-950/30",
    text: "text-blue-700 dark:text-blue-400",
    dot: "bg-blue-500",
  },
  filed: {
    bg: "bg-amber-50 dark:bg-amber-950/30",
    text: "text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  approved: {
    bg: "bg-violet-50 dark:bg-violet-950/30",
    text: "text-violet-700 dark:text-violet-400",
    dot: "bg-violet-500",
  },
  expired: {
    bg: "bg-red-50 dark:bg-red-950/30",
    text: "text-red-700 dark:text-red-400",
    dot: "bg-red-500",
  },
  cancelled: {
    bg: "bg-zinc-100 dark:bg-zinc-800/50",
    text: "text-zinc-500 dark:text-zinc-400",
    dot: "bg-zinc-400",
  },
  revoked: {
    bg: "bg-red-50 dark:bg-red-950/30",
    text: "text-red-700 dark:text-red-400",
    dot: "bg-red-500",
  },
};

// ── Default color for unknown statuses ───────────────────────────────────────
const DEFAULT_STATUS_COLOR = {
  bg: "bg-zinc-50 dark:bg-zinc-900/50",
  text: "text-zinc-600 dark:text-zinc-400",
  dot: "bg-zinc-400",
};

/** Format a dollar amount for display (e.g. "$1,250,000") */
function formatCost(cost: string | number | undefined): string | null {
  if (cost == null || cost === "" || cost === "0") return null;
  const num = typeof cost === "string" ? parseFloat(cost) : cost;
  if (isNaN(num) || num === 0) return null;
  return "$" + num.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/** Build a one-line address from permit fields */
function formatAddress(permit: Permit): string {
  const parts = [
    permit.street_number,
    permit.street_name,
    permit.street_suffix,
  ].filter(Boolean);
  return parts.join(" ") || "Address unavailable";
}

/** Format a date string to a shorter display format */
function formatDate(dateStr: string | undefined): string | null {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export function PermitCard({ permit }: { permit: Permit }) {
  // Normalize the status string for color lookup
  const statusRaw = (permit.status ?? "unknown").toLowerCase();
  const statusColors = STATUS_COLORS[statusRaw] ?? DEFAULT_STATUS_COLOR;

  const address = formatAddress(permit);
  const cost = formatCost(permit.estimated_cost);
  const filedDate = formatDate(permit.filed_date);
  const description = permit.description
    ? permit.description.length > 120
      ? permit.description.slice(0, 120) + "…"
      : permit.description
    : null;

  return (
    <div className="group rounded-xl border border-zinc-200 bg-white p-3 transition-all hover:border-zinc-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80 dark:hover:border-zinc-700">
      {/* Top row: permit number + status badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500">
          <FileTextIcon className="size-3" />
          <span className="font-mono">{permit.permit_number ?? "—"}</span>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${statusColors.bg} ${statusColors.text}`}
        >
          <span className={`size-1.5 rounded-full ${statusColors.dot}`} />
          {permit.status ?? "Unknown"}
        </span>
      </div>

      {/* Address */}
      <div className="mt-2 flex items-center gap-1.5">
        <MapPinIcon className="size-3 shrink-0 text-zinc-400" />
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
          {address}
        </span>
      </div>

      {/* Description (if available) */}
      {description && (
        <p className="mt-1.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400 line-clamp-2">
          {description}
        </p>
      )}

      {/* Bottom row: cost + date */}
      <div className="mt-2 flex items-center gap-3 text-xs text-zinc-400 dark:text-zinc-500">
        {cost && (
          <span className="flex items-center gap-1 font-medium text-zinc-600 dark:text-zinc-300">
            <DollarSignIcon className="size-3" />
            {cost}
          </span>
        )}
        {filedDate && (
          <span className="flex items-center gap-1">
            <CalendarIcon className="size-3" />
            {filedDate}
          </span>
        )}
        {permit.neighborhoods_analysis_boundaries && (
          <span className="ml-auto text-[10px] text-zinc-300 dark:text-zinc-600">
            {permit.neighborhoods_analysis_boundaries}
          </span>
        )}
      </div>
    </div>
  );
}
