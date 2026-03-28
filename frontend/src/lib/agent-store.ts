/**
 * agent-store.ts — Global zustand store for real-time agent state.
 *
 * Tracks live activity steps, fetched permits, violations, and session
 * statistics.  Components across the app subscribe to this store to show
 * the agent's work in real time — the data panel, activity trail, header
 * counters, etc.
 *
 * The store is populated by the SSE consumer in route.ts (indirectly via
 * the AssistantMessage component parsing embedded markers from the text
 * stream) and by explicit pushes from the chat hook.
 */

import { create } from "zustand";

// ── Types ────────────────────────────────────────────────────────────────────

/** A single step in the agent's processing pipeline */
export interface AgentStep {
  tool: string;                          // Tool function name (e.g. "tool_fetch_permits")
  status: "running" | "complete" | "error"; // Current execution status
  label: string;                         // Human-readable description
  count?: number;                        // Number of records affected
  indexed?: number;                      // How many records were indexed into KB
  red_flags?: number;                    // Number of red-flag violations found
  timestamp: number;                     // When this step was recorded (Date.now())
}

/** A single building permit record from DataSF */
export interface Permit {
  permit_number?: string;
  permit_type?: string;
  permit_type_definition?: string;
  description?: string;
  status?: string;
  status_date?: string;
  filed_date?: string;
  issued_date?: string;
  completed_date?: string;
  estimated_cost?: string | number;
  revised_cost?: string | number;
  existing_use?: string;
  proposed_use?: string;
  street_number?: string;
  street_name?: string;
  street_suffix?: string;
  neighborhoods_analysis_boundaries?: string;
  supervisor_district?: string;
  [key: string]: unknown;               // Allow extra fields from the API
}

/** A violation or complaint record from DataSF */
export interface Violation {
  complaint_number?: string;
  block?: string;
  lot?: string;
  nov_category_description?: string;
  status?: string;
  date_filed?: string;
  work_without_permit?: string | boolean;
  unsafe_building?: string | boolean;
  expired_permit?: string | boolean;
  [key: string]: unknown;
}

/** An entry in the proactive intelligence feed */
export interface IntelEvent {
  message: string;      // e.g. "20 permits indexed from SoMa"
  timestamp: number;    // Date.now()
  type: "seed" | "fetch" | "ingest" | "search"; // Category for icon selection
}

// ── Store ────────────────────────────────────────────────────────────────────

interface AgentStore {
  // Agent processing state
  steps: AgentStep[];
  isProcessing: boolean;

  // Fetched data for the data panel
  permits: Permit[];
  violations: Violation[];

  // Session-wide statistics
  sessionQueryCount: number;
  totalRecordsFetched: number;
  totalRecordsIndexed: number;
  // Server-side base count (fetched from /api/stats on mount)
  // Seeded from the backend so the counter doesn't reset to 20 on every refresh
  baseRecordsIndexed: number;

  // Proactive intelligence feed
  intelFeed: IntelEvent[];

  // Actions
  addStep: (step: Omit<AgentStep, "timestamp">) => void;
  addPermits: (permits: Permit[]) => void;
  addViolations: (violations: Violation[]) => void;
  setProcessing: (v: boolean) => void;
  incrementQueries: () => void;
  addIntelEvent: (event: Omit<IntelEvent, "timestamp">) => void;
  /** Seed from server-side stats so the counter survives page refreshes */
  seedStats: (stats: { total_records: number; queries_handled: number }) => void;
  clearSteps: () => void;
  clearSession: () => void;
}

export const useAgentStore = create<AgentStore>()((set) => ({
  // Initial state
  steps: [],
  isProcessing: false,
  permits: [],
  violations: [],
  sessionQueryCount: 0,
  totalRecordsFetched: 0,
  totalRecordsIndexed: 0,
  baseRecordsIndexed: 0,   // Will be updated by seedStats() on mount
  intelFeed: [
    // Startup seed event — backend ingests 20 permits on boot
    {
      message: "20 recent permits indexed on startup",
      timestamp: Date.now(),
      type: "seed" as const,
    },
  ],

  // ── Mutations ──────────────────────────────────────────────────────────

  addStep: (step) =>
    set((state) => ({
      steps: [...state.steps, { ...step, timestamp: Date.now() }],
    })),

  addPermits: (permits) =>
    set((state) => ({
      permits: [...state.permits, ...permits],
      totalRecordsFetched: state.totalRecordsFetched + permits.length,
      totalRecordsIndexed: state.totalRecordsIndexed + permits.length,
    })),

  addViolations: (violations) =>
    set((state) => ({
      violations: [...state.violations, ...violations],
      totalRecordsFetched: state.totalRecordsFetched + violations.length,
    })),

  setProcessing: (v) => set({ isProcessing: v }),

  incrementQueries: () =>
    set((state) => ({ sessionQueryCount: state.sessionQueryCount + 1 })),

  addIntelEvent: (event) =>
    set((state) => ({
      intelFeed: [{ ...event, timestamp: Date.now() }, ...state.intelFeed].slice(0, 50),
    })),

  // Seed from the /api/stats backend endpoint so the KB counter reflects
  // the real server-side count rather than resetting to the hardcoded base on
  // every page refresh.
  seedStats: (stats) =>
    set({
      baseRecordsIndexed: stats.total_records,
      sessionQueryCount: stats.queries_handled,
    }),

  clearSteps: () => set({ steps: [] }),

  clearSession: () =>
    set({
      steps: [],
      permits: [],
      violations: [],
      sessionQueryCount: 0,
      totalRecordsFetched: 0,
      totalRecordsIndexed: 0,
      intelFeed: [],
    }),
}));
