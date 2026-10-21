"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, useId, useMemo, useState } from "react";
import type { TradingStyle } from "@/lib/agent/types";
import { displayTraitValue } from "@/lib/brand-safety";
import type { PopulationResponse, PopulationRow } from "@/lib/dna/types";
import { useHiddenChogs } from "../hidden-chogs";
import { usePopulation } from "./api";
import { ChogThumb } from "./chog-thumb";
import { EdgeBadge } from "./edge-badge";
import { TRAIT_FAMILIES, familyMembers } from "./families";
import { StyleChip } from "./genome-card";
import { DiceIcon } from "./icons";
import type { LeagueIndex } from "./league-index";
import {
  CHOG_COUNT,
  IN_SAMPLE_NOTE,
  SIM_LABEL,
  type WindowKey,
  edgeTone,
  formatInt,
  parseChogId,
  parseWindow,
  randomChogId,
  signedPct,
} from "./shared";
import { WindowPicker } from "./window-picker";

const PAGE_SIZE = 50;
const STYLES: TradingStyle[] = ["aggressive", "balanced", "cautious"];
type Sort = "best" | "worst" | "id";
const SORT_LABEL: Record<Sort, string> = { best: "Best first", worst: "Most rekt first", id: "Token ID" };

/**
 * The League's three divisions (lib/dna/types.ts PopulationRow): Wild (nobody claimed it: its trait instinct trades),
 * Claimed (its holder woke an AI on 0G Compute, paper fills at live prices) and Real wallet (that AI trades the real
 * $CHOG in the Chog's own wallet through AnimrTradeGuard). Every division is ranked by the same genome replay.
 */
type Division = "wild" | "claimed" | "real";
const DIVISIONS: { key: Division; label: string; title: string }[] = [
  { key: "wild", label: "Wild", title: "Nobody claimed it yet: its trait instinct trades" },
  { key: "claimed", label: "Claimed", title: "Its holder woke an AI on 0G Compute (paper fills at live prices)" },
  { key: "real", label: "Real wallet", title: "Its AI trades the real $CHOG in its own wallet through AnimrTradeGuard" },
];
const isDivision = (value: string | null): value is Division => DIVISIONS.some((d) => d.key === value);
const divisionOf = (row: PopulationRow): Division => (row.onchain ? "real" : row.claimed ? "claimed" : "wild");

