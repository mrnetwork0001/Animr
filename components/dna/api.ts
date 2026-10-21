import { skipToken, useQuery } from "@tanstack/react-query";
import type {
  ChogSnapshot,
  ChogStanding,
  Genome,
  PopulationResponse,
  ReplayResult,
  ReplayWindow,
  TraitAlphaRow,
} from "@/lib/dna/types";
import { type WindowKey, chogNumberLabel } from "./shared";

// Client side of the /api/dna/* contract (lib/dna/types.ts). Everything is cacheable and public:
// results only change when the candles or the genome version do.

export type GenomeResponse = {
  chog: ChogSnapshot;
  genome: Genome;
  /** Its persona name ("Silver Whiskers"), computed on the server from the raw traits. */
  personaName?: string;
};
export type TraitAlphaResponse = { genomeVersion: string; window: ReplayWindow; rows: TraitAlphaRow[] };

export class DnaApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function getJson<T>(url: string, isValid: (body: T) => boolean): Promise<T> {
  const res = await fetch(url);
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const error = (body as { error?: unknown } | null)?.error;
    throw new DnaApiError(typeof error === "string" ? error : `Request failed (HTTP ${res.status})`, res.status);
  }
  if (!body || !isValid(body as T)) throw new DnaApiError(`Unexpected response from ${url.split("?")[0]}`, res.status);
  return body as T;
}

// 4xx answers (unknown Chog, bad window) won't change on a retry.
const retry = (failures: number, error: Error) =>
  failures < 2 && !(error instanceof DnaApiError && error.status >= 400 && error.status < 500);

const STALE = 10 * 60_000;

export const dnaKeys = {
  genome: (tokenId: number) => ["dna", "genome", tokenId] as const,
  replay: (tokenId: number, window: WindowKey) => ["dna", "replay", tokenId, window] as const,
  population: (window: WindowKey) => ["dna", "population", window] as const,
  standing: (tokenId: number, window: WindowKey, since?: string) => ["dna", "standing", tokenId, window, since ?? ""] as const,
  traits: (window: WindowKey) => ["dna", "traits", window] as const,
};

/** GET /api/dna/[tokenId] -> { chog, genome, personaName }. Pass undefined to skip. */
export function useGenome(tokenId: number | undefined) {
  return useQuery({
    queryKey: dnaKeys.genome(tokenId ?? 0),
    queryFn:
      tokenId === undefined
        ? skipToken
        : () => getJson<GenomeResponse>(`/api/dna/${tokenId}`, (b) => Array.isArray(b.genome?.genes) && !!b.chog),
    staleTime: Infinity,
    retry,
  });
}

/**
 * A Chog's display name: its persona name ("Silver Whiskers") once its DNA loads, else its marketplace name
 * ("CHOG #1312", from `nameNumbers[id - 1]`). Shares the genome query, so it's usually cached already.
 */
export function useChogName(tokenId: number | undefined, nameNumbers?: readonly number[] | null): string {
  const { data } = useGenome(tokenId);
  if (tokenId === undefined) return "";
  return data?.personaName || chogNumberLabel(tokenId, nameNumbers);
}

/** GET /api/dna/[tokenId]/replay?window= -> ReplayResult. Pass undefined to skip. */
export function useReplay(tokenId: number | undefined, window: WindowKey) {
  return useQuery({
    queryKey: dnaKeys.replay(tokenId ?? 0, window),
    queryFn:
      tokenId === undefined
        ? skipToken
        : () =>
            getJson<ReplayResult>(
              `/api/dna/${tokenId}/replay?window=${window}`,
              (b) => Array.isArray(b.points) && Array.isArray(b.trades),
            ),
    staleTime: STALE,
    retry,
  });
}

/** GET /api/dna/population?window= -> all 1,969 Chogs ranked (~0.5 MB before compression). */
export function usePopulation(window: WindowKey, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: dnaKeys.population(window),
    queryFn: () =>
      getJson<PopulationResponse>(`/api/dna/population?window=${window}`, (b) => Array.isArray(b.rows) && !!b.stats),
    staleTime: STALE,
    retry,
    enabled,
  });
}

/**
 * GET /api/dna/[tokenId]/standing?window=[&since=] -> one Chog's league row (rank, edge, archetype), plus
 * its instinct since `since` (ISO) for "Brain vs Instinct". Pass undefined to skip.
 */
export function useStanding(tokenId: number | undefined, window: WindowKey, since?: string) {
  return useQuery({
    queryKey: dnaKeys.standing(tokenId ?? 0, window, since),
    queryFn:
      tokenId === undefined
        ? skipToken
        : () =>
            getJson<ChogStanding>(
              `/api/dna/${tokenId}/standing?window=${window}${since ? `&since=${encodeURIComponent(since)}` : ""}`,
              (b) => !!b.row && typeof b.total === "number",
            ),
    staleTime: STALE,
    retry,
  });
}

/** GET /api/dna/traits?window= -> the Trait Alpha index. */
export function useTraitAlpha(window: WindowKey) {
  return useQuery({
    queryKey: dnaKeys.traits(window),
    queryFn: () => getJson<TraitAlphaResponse>(`/api/dna/traits?window=${window}`, (b) => Array.isArray(b.rows)),
    staleTime: STALE,
    retry,
  });
}
