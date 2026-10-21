import type { LeaderboardResponse } from "@/lib/agent/types";

/** react-query key for GET /api/leaderboard; every view of it shares one cache entry. */
export const leaderboardKey = ["/api/leaderboard"] as const;

/** GET /api/leaderboard, for the leaderboard table and the dashboard's "Awake now" row. */
export async function fetchLeaderboard(): Promise<LeaderboardResponse> {
  const res = await fetch("/api/leaderboard", { cache: "no-store" });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const error = (body as { error?: unknown } | null)?.error;
    throw new Error(typeof error === "string" ? error : `Request failed (HTTP ${res.status})`);
  }
  if (!body || !Array.isArray((body as LeaderboardResponse).agents)) {
    throw new Error("Unexpected response from /api/leaderboard");
  }
  return body as LeaderboardResponse;
}
