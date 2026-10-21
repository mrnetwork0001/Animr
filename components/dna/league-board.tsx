"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type CSSProperties, useEffect, useId, useMemo, useState } from "react";
import { useConnection } from "wagmi";
import { PulseIcon, SearchIcon } from "@/components/v2/icons";
import { Badge, EmptyState, GlassCard, SectionTitle, StatRow, pillClass } from "@/components/v2/primitives";
import type { TradingStyle } from "@/lib/agent/types";
import { displayTraitValue } from "@/lib/brand-safety";
import type { PopulationResponse, PopulationRow } from "@/lib/dna/types";
import { useIsClient } from "../connect-button";
import { useHiddenChogs } from "../hidden-chogs";
import { useHoldings } from "../your-chogs";
import { usePopulation } from "./api";
import { ChogThumb } from "./chog-thumb";
import { EdgeBadge } from "./edge-badge";
import { TRAIT_FAMILIES, familyMembers } from "./families";
import { DiceIcon, PlayIcon } from "./icons";
import type { LeagueIndex } from "./league-index";
import {
  CHOG_COUNT,
  IN_SAMPLE_NOTE,
  WINDOW_LABEL,
  type WindowKey,
  chogNumberLabel,
  formatInt,
  parseChogId,
  parseWindow,
  randomChogId,
  signedPct,
  windowDates,
} from "./shared";
import { WindowPicker } from "./window-picker";
import "./dna.css";

const PAGE_SIZE = 50;
const STYLES: TradingStyle[] = ["aggressive", "balanced", "cautious"];
type Sort = "best" | "worst" | "id";
const SORT_LABEL: Record<Sort, string> = { best: "Best first", worst: "Most rekt first", id: "Token ID" };

/**
 * The League's three divisions (lib/dna/types.ts PopulationRow): Unclaimed (nobody claimed it: its trading DNA trades),
 * Claimed (its holder woke an AI on 0G Compute, paper fills at live prices) and Real wallet (that AI trades the real
 * $CHOG in the Chog's own wallet through AnimrTradeGuard). Every division is ranked by the same genome replay.
 */
type Division = "wild" | "claimed" | "real";
const DIVISIONS: { key: Division; label: string; title: string }[] = [
  { key: "wild", label: "Unclaimed", title: "Nobody claimed it yet: it trades on its trading DNA alone" },
  { key: "claimed", label: "Claimed", title: "Its holder woke an AI on 0G Compute (paper fills at live prices)" },
  { key: "real", label: "Real wallet", title: "Its AI trades the real $CHOG in its own wallet through AnimrTradeGuard" },
];
const isDivision = (value: string | null): value is Division => DIVISIONS.some((d) => d.key === value);
const divisionOf = (row: PopulationRow): Division => (row.onchain ? "real" : row.claimed ? "claimed" : "wild");

type Filters = {
  q: string;
  style: TradingStyle | "";
  archetype: string;
  trait: string;
  division: Division | "";
  sort: Sort;
  /** ?id=: one Chog shown in place, on its page of the full ranking and highlighted (cleared by any filter). */
  focus: number | null;
};

function readFilters(params: URLSearchParams): Filters {
  const style = params.get("style") as TradingStyle | null;
  const sort = params.get("sort") as Sort | null;
  const focus = parseChogId(params.get("id"));
  if (focus !== null) return { q: "", style: "", archetype: "", trait: "", division: "", sort: "best", focus };
  const division = params.get("division");
  return {
    q: params.get("q") ?? "",
    style: style && STYLES.includes(style) ? style : "",
    archetype: params.get("archetype") ?? "",
    trait: params.get("trait") ?? "",
    // ?claimed=1 is the old "Claimed only" link.
    division: isDivision(division) ? division : params.get("claimed") === "1" ? "claimed" : "",
    sort: sort && sort in SORT_LABEL ? sort : "best",
    focus: null,
  };
}

/** The query string for a view; the URL mirrors it. */
/** ?page=N (1-based; anything else is page 1), so Back from a Chog returns to the same page. */
function readPage(params: URLSearchParams): number {
  const page = Number(params.get("page"));
  return Number.isInteger(page) && page > 1 && page <= 1000 ? page : 1;
}

function queryOf(filters: Filters, span: WindowKey, page: number): string {
  const next = new URLSearchParams();
  if (filters.focus !== null) next.set("id", String(filters.focus));
  if (filters.q.trim()) next.set("q", filters.q.trim());
  if (filters.style) next.set("style", filters.style);
  if (filters.archetype) next.set("archetype", filters.archetype);
  if (filters.trait) next.set("trait", filters.trait);
  if (filters.division) next.set("division", filters.division);
  if (filters.sort !== "best") next.set("sort", filters.sort);
  if (span !== "45d") next.set("window", span);
  // ?id= opens its own page; otherwise the page past the first is part of the view.
  if (filters.focus === null && page > 1) next.set("page", String(page));
  return next.toString();
}

