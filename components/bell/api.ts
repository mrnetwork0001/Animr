import {
  skipToken,
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  BellCallSort,
  BellCallsResponse,
  BellDaysResponse,
  BellStandingsResponse,
  BellSummaryResponse,
  ChogBellResponse,
  FanResponse,
} from "@/lib/bell/types";
import { ringOverdue } from "./format";

// Client for the /api/bell + /api/fan contract in lib/bell/types.ts, as react-query hooks.

export class BellApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export const isNotFound = (error: unknown) => error instanceof BellApiError && error.status === 404;
const retryUnlessNotFound = (failures: number, error: Error) => failures < 2 && !isNotFound(error);

/** One JSON request; any failure (including a missing route) throws a BellApiError for the view's error state. */
async function request<T>(url: string, init: RequestInit | undefined, valid: (body: unknown) => boolean): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const { error, message } = (body ?? {}) as { error?: unknown; message?: unknown };
    const text = typeof error === "string" ? error : typeof message === "string" ? message : undefined;
    throw new BellApiError(text ?? `Request failed (HTTP ${res.status})`, res.status);
  }
  if (!valid(body)) throw new BellApiError(`Unexpected response from ${url.split("?")[0]}`, res.status);
  return body as T;
}

const isObject = (body: unknown): body is Record<string, unknown> => typeof body === "object" && body !== null;
const isSummary = (b: unknown) => isObject(b) && typeof b.day === "string" && Array.isArray(b.histogram);
const isFan = (b: unknown) => isObject(b) && typeof b.fanId === "string";
const isDays = (b: unknown) => isObject(b) && Array.isArray(b.days);
const postJson = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

/** The latest Bell, with `live` (the provisional move since the ring) while it is open. */
export const fetchToday = () =>
  request<BellSummaryResponse>("/api/bell/today", undefined, isSummary);

export const fetchBell = (day: string) =>
  request<BellSummaryResponse>(`/api/bell/${day}`, undefined, isSummary);

/** Every day with a Bell, oldest first: read before asking for a day, so no page requests a day without one. */
export const fetchDays = () => request<BellDaysResponse>("/api/bell/days", undefined, isDays);

export function fetchCalls(day: string, sort: BellCallSort, cursor?: string) {
  const query = new URLSearchParams(cursor ? { sort, cursor } : { sort });
  return request<BellCallsResponse>(
    `/api/bell/${day}/calls?${query}`,
    undefined,
    (b) => isObject(b) && Array.isArray(b.calls),
  );
}

export const fetchChogBell = (tokenId: number) =>
  request<ChogBellResponse>(
    `/api/bell/chog/${tokenId}`,
    undefined,
    (b) => isObject(b) && isObject(b.record),
  );

export const fetchStandings = () =>
  request<BellStandingsResponse>(
    "/api/bell/standings",
    undefined,
    (b) => isObject(b) && Array.isArray(b.chogs) && Array.isArray(b.fans),
  );

export const fetchFan = () => request<FanResponse>("/api/fan", undefined, isFan);

export const bellKeys = {
  today: ["bell", "today"] as const,
  day: (day: string) => ["bell", "day", day] as const,
  calls: (day: string, sort: BellCallSort) => ["bell", "calls", day, sort] as const,
  chog: (tokenId: number) => ["bell", "chog", tokenId] as const,
  standings: ["bell", "standings"] as const,
  days: ["bell", "days"] as const,
  fan: ["fan"] as const,
};

/** The Bell index: every day with a Bell, oldest first. */
export function useBellDays() {
  return useQuery({ queryKey: bellKeys.days, queryFn: fetchDays, staleTime: 5 * 60_000 });
}

/** The latest rung Bell; polls faster while a scheduled ring is overdue (cron jitter). */
export function useTodayBell() {
  return useQuery({
    queryKey: bellKeys.today,
    queryFn: fetchToday,
    refetchInterval: (query) => {
      const day = query.state.data?.day;
      return day && ringOverdue(day, Date.now()) ? 20_000 : 60_000;
    },
    retry: retryUnlessNotFound,
  });
}

const dayQuery = (day: string) => ({
  queryKey: bellKeys.day(day),
  queryFn: () => fetchBell(day),
  staleTime: 5 * 60_000,
  retry: retryUnlessNotFound,
});

export function useBell(day: string | null | undefined) {
  return useQuery({ ...dayQuery(day ?? ""), queryFn: day ? () => fetchBell(day) : skipToken });
}

/** Several Bells at once (past Bells, the replay game); shares the cache with useBell. */
export function useBells(days: string[]) {
  return useQueries({ queries: days.map(dayQuery) });
}

export function useBellCalls(day: string, sort: BellCallSort) {
  return useInfiniteQuery({
    queryKey: bellKeys.calls(day, sort),
    queryFn: ({ pageParam }) => fetchCalls(day, sort, pageParam || undefined),
    initialPageParam: "",
    getNextPageParam: (last) => last.next || undefined,
    staleTime: 60_000,
  });
}

export function useChogBell(tokenId: number | undefined) {
  return useQuery({
    queryKey: bellKeys.chog(tokenId ?? 0),
    queryFn: tokenId ? () => fetchChogBell(tokenId) : skipToken,
    refetchInterval: 60_000,
    retry: retryUnlessNotFound,
  });
}

export function useStandings() {
  return useQuery({ queryKey: bellKeys.standings, queryFn: fetchStandings, staleTime: 60_000, refetchInterval: 300_000 });
}

/** The visitor's fan card; the first GET sets the fan cookie. */
export function useFan() {
  return useQuery({ queryKey: bellKeys.fan, queryFn: fetchFan, staleTime: 30_000 });
}

export function useRide() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (tokenId: number) => {
      // A ride belongs to the fan cookie, which GET /api/fan sets on a first visit.
      await queryClient.ensureQueryData({ queryKey: bellKeys.fan, queryFn: fetchFan });
      return request<FanResponse>("/api/bell/ride", postJson({ tokenId }), isFan);
    },
    onSuccess: (fan) => queryClient.setQueryData(bellKeys.fan, fan),
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: bellKeys.fan });
      void queryClient.invalidateQueries({ queryKey: bellKeys.today });
    },
  });
}

export function useSetNickname() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (nickname: string) =>
      request<FanResponse>("/api/fan", postJson({ nickname }), isFan),
    onSuccess: (fan) => {
      queryClient.setQueryData(bellKeys.fan, fan);
      void queryClient.invalidateQueries({ queryKey: bellKeys.standings });
    },
  });
}

/** A ride failure in plain words; the API's own message wins when it sent one. */
export function rideErrorMessage(error: unknown): string {
  if (error instanceof BellApiError && !error.message.startsWith("Request failed")) return error.message;
  const status = error instanceof BellApiError ? error.status : 0;
  if (status === 409) return "You already ride a Chog at this Bell. One ride per Bell.";
  // The engine books the next Bell once a ride window closes, so these only come from an older server.
  if (status === 403 || status === 410 || status === 423) return "This Bell's rides are locked in. Try again to ride the next one.";
  if (status === 429) return "Easy there. Try again in a moment.";
  return error instanceof Error ? error.message : "Couldn't ride right now.";
}