// Phones: rank | Chog | edge over replay. From sm: rank | Chog | trades | edge | replay.
const GRID =
  "grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-2.5 sm:grid-cols-[2.75rem_minmax(0,1fr)_4.5rem_6.5rem_6rem] sm:gap-x-4";

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
function queryOf(filters: Filters, span: WindowKey): string {
  const next = new URLSearchParams();
  if (filters.focus !== null) next.set("id", String(filters.focus));
  if (filters.q.trim()) next.set("q", filters.q.trim());
  if (filters.style) next.set("style", filters.style);
  if (filters.archetype) next.set("archetype", filters.archetype);
  if (filters.trait) next.set("trait", filters.trait);
  if (filters.division) next.set("division", filters.division);
  if (filters.sort !== "best") next.set("sort", filters.sort);
  if (span !== "45d") next.set("window", span);
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
  const [page, setPage] = useState(1);
  const { data, error, isFetching, refetch } = usePopulation(span);
  const hidden = useHiddenChogs();
  const searchId = useId();
  const listId = useId();

  // A link to /league?… while this page is open (same route, new params) resets the view to it;
  // our own replaceState below lands here too, but then the URL already matches the view.
  const paramsKey = params.toString();
  const [seenKey, setSeenKey] = useState(paramsKey);
  if (paramsKey !== seenKey) {
    setSeenKey(paramsKey);
    if (paramsKey !== queryOf(filters, span)) {
      setFilters(readFilters(params));
      setSpan(parseWindow(params.get("window")));
      setPage(1);
    }
  }

  // Mirror the view into the URL (replaceState keeps it out of the history stack).
  useEffect(() => {
    const qs = queryOf(filters, span);
    if (qs === new URLSearchParams(window.location.search).toString()) return;
    window.history.replaceState(window.history.state, "", qs ? `?${qs}` : window.location.pathname);
  }, [filters, span]);

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

  return (
    <section aria-label="Chog league" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-subtle">
          {SIM_LABEL}
          {data && <> · {data.window.label}</>}
          <span className="block">{IN_SAMPLE_NOTE}</span>
        </p>
        <WindowPicker
          value={span}
          onChange={(value) => {
            setSpan(value);
            setPage(1);
          }}
        />
      </div>

      {data ? <StatsStrip data={data} /> : <StatsSkeleton />}

      <div className="card space-y-3 p-3 sm:p-4">
        <div className="flex gap-2">
          <label htmlFor={searchId} className="sr-only">
            Search Chogs
          </label>
          <input
            id={searchId}
            type="search"
            value={filters.q}
            onChange={(e) => update({ q: e.target.value })}
            placeholder="Search: 7, CHOG #1462, laser, crown…"
            autoComplete="off"
            className="input min-w-0 flex-1"
          />
          <button
            type="button"
            onClick={() => router.push(`/replay/${randomChogId(undefined, hidden)}`)}
            aria-label="Random Chog"
            className="btn btn-primary shrink-0 px-3 sm:px-4"
          >
            <DiceIcon className="size-5 sm:size-4" />
            <span aria-hidden className="hidden sm:inline">
              Random Chog
            </span>
          </button>
        </div>

        {/* The three divisions; phones: one row that scrolls sideways. */}
        <div
          role="group"
          aria-label="Division"
          className="-mx-3 flex w-[calc(100%+1.5rem)] gap-1 overflow-x-auto px-3 [scrollbar-width:none] sm:mx-0 sm:w-auto sm:flex-wrap sm:overflow-visible sm:px-0"
        >
          {([{ key: "", label: "All divisions", title: "Every Chog" }, ...DIVISIONS] as const).map((division) => (
            <button
              key={division.key || "all"}
              type="button"
              title={division.title}
              aria-pressed={filters.division === division.key}
              onClick={() => update({ division: division.key })}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors ${
                filters.division === division.key
                  ? "bg-accent/20 text-foreground ring-accent/50"
                  : "text-muted ring-line hover:text-foreground"
              }`}
            >
              {division.label}
              {division.key && data && (
                <span className="ml-1 font-mono text-[11px] text-subtle tabular-nums">{formatInt(divisionCounts[division.key])}</span>
              )}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Phones: one row that scrolls sideways. */}
          <div
            role="group"
            aria-label="Trading style"
            className="-mx-3 flex w-[calc(100%+1.5rem)] gap-1 overflow-x-auto px-3 [scrollbar-width:none] sm:mx-0 sm:w-auto sm:overflow-visible sm:px-0"
          >
            {(["", ...STYLES] as const).map((style) => (
              <button
                key={style || "all"}
                type="button"
                aria-pressed={filters.style === style}
                onClick={() => update({ style })}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors ${style ? "capitalize" : ""} ${
                  filters.style === style ? "bg-accent/20 text-foreground ring-accent/50" : "text-muted ring-line hover:text-foreground"
                }`}
              >
                {style || "All styles"}
              </button>
            ))}
          </div>

          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <select
              aria-label="Archetype"
              value={filters.archetype}
              onChange={(e) => update({ archetype: e.target.value })}
              className="input min-w-0 py-1.5 text-xs sm:w-auto sm:max-w-56"
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
                className="input min-w-0 py-1.5 text-xs sm:w-auto sm:max-w-64"
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
      </div>

      {!data ? (
        error ? (
          <div role="alert" className="card border-danger/40 px-6 py-10 text-center">
            <p className="font-medium text-danger">Couldn&apos;t load the league</p>
            <p className="mt-1 break-words font-mono text-xs text-muted">{error.message}</p>
            <button type="button" onClick={() => refetch()} disabled={isFetching} className="btn btn-secondary mt-5">
              {isFetching ? "Retrying…" : "Try again"}
            </button>
          </div>
        ) : (
          <ListSkeleton />
        )
      ) : (
        <div id={listId} className="scroll-mt-28 md:scroll-mt-24">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p aria-live="polite" className="text-xs text-subtle">
              {filtering ? `${formatInt(rows.length)} of ${formatInt(data.rows.length)} Chogs match` : `${formatInt(rows.length)} Chogs`}
              {trait && <> · {trait.label}</>}
              {filtering && rows.length > 0 && <SubsetStats rows={rows} />}
            </p>
            <select
              aria-label="Sort"
              value={filters.sort}
              onChange={(e) => update({ sort: e.target.value as Sort })}
              className="input w-auto py-1 text-xs"
            >
              {(Object.keys(SORT_LABEL) as Sort[]).map((sort) => (
                <option key={sort} value={sort}>
                  {SORT_LABEL[sort]}
                </option>
              ))}
            </select>
          </div>

          {rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center">
              <p className="font-medium">
                {filters.division && divisionCounts[filters.division] === 0 ? "Nobody in this division yet" : "No Chog matches that"}
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
                {filters.division && divisionCounts[filters.division] === 0 ? (
                  filters.division === "real" ? (
                    <>
                      A holder moves their Chog here from its page: create its wallet, grant AnimrTradeGuard, set limits
                      and deposit. Then its AI trades the real $CHOG and can never withdraw.{" "}
                      <Link href="/guard" className="text-accent-strong hover:underline">
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
                )}
              </p>
              <button
                type="button"
                onClick={() => update({ q: "", style: "", archetype: "", trait: "", division: "" })}
                className="btn btn-secondary mt-5"
              >
                {filters.division && divisionCounts[filters.division] === 0 ? "See every Chog" : "Clear filters"}
              </button>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <div
                aria-hidden
                className={`${GRID} hidden border-b border-line px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-subtle sm:grid`}
              >
                <span>Rank</span>
                <span>Chog</span>
                <span className="text-right">Trades</span>
                <span className="text-right">vs holding</span>
                <span />
              </div>
              <ol>
                {visible.map((row) => (
                  <LeagueRow key={row.tokenId} row={row} focused={row.tokenId === filters.focus} />
                ))}
              </ol>
            </div>
          )}

          {pages > 1 && (
            <nav aria-label="League pages" className="mt-4 flex items-center justify-between gap-3 text-sm">
              <button
                type="button"
                onClick={() => goTo(current - 1)}
                disabled={current <= 1}
                className="btn btn-secondary"
              >
                ‹ Prev
              </button>
              <span className="text-xs text-muted tabular-nums">
                {formatInt((current - 1) * PAGE_SIZE + 1)}–{formatInt(Math.min(current * PAGE_SIZE, rows.length))} of{" "}
                {formatInt(rows.length)} · page {current} of {pages}
              </span>
              <button
                type="button"
                onClick={() => goTo(current + 1)}
                disabled={current >= pages}
                className="btn btn-secondary"
              >
                Next ›
              </button>
            </nav>
          )}
        </div>
      )}
    </section>
  );
}