/**
 * "Eyes:Side Eye" (one value) or "family:laser-eyes" (a trait family) -> who matches, a label and the option id.
 * Values are their shown names ("Eyes:Googly", as Trait Alpha links them; lib/brand-safety.ts).
 */
function traitFilter(
  trait: string,
  index?: LeagueIndex,
): { matches: (tokenId: number) => boolean; label: string; id: string } | null {
  const cut = trait.indexOf(":");
  if (!index || cut < 1) return null;
  const head = trait.slice(0, cut);
  const tail = trait.slice(cut + 1);
  if (head === "family") {
    const family = TRAIT_FAMILIES.find((f) => f.key === tail);
    if (!family) return null;
    const members = familyMembers(index, family);
    return { matches: (tokenId) => members[tokenId - 1] === true, label: family.label, id: trait };
  }
  const type = index.types.indexOf(head);
  // The index holds shown names (league-index.ts); an older link may carry a raw value: read it as its shown name.
  const values = type < 0 ? [] : index.values[type];
  const exact = values.indexOf(tail);
  const value = exact >= 0 ? exact : values.indexOf(displayTraitValue(head, tail));
  if (value < 0) return null;
  return {
    matches: (tokenId) => index.codes[type][tokenId - 1] === value,
    label: `${head}: ${values[value]}`,
    id: `${head}:${values[value]}`,
  };
}

/** "Royal Trend Rider" -> "Trend Rider" when the plain one exists too; otherwise the name itself. */
function baseArchetype(name: string, names: Set<string>): string {
  for (let cut = name.indexOf(" "); cut > 0; cut = name.indexOf(" ", cut + 1)) {
    const rest = name.slice(cut + 1);
    if (names.has(rest)) return rest;
  }
  return name;
}

/** The number a query names exactly: "7", "#7", "Chog #7", "CHOG #1462". */
function numericQuery(q: string): number | null {
  const match = /^(?:chog\s*)?#?\s*(\d{1,5})$/i.exec(q.trim());
  return match ? Number(match[1]) : null;
}

/** The token ids the connected wallet holds (empty when disconnected), for the "Yours" highlight. */
function useMyChogIds(): ReadonlySet<number> {
  const isClient = useIsClient();
  const connection = useConnection();
  const address = isClient && connection.status === "connected" ? connection.address : undefined;
  const holdings = useHoldings(address);
  return useMemo(() => new Set((holdings.data?.chogs ?? []).map((chog) => chog.tokenId)), [holdings.data]);
}

/**
 * The league: all 1,969 Chogs ranked by their genome's simulated edge over holding $CHOG, with search,
 * filters (division, style, archetype, trait), sorting, pagination and a Random Chog button. Filters
 * live in the URL, so /league?trait=Eyes:Side%20Eye is a shareable view.
 */
