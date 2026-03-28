/**
 * app/api/stats/route.ts — Proxy for the backend /api/stats endpoint.
 *
 * The frontend calls /api/stats on mount to seed the KB counter with the
 * real server-side count (permits_ingested, violations_ingested, etc.).
 * This proxy avoids CORS issues by routing through the Next.js server,
 * which can reach the internal FastAPI backend.
 */

// URL of the Python backend — same constant as the chat route
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export async function GET() {
  try {
    // Forward the request to the FastAPI stats endpoint
    const res = await fetch(`${BACKEND_URL}/api/stats`, {
      // Short cache: ok for stats to be a few seconds stale
      next: { revalidate: 30 },
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: "backend unavailable" }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    // Return a safe zero-state so the frontend doesn't crash if backend is down
    return new Response(
      JSON.stringify({ permits_ingested: 0, violations_ingested: 0, queries_handled: 0, total_records: 0 }),
      { headers: { "Content-Type": "application/json" } }
    );
  }
}