function StatsStrip({ data }: { data: PopulationResponse }) {
  const { stats, rows } = data;
  // The rates are the whole collection's (all 1,969, Chogs their holders hid included); the top and bottom tiles
  // name a Chog, so they show the best and worst Chogs on show, with their own edges.
  const best = rows[0];
  const worst = rows[rows.length - 1];
  const bestEdge = best?.edgePct ?? stats.bestEdgePct;
  const worstEdge = worst?.edgePct ?? stats.worstEdgePct;
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile label="Beat just holding" value={`${Math.round(stats.beatHoldPct)}%`} hint={`of ${formatInt(CHOG_COUNT)} Chogs`} />
      <Tile label="Median Chog" value={signedPct(stats.medianEdgePct)} tone={edgeTone(stats.medianEdgePct)} hint="vs holding $CHOG" />
      <Tile
        label="Top trader"
        value={signedPct(bestEdge)}
        tone={edgeTone(bestEdge)}
        hint={best ? <Link href={`/replay/${best.tokenId}`} className="hover:text-foreground hover:underline">Chog #{best.tokenId} ▶</Link> : undefined}
      />
      <Tile
        label="Most rekt"
        value={signedPct(worstEdge)}
        tone={edgeTone(worstEdge)}
        hint={worst ? <Link href={`/replay/${worst.tokenId}`} className="hover:text-foreground hover:underline">Chog #{worst.tokenId} ▶</Link> : undefined}
      />
    </dl>
  );
}

function Tile({ label, value, hint, tone = "" }: { label: string; value: string; hint?: ReactNode; tone?: string }) {
  return (
    <div className="card px-3 py-2.5 sm:px-4 sm:py-3">
      <dt className="text-[11px] font-medium uppercase tracking-wider text-subtle">{label}</dt>
      <dd className={`mt-1 font-mono text-xl font-semibold tabular-nums sm:text-2xl ${tone}`}>{value}</dd>
      {hint && <dd className="mt-0.5 text-xs text-muted">{hint}</dd>}
    </div>
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
      · median <span className={`font-mono ${edgeTone(median)}`}>{signedPct(median)}</span> · {Math.round(beat)}% beat holding
    </>
  );
}

function LeagueRow({ row, focused = false }: { row: PopulationRow; focused?: boolean }) {
  const top = row.rank <= 3 ? ["text-warning", "text-foreground", "text-orange-300"][row.rank - 1] : "text-subtle";
  return (
    <li
      id={`league-row-${row.tokenId}`}
      aria-current={focused ? "true" : undefined}
      className={`relative scroll-mt-28 border-b border-line/60 transition-colors last:border-0 hover:bg-accent/[0.06] md:scroll-mt-24 ${
        focused ? "bg-accent/[0.12] ring-2 ring-inset ring-accent/60" : ""
      }`}
    >
      <div className={`${GRID} px-3 py-2.5 sm:px-4`}>
        <span className={`font-mono text-xs font-semibold tabular-nums sm:text-sm ${top}`}>
          <span className="sr-only">Rank </span>
          {row.rank}
        </span>

        <span className="flex min-w-0 items-center gap-3">
          <ChogThumb image={row.image} tokenId={row.tokenId} size={40} box="size-9 sm:size-10" className="rounded-xl" />
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              {/* The name's ::after stretches over the row, so the whole row opens the profile. */}
              <Link
                href={`/chog/${row.tokenId}`}
                className="truncate font-semibold text-foreground after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-accent"
              >
                Chog #{row.tokenId}
              </Link>
              {row.claimed && (
                <span
                  title={
                    row.onchain
                      ? "Real wallet: its AI trades the real $CHOG in its own wallet through AnimrTradeGuard"
                      : "Claimed: an owner woke this Chog's live AI (0G Compute)"
                  }
                  className="shrink-0 rounded bg-success/10 px-1.5 py-px text-[10px] font-medium uppercase tracking-wider text-success ring-1 ring-inset ring-success/30"
                >
                  {row.onchain ? "real wallet" : "claimed"}
                </span>
              )}
            </span>
            <span className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted">
              <span className="truncate">{row.archetype}</span>
              <span className="hidden sm:inline-flex">
                <StyleChip style={row.style} />
              </span>
            </span>
            <span className="mt-0.5 block truncate text-[11px] text-subtle">{row.name}</span>
          </span>
        </span>

        <span className="hidden text-right font-mono text-sm tabular-nums text-muted sm:block">
          {row.trades}
          <span className="sr-only"> trades</span>
        </span>

        {/* Stacked on phones; `sm:contents` turns the two into their own grid columns. */}
        <span className="flex flex-col items-end gap-1.5 sm:contents">
          <span className="sm:text-right">
            <span className="sr-only">Edge vs holding </span>
            <EdgeBadge pct={row.edgePct} />
          </span>
          <Link
            href={`/replay/${row.tokenId}`}
            aria-label={`Replay Chog #${row.tokenId} in the Time Machine`}
            className="btn btn-secondary relative z-10 px-2 py-0.5 text-[11px] sm:justify-self-end sm:px-2.5 sm:py-1 sm:text-xs"
          >
            <span aria-hidden>▶</span> Replay
          </Link>
        </span>
      </div>
    </li>
  );
}

function StatsSkeleton() {
  return (
    <div aria-hidden className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="card space-y-2 px-4 py-3">
          <span className="block h-3 w-20 animate-pulse rounded bg-surface-2" />
          <span className="block h-7 w-24 animate-pulse rounded bg-surface-2" />
        </div>
      ))}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div role="status" className="card overflow-hidden">
      <span className="sr-only">Loading all 1,969 Chogs…</span>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} aria-hidden className="flex items-center gap-3 border-b border-line/60 px-4 py-3 last:border-0">
          <span className="h-4 w-6 animate-pulse rounded bg-surface-2" />
          <span className="size-10 animate-pulse rounded-xl bg-surface-2" />
          <span className="flex-1 space-y-2">
            <span className="block h-3 w-28 animate-pulse rounded bg-surface-2" />
            <span className="block h-3 w-40 animate-pulse rounded bg-surface-2/60" />
          </span>
          <span className="h-5 w-16 animate-pulse rounded-full bg-surface-2" />
        </div>
      ))}
    </div>
  );
}

/** Suspense fallback for the league page. */
export function LeagueSkeleton() {
  return (
    <div className="space-y-5">
      <StatsSkeleton />
      <div aria-hidden className="card h-28 animate-pulse" />
      <ListSkeleton />
    </div>
  );
}
