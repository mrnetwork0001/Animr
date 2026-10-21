import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ChatResponse,
  HallOfFameEntry,
  HeistCounters,
  HeistState,
  ProofResponse,
} from "@/lib/heist/types";

// Client for the /api/heist contract in lib/heist/types.ts, as react-query hooks.

export class HeistApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const isObject = (body: unknown): body is Record<string, unknown> => typeof body === "object" && body !== null;

async function request<T>(url: string, init: RequestInit | undefined, valid: (body: unknown) => boolean): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const error = isObject(body) && typeof body.error === "string" ? body.error : undefined;
    throw new HeistApiError(error ?? `Request failed (HTTP ${res.status})`, res.status);
  }
  if (!valid(body)) throw new HeistApiError(`Unexpected response from ${url}`, res.status);
  return body as T;
}

const postJson = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export const heistKeys = { state: ["heist", "state"] as const };

export function useHeistState() {
  return useQuery({
    queryKey: heistKeys.state,
    queryFn: () =>
      request<HeistState>("/api/heist", undefined, (b) => isObject(b) && isObject(b.house) && isObject(b.counters)),
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
}

/** Fired on window after every heist attempt, with the fresh counters as `detail` (the nav's badge listens). */
export const HEIST_ATTEMPT_EVENT = "animr:heist-attempt";

/** Keeps the page's counters, and the nav's "tries today" badge, in step with the latest response. */
function useCountersUpdate() {
  const queryClient = useQueryClient();
  return (counters: HeistCounters) => {
    queryClient.setQueryData<HeistState>(heistKeys.state, (state) => (state ? { ...state, counters } : state));
    window.dispatchEvent(new CustomEvent<HeistCounters>(HEIST_ATTEMPT_EVENT, { detail: counters }));
  };
}

export function useSendMessage() {
  const setCounters = useCountersUpdate();
  return useMutation({
    mutationFn: (input: { sessionId: string | null; message: string; recipient?: string }) =>
      request<ChatResponse>(
        "/api/heist/chat",
        postJson({ ...(input.sessionId && { sessionId: input.sessionId }), message: input.message, recipient: input.recipient }),
        (b) => isObject(b) && typeof b.sessionId === "string" && isObject(b.defender),
      ),
    onSuccess: (response) => setCounters(response.counters),
  });
}

export function useActAsAi() {
  const setCounters = useCountersUpdate();
  return useMutation({
    mutationFn: (recipient?: string) =>
      request<ProofResponse>("/api/heist/proof", postJson({ recipient }), (b) => isObject(b) && isObject(b.proof)),
    onSuccess: (response) => setCounters(response.counters),
  });
}

export function useSubmitToWall() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { sessionId: string; nickname: string }) =>
      request<{ entry: HallOfFameEntry }>("/api/heist/hall-of-fame", postJson(input), (b) => isObject(b) && isObject(b.entry)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: heistKeys.state }),
  });
}

/** One short sentence for a failed request; the API's own message wins when it sent one. */
export function heistErrorMessage(error: unknown): string {
  if (error instanceof HeistApiError && !error.message.startsWith("Request failed")) return error.message;
  if (error instanceof HeistApiError && error.status === 429) return "Easy there. Try again in a moment.";
  return "Couldn't reach the House Chog. Try again.";
}