export function LeagueBoard({ index }: { index?: LeagueIndex }) {
  const router = useRouter();
  const params = useSearchParams();
  const [span, setSpan] = useState<WindowKey>(() => parseWindow(params.get("window")));
  const [filters, setFilters] = useState<Filters>(() => readFilters(params));
  const [page, setPage] = useState(() => readPage(params));
  const population = usePopulation(span);
  const { error, isFetching, refetch } = population;
  // The server renders the loading state; the field above may have filled the shared query before this boundary
  // hydrates, so the data only shows after hydration (no mismatch).
  const hydrated = useIsClient();
  const data = hydrated ? population.data : undefined;
  const hidden = useHiddenChogs();
  const mine = useMyChogIds();
  const searchId = useId();
  const listId = useId();
  const titleId = useId();

  // A link to /league?… while this page is open (same route, new params) resets the view to it;
  // our own replaceState below lands here too, but then the URL already matches the view.
  const paramsKey = params.toString();
  const [seenKey, setSeenKey] = useState(paramsKey);
  if (paramsKey !== seenKey) {
    setSeenKey(paramsKey);
    if (paramsKey !== queryOf(filters, span, page)) {
      setFilters(readFilters(params));
      setSpan(parseWindow(params.get("window")));
      setPage(readPage(params));
    }
  }

  // Mirror the view into the URL (replaceState keeps it out of the history stack).
  useEffect(() => {
    const qs = queryOf(filters, span, page);
    if (qs === new URLSearchParams(window.location.search).toString()) return;
    window.history.replaceState(window.history.state, "", qs ? `?${qs}` : window.location.pathname);
  }, [filters, span, page]);

  const goTo = (next: number) => {
    setPage(next);
    document.getElementById(listId)?.scrollIntoView({ block: "start" });
  };

  const update = (patch: Partial<Filters>) => {
    setFilters((current) => ({ ...current, ...patch, focus: null }));
    setPage(1);
  };

  // Per-token lowercase trait text (the shown names), so "laser" or "crown" finds every Chog wearing one.
  const traitText = useMemo(() => {
    if (!index) return [];
    const text: string[] = new Array(CHOG_COUNT).fill("");
    index.codes.forEach((column, type) =>
      column.forEach((code, i) => {
        if (code >= 0) text[i] += ` ${index.values[type][code].toLowerCase()}`;
      }),
    );
    return text;
  }, [index]);

  const trait = useMemo(() => traitFilter(filters.trait, index), [filters.trait, index]);
  // An older link that names a raw trait value: keep the filter, with the value's shown name in the URL.
  if (trait && trait.id !== filters.trait) setFilters((current) => ({ ...current, trait: trait.id }));

  // Archetypes come as "Trend Rider" plus modifiers ("Royal Trend Rider", "Ice-Cold Trend Rider"…):
  // the filter offers the base ones and matches every variant. Search finds a modifier ("royal").
  const archetypes = useMemo(() => {
    const names = new Set((data?.rows ?? []).map((row) => row.archetype));
    const counts = new Map<string, number>();
    for (const row of data?.rows ?? []) {
      const base = baseArchetype(row.archetype, names);
      counts.set(base, (counts.get(base) ?? 0) + 1);
    }
    return { names, options: [...counts].sort((a, b) => b[1] - a[1]) };
  }, [data]);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = filters.q.trim().toLowerCase();
    const n = numericQuery(q);
    const filtered = data.rows.filter((row) => {
      if (filters.style && row.style !== filters.style) return false;
      if (filters.archetype && baseArchetype(row.archetype, archetypes.names) !== filters.archetype) return false;
      if (filters.division && divisionOf(row) !== filters.division) return false;
      if (trait && !trait.matches(row.tokenId)) return false;
      if (!q) return true;
      // A number names a token id or a metadata name ("CHOG #1462" is token #1).
      if (n !== null) return row.tokenId === n || index?.metadataIds[row.tokenId - 1] === n;
      return (
        row.archetype.toLowerCase().includes(q) ||
        row.style.includes(q) ||
        row.name.toLowerCase().includes(q) ||
        (traitText[row.tokenId - 1] ?? "").includes(q)
      );
    });
    if (filters.sort === "worst") filtered.reverse();
    if (filters.sort === "id") filtered.sort((a, b) => a.tokenId - b.tokenId);
    return filtered;
  }, [data, filters, trait, index, traitText, archetypes]);

  const traitOptions = useMemo(() => {
    if (!index) return [];
    const families = {
      type: "Families",
      options: TRAIT_FAMILIES.map((family) => ({
        id: `family:${family.key}`,
        value: family.label,
        count: familyMembers(index, family).filter(Boolean).length,
      })).filter((option) => option.count > 0),
    };
    const values = index.types.map((type, i) => {
      const counts = new Array<number>(index.values[i].length).fill(0);
      for (const code of index.codes[i]) if (code >= 0) counts[code]++;
      // The index already holds the shown names (flagged values under their neutral names), keys and labels alike.
      return {
        type,
        options: index.values[i].map((value, j) => ({ id: `${type}:${value}`, value, count: counts[j] })),
      };
    });
    return [families, ...values];
  }, [index]);

  // ?id=N: open the page of the full ranking that holds Chog #N once the league loads, then scroll to it.
  const focusIndex = filters.focus !== null ? rows.findIndex((row) => row.tokenId === filters.focus) : -1;
  const focusKey = focusIndex >= 0 && data ? `${filters.focus}:${span}:${data.computedAt}` : null;
  const [focusedFor, setFocusedFor] = useState<string | null>(null);
  if (focusKey && focusedFor !== focusKey) {
    setFocusedFor(focusKey);
    setPage(Math.floor(focusIndex / PAGE_SIZE) + 1);
  }
  useEffect(() => {
    if (focusedFor && filters.focus !== null) {
      document.getElementById(`league-row-${filters.focus}`)?.scrollIntoView({ block: "center" });
    }
  }, [focusedFor, filters.focus]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const visible = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const filtering = Boolean(filters.q.trim() || filters.style || filters.archetype || trait || filters.division);
  const divisionCounts = useMemo(() => {
    const counts: Record<Division, number> = { wild: 0, claimed: 0, real: 0 };
    for (const row of data?.rows ?? []) counts[divisionOf(row)]++;
    return counts;
  }, [data]);
  const exact = numericQuery(filters.q);
  // The edge bars share one scale: the widest edge in the whole league (rows are sorted best first).
  const maxAbs = data?.rows.length
    ? Math.max(1, Math.abs(data.rows[0].edgePct), Math.abs(data.rows[data.rows.length - 1].edgePct))
    : 1;
  const divisionEmpty = filters.division !== "" && divisionCounts[filters.division] === 0;
  // Until a holder claims a Chog, every Chog is unclaimed: the division chips would only show zeros.
  const showDivisions = divisionCounts.claimed + divisionCounts.real > 0 || filters.division !== "";

  return (
    <section aria-labelledby={titleId} className="v2-section">
      <SectionTitle
        id={titleId}
        title="Every Chog, ranked"
        description={
          <>
            {data && <>{windowDates(data.window)} · </>}hourly CHOG/WMON candles · simulated with the pool&apos;s 1% fee
            and price impact.
          </>
        }
        action={
          <WindowPicker
            value={span}
            onChange={(value) => {
              setSpan(value);
              setPage(1);
            }}
          />
        }
      />

      <GlassCard padding="tight" className="space-y-3.5">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <label htmlFor={searchId} className="v2-sr">
              Search Chogs
            </label>
            <SearchIcon className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-[var(--v2-faint)]" />
            <input
              id={searchId}
              type="search"
              value={filters.q}
              onChange={(e) => update({ q: e.target.value })}
              placeholder="Search: 7, CHOG #1462, laser, crown…"
              autoComplete="off"
              className="v2-input h-11 rounded-full pl-11"
            />
          </div>
          <button
            type="button"
            onClick={() => router.push(`/replay/${randomChogId(undefined, hidden)}`)}
            aria-label="Random Chog"
            className={`${pillClass("primary")} h-11 shrink-0 px-4 sm:px-5`}
          >
            <DiceIcon className="size-5 sm:size-[18px]" />
            <span aria-hidden className="hidden sm:inline">
              Random Chog
            </span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
          {/* The three divisions, once any Chog is claimed (until then every Chog is unclaimed); phones: one row that
              scrolls sideways. */}
          {showDivisions && (
            <div role="group" aria-label="Division" className="dna-scroll-x -mx-4 w-[calc(100%+2rem)] px-4 sm:mx-0 sm:w-auto sm:px-0">
              {([{ key: "", label: "All divisions", title: "Every Chog" }, ...DIVISIONS] as const).map((division) => (
                <button
                  key={division.key || "all"}
                  type="button"
                  title={division.title}
                  aria-pressed={filters.division === division.key}
                  onClick={() => update({ division: division.key })}
                  className="v2-chip h-8 shrink-0 cursor-pointer px-3"
                >
                  {division.label}
                  {division.key && data && (
                    <span className="v2-num text-[var(--v2-faint)]">{formatInt(divisionCounts[division.key])}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {showDivisions && <span aria-hidden className="v2-vr hidden h-5 self-center lg:block" />}

          <div role="group" aria-label="Trading style" className="dna-scroll-x -mx-4 w-[calc(100%+2rem)] px-4 sm:mx-0 sm:w-auto sm:px-0">
            {(["", ...STYLES] as const).map((style) => (
              <button
                key={style || "all"}
                type="button"
                aria-pressed={filters.style === style}
                onClick={() => update({ style })}
                className={`v2-chip h-8 shrink-0 cursor-pointer px-3 ${style ? "capitalize" : ""}`}
              >
                {style || "All styles"}
              </button>
            ))}
          </div>

          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto lg:ml-auto">
            <select
              aria-label="Archetype"
              value={filters.archetype}
              onChange={(e) => update({ archetype: e.target.value })}
              className="v2-select dna-select-sm min-w-0 sm:w-auto sm:max-w-60"
            >
              <option value="">All archetypes</option>
              {archetypes.options.map(([archetype, count]) => (
                <option key={archetype} value={archetype}>
                  {archetype} ({count})
                </option>
              ))}
            </select>

            {traitOptions.length > 0 && (
              <select
                aria-label="Trait"
                value={trait ? trait.id : ""}
                onChange={(e) => update({ trait: e.target.value })}
                className="v2-select dna-select-sm min-w-0 sm:w-auto sm:max-w-64"
              >
                <option value="">Any trait</option>
                {traitOptions.map(({ type, options }) => (
                  <optgroup key={type} label={type}>
                    {options.map(({ id, value, count }) => (
                      <option key={id} value={id}>
                        {value} ({count})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            )}
          </div>
        </div>
      </GlassCard>

      {!data ? (
        error ? (
          <div role="alert" className="mt-4">
            <EmptyState
              icon={<PulseIcon />}
              title="Couldn't load the league"
              body={<span className="v2-mono break-words">{error.message}</span>}
              actions={
                <button type="button" onClick={() => refetch()} disabled={isFetching} className={pillClass("glass")}>
                  {isFetching ? "Retrying…" : "Try again"}
                </button>
              }
            />
          </div>
        ) : (
          <ListSkeleton />
        )
      ) : (
        <div id={listId} className="mt-4 scroll-mt-28">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1">
            <p aria-live="polite" className="text-[13px] text-[var(--v2-nav)]">
              {filtering ? (
                <>
                  <span className="v2-num text-[var(--v2-ink)]">{formatInt(rows.length)}</span> of {formatInt(data.rows.length)}{" "}
                  Chogs match
                </>
              ) : (
                <>
                  <span className="v2-num text-[var(--v2-ink)]">{formatInt(rows.length)}</span> Chogs
                </>
              )}
              {trait && <> · {trait.label}</>}
              {filtering && rows.length > 0 && <SubsetStats rows={rows} />}
            </p>
            <label className="flex items-center gap-2 text-[13px] text-[var(--v2-faint)]">
              Sort
              <select
                value={filters.sort}
                onChange={(e) => update({ sort: e.target.value as Sort })}
                className="v2-select dna-select-sm h-9 w-auto"
              >
                {(Object.keys(SORT_LABEL) as Sort[]).map((sort) => (
                  <option key={sort} value={sort}>
                    {SORT_LABEL[sort]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {rows.length === 0 ? (
            <EmptyState
              icon={<SearchIcon />}
              title={divisionEmpty ? "Nobody in this division yet" : "No Chog matches that"}
              body={
                divisionEmpty ? (
                  filters.division === "real" ? (
                    <>
                      A holder moves their Chog here from its page: create its wallet, grant AnimrTradeGuard, set limits and
                      deposit. Then its AI trades the real $CHOG and can never withdraw.{" "}
                      <Link href="/guard" className="v2-link">
                        How the guard works
                      </Link>
                    </>
                  ) : (
                    "A holder wakes their Chog's AI with one free signed message on its page."
                  )
                ) : exact !== null && parseChogId(exact) === null ? (
                  `Chog token IDs run from 1 to ${formatInt(CHOG_COUNT)}.`
                ) : (
                  "Try a token ID, a trait like “laser” or clear the filters."
                )
              }
              actions={
                <button
                  type="button"
                  onClick={() => update({ q: "", style: "", archetype: "", trait: "", division: "" })}
                  className={pillClass("glass")}
                >
                  {divisionEmpty ? "See every Chog" : "Clear filters"}
                </button>
              }
            />
          ) : (
            <div className="v2-table-wrap">
              <table className="v2-table dna-league">
                <caption className="v2-sr">
                  Chogs ranked by their simulated result versus simply holding $CHOG,{" "}
                  {WINDOW_LABEL[span] === "All" ? "over all history" : `over ${WINDOW_LABEL[span]}`}. Page {current} of {pages}.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Chog</th>
                    <th scope="col" className="v2-hide-sm">
                      Style
                    </th>
                    <th scope="col" className="is-num v2-hide-sm">
                      Trades
                    </th>
                    <th scope="col" className="w-[180px] max-md:hidden">
                      <span className="flex justify-between gap-2">
                        <span>Behind</span>
                        <span>Ahead</span>
                      </span>
                    </th>
                    <th scope="col" className="is-num">
                      vs holding
                    </th>
                    <th scope="col" className="w-px">
                      <span className="v2-sr">Time Machine</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <LeagueRow
                      key={row.tokenId}
                      row={row}
                      maxAbs={maxAbs}
                      focused={row.tokenId === filters.focus}
                      mine={mine.has(row.tokenId)}
                      nameLabel={chogNumberLabel(row.tokenId, index?.metadataIds)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="v2-note mt-3 px-1">{IN_SAMPLE_NOTE}</p>

          {pages > 1 && (
            <nav aria-label="League pages" className="mt-4 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => goTo(current - 1)}
                disabled={current <= 1}
                className={pillClass("glass", "sm")}
              >
                <span aria-hidden>‹</span> Prev
              </button>
              <span className="text-center text-[13px] text-[var(--v2-faint)]">
                <span className="v2-num text-[var(--v2-nav)]">
                  {formatInt((current - 1) * PAGE_SIZE + 1)}–{formatInt(Math.min(current * PAGE_SIZE, rows.length))}
                </span>{" "}
                of {formatInt(rows.length)}
                <span className="max-sm:hidden">
                  {" "}
                  · page {current} of {pages}
                </span>
              </span>
              <button
                type="button"
                onClick={() => goTo(current + 1)}
                disabled={current >= pages}
                className={pillClass("glass", "sm")}
              >
                Next <span aria-hidden>›</span>
              </button>
            </nav>
          )}
        </div>
      )}
    </section>
  );
}

function SubsetStats({ rows }: { rows: PopulationRow[] }) {
  const edges = rows.map((r) => r.edgePct).sort((a, b) => a - b);
  const mid = edges.length >> 1;
  const median = edges.length % 2 ? edges[mid] : (edges[mid - 1] + edges[mid]) / 2;
  const beat = (edges.filter((e) => e > 0).length / edges.length) * 100;
  return (
    <>
      {" "}
      · median <EdgeBadge pct={median} /> · <span className="v2-num">{Math.round(beat)}%</span> beat holding
    </>
  );
}

/** The edge as a bar from the "just holding" hairline, on the league-wide scale. Decorative: the number is beside it. */
function EdgeBar({ pct, maxAbs }: { pct: number; maxAbs: number }) {
  const width = Math.min(50, (Math.abs(pct) / maxAbs) * 50);
  if (!Number.isFinite(pct) || width < 0.4) return <span aria-hidden className="dna-dbar" />;
  return (
    <span aria-hidden className="dna-dbar">
      <span data-tone={pct > 0 ? "up" : "down"} style={{ width: `${width}%` }} />
    </span>
  );
}

function LeagueRow({
  row,
  maxAbs,
  focused = false,
  mine = false,
  nameLabel,
}: {
  row: PopulationRow;
  maxAbs: number;
  focused?: boolean;
  mine?: boolean;
  /** "CHOG #1312": its marketplace name, under its persona name. */
  nameLabel: string;
}) {
  return (
    <tr
      id={`league-row-${row.tokenId}`}
      aria-current={focused ? "true" : undefined}
      className={`scroll-mt-28 ${focused || mine ? "is-highlight" : ""} ${focused ? "dna-focus" : ""}`}
    >
      <td className={`is-rank ${row.rank <= 3 ? "dna-rank-top" : ""}`}>
        <span className="v2-sr">Rank </span>
        {formatInt(row.rank)}
      </td>

      <td className="dna-fill">
        <span className="v2-table-cell-chog min-w-0">
          <ChogThumb
            image={row.image}
            tokenId={row.tokenId}
            size={40}
            box="size-9 sm:size-10"
            className="rounded-[10px] border border-[var(--v2-line)]"
          />
          <span className="min-w-0">
            <span className="flex min-w-0 items-center gap-2">
              {/* The name's ::after stretches over the row, so the whole row opens the profile. */}
              <Link href={`/chog/${row.tokenId}`} className="dna-row-link truncate">
                {row.name}
              </Link>
              {mine && (
                <Badge tone="teal" className="h-5 px-1.5 text-[10px]">
                  Yours
                </Badge>
              )}
              {row.claimed && (
                <span
                  className="max-sm:hidden"
                  title={
                    row.onchain
                      ? "Real wallet: its AI trades the real $CHOG in its own wallet through AnimrTradeGuard"
                      : "Claimed: an owner woke this Chog's live AI (0G Compute)"
                  }
                >
                  <Badge tone={row.onchain ? "teal" : "violet"} dot={row.onchain} className="h-5 px-1.5 text-[10px]">
                    {row.onchain ? "Real wallet" : "Claimed"}
                  </Badge>
                </span>
              )}
            </span>
            <span className="mt-0.5 block truncate text-xs font-normal text-[var(--v2-faint)]">
              {nameLabel} · <span className="text-[var(--v2-nav)]">{row.archetype}</span>
            </span>
          </span>
        </span>
      </td>

      <td className="v2-hide-sm v2-muted text-[13.5px] capitalize">{row.style}</td>

      <td className="is-num v2-hide-sm text-[var(--v2-nav)]">
        {row.trades}
        <span className="v2-sr"> trades</span>
      </td>

      <td className="max-md:hidden">
        <EdgeBar pct={row.edgePct} maxAbs={maxAbs} />
      </td>

      <td className="is-num">
        <span className="v2-sr">Edge vs holding </span>
        <EdgeBadge pct={row.edgePct} className="text-[15px]" />
      </td>

      <td className="w-px text-right">
        <Link
          href={`/replay/${row.tokenId}`}
          aria-label={`Watch ${row.name} (${nameLabel}) in the Time Machine`}
          title="Time Machine"
          className={`${pillClass("glass", "sm")} dna-above size-8 px-0`}
        >
          <PlayIcon className="size-3.5 text-[var(--v2-teal)]" />
        </Link>
      </td>
    </tr>
  );
}

function ListSkeleton() {
  return (
    <div role="status" className="v2-table-wrap mt-4">
      <span className="v2-sr">Loading all 1,969 Chogs…</span>
      <div aria-hidden className="h-11 border-b border-[var(--v2-line)]" />
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} aria-hidden className="flex items-center gap-4 border-b border-[var(--v2-line-soft)] px-5 py-3.5 last:border-0">
          <span className="v2-skeleton v2-skeleton--text w-6" />
          <span className="v2-skeleton size-10 rounded-[10px]" />
          <span className="flex-1 space-y-2">
            <span className="v2-skeleton v2-skeleton--text w-28" />
            <span className="v2-skeleton v2-skeleton--text w-44 opacity-60" />
          </span>
          <span className="v2-skeleton v2-skeleton--text hidden w-36 md:block" />
          <span className="v2-skeleton v2-skeleton--text w-14" />
        </div>
      ))}
    </div>
  );
}

/** Suspense fallback for the board (the page reads its filters from the URL). */
export function LeagueSkeleton() {
  return (
    <div className="v2-section">
      <div aria-hidden className="v2-section-title">
        <span className="space-y-3">
          <span className="v2-skeleton v2-skeleton--text w-20" />
          <span className="v2-skeleton v2-skeleton--title w-64" />
        </span>
      </div>
      <span aria-hidden className="v2-skeleton block h-[118px] rounded-[var(--v2-r-lg)] sm:h-[124px]" />
      <ListSkeleton />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The field: the page header's aside. Every Chog's edge as one histogram, then the median, the top and the rekt.

function niceStep(raw: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(raw || 1));
  const norm = raw / magnitude;
  return (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * magnitude;
}

/** ~30–40 bins across the 1st–99th percentile (the tails fold into the end bins), with 0 on a bin edge. */
function binEdges(rows: PopulationRow[]) {
  const sorted = rows.map((row) => row.edgePct).filter(Number.isFinite).sort((a, b) => a - b);
  const n = sorted.length;
  const at = (p: number) => sorted[Math.min(n - 1, Math.max(0, Math.round(p * (n - 1))))];
  const lo = Math.min(at(0.01), -1);
  const hi = Math.max(at(0.99), 1);
  const width = niceStep((hi - lo) / 34);
  const start = Math.floor(lo / width) * width;
  const end = Math.ceil(hi / width) * width;
  const counts = new Array<number>(Math.max(1, Math.round((end - start) / width))).fill(0);
  for (const edge of sorted) counts[Math.min(counts.length - 1, Math.max(0, Math.floor((edge - start) / width)))]++;
  const mid = n >> 1;
  const median = n === 0 ? 0 : n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { counts, start, end, width, median };
}

/**
 * The League's header panel: all 1,969 edges as a histogram around the "just holding" line, the share that beat
 * it, and the median, best and worst Chogs on show. Follows the board's window through the URL (?window=).
 */
export function LeagueField() {
  const params = useSearchParams();
  const span = parseWindow(params.get("window"));
  const { data } = usePopulation(span);
  // As in the board: the server renders the skeleton, so the data waits for hydration.
  const hydrated = useIsClient();
  if (!data || !hydrated) return <LeagueFieldSkeleton />;
  return <FieldPanel data={data} span={span} />;
}

function FieldPanel({ data, span }: { data: PopulationResponse; span: WindowKey }) {
  const { stats, rows } = data;
  const bins = useMemo(() => binEdges(rows), [rows]);
  // The rates are the whole collection's (all 1,969, Chogs their holders hid included); the top and bottom
  // name a Chog, so they show the best and worst Chogs on show, with their own edges.
  const best = rows[0];
  const worst = rows[rows.length - 1];
  const bestEdge = best?.edgePct ?? stats.bestEdgePct;
  const worstEdge = worst?.edgePct ?? stats.worstEdgePct;
  const peak = Math.max(1, ...bins.counts);
  const span01 = (value: number) => (value - bins.start) / (bins.end - bins.start);
  const medianBin = Math.floor((bins.median - bins.start) / bins.width);
  const beat = Math.round(stats.beatHoldPct);
  const barW = 10;

  return (
    <GlassCard feature as="section" aria-label="The field" className="p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <p className="text-[13.5px] text-[var(--v2-nav)]">
            {WINDOW_LABEL[span] === "All" ? "All history" : `Last ${WINDOW_LABEL[span]}`}, simulated
          </p>
          <p className="mt-2 flex items-baseline gap-2.5 text-[var(--v2-nav)]">
            <span className="v2-num text-[length:var(--v2-fs-stat)] leading-none text-[var(--v2-ink)]">{beat}%</span>
            <span className="text-sm">
              of {formatInt(CHOG_COUNT)} beat
              <br />
              just holding $CHOG
            </span>
          </p>
        </div>
        <ul className="v2-legend pb-1 text-[11.5px]" aria-hidden>
          <li>
            <span className="v2-legend-swatch" style={{ "--v2-swatch": "var(--v2-chart-1)" } as CSSProperties} />
            Ahead
          </li>
          <li>
            <span className="v2-legend-swatch" style={{ "--v2-swatch": "var(--v2-danger)", boxShadow: "none" } as CSSProperties} />
            Behind
          </li>
        </ul>
      </div>

      <div
        role="img"
        aria-label={`How all ${formatInt(CHOG_COUNT)} Chogs did against just holding: ${beat}% ahead, median ${signedPct(bins.median)}, from ${signedPct(worstEdge)} to ${signedPct(bestEdge)}.`}
        className="dna-field mt-7"
      >
        <svg viewBox={`0 0 ${bins.counts.length * barW} 100`} preserveAspectRatio="none" aria-hidden>
          {bins.counts.map((count, i) => {
            const h = count === 0 ? 0 : Math.max(2, (count / peak) * 100);
            const ahead = bins.start + i * bins.width >= 0;
            return (
              <rect
                key={i}
                x={i * barW + 1.2}
                y={100 - h}
                width={barW - 2.4}
                height={h}
                rx={1.4}
                fill={ahead ? "var(--v2-chart-1)" : "var(--v2-danger)"}
                fillOpacity={i === medianBin ? 0.95 : 0.6}
              />
            );
          })}
        </svg>
        <span aria-hidden className="dna-field-zero" style={{ left: `${span01(0) * 100}%` }}>
          <span>just holding</span>
        </span>
      </div>
      <div aria-hidden className="dna-field-axis">
        <span>{signedPct(bins.start, 0)}</span>
        <span>{signedPct(bins.end, 0)}+</span>
      </div>

      <StatRow
        size="sm"
        inline
        className="mt-6 border-t border-[var(--v2-line-soft)] pt-5"
        stats={[
          { key: "median", label: "Median Chog", value: signedPct(stats.medianEdgePct), tone: toneOf(stats.medianEdgePct) },
          {
            key: "best",
            label: "Top",
            hint: best ? (
              <Link href={`/replay/${best.tokenId}`} className="v2-link font-normal">
                {best.name}
              </Link>
            ) : undefined,
            value: signedPct(bestEdge),
            tone: toneOf(bestEdge),
          },
          {
            key: "worst",
            label: "Most rekt",
            hint: worst ? (
              <Link href={`/replay/${worst.tokenId}`} className="v2-link font-normal">
                {worst.name}
              </Link>
            ) : undefined,
            value: signedPct(worstEdge),
            tone: toneOf(worstEdge),
          },
        ]}
      />
    </GlassCard>
  );
}

const toneOf = (pct: number): "up" | "down" | undefined =>
  !Number.isFinite(pct) || Math.abs(pct) < 0.05 ? undefined : pct > 0 ? "up" : "down";

export function LeagueFieldSkeleton() {
  return (
    <div role="status" className="v2-card p-5 sm:p-6">
      <span className="v2-sr">Loading the field…</span>
      <span aria-hidden className="block space-y-3">
        <span className="v2-skeleton v2-skeleton--text w-32" />
        <span className="v2-skeleton v2-skeleton--title w-40" />
      </span>
      <span aria-hidden className="v2-skeleton mt-7 block h-[112px]" />
      <span aria-hidden className="mt-6 grid grid-cols-3 gap-4 border-t border-[var(--v2-line-soft)] pt-5">
        {Array.from({ length: 3 }, (_, i) => (
          <span key={i} className="space-y-2">
            <span className="v2-skeleton v2-skeleton--title w-20" />
            <span className="v2-skeleton v2-skeleton--text w-16" />
          </span>
        ))}
      </span>
    </div>
  );
}
