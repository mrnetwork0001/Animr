"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { displayTraitValue } from "@/lib/brand-safety";
import type { TraitAlphaRow } from "@/lib/dna/types";
import { usePopulation, useTraitAlpha } from "./api";
import { type FamilyStats, familyStats } from "./families";
import type { LeagueIndex } from "./league-index";
import { DEFAULT_WINDOW, IN_SAMPLE_NOTE, SIM_LABEL, type WindowKey, edgeTone, formatInt, signedPct } from "./shared";
import { WindowPicker } from "./window-picker";

type SortKey = "trait" | "count" | "median" | "beat";
type Sort = { key: SortKey; desc: boolean };

const MIN_COUNTS = [1, 5, 10, 25] as const;
/** A headline needs enough Chogs on both sides to mean something. */
const HEADLINE_MIN = 15;

const value = (row: TraitAlphaRow, key: SortKey): number | string =>
  key === "trait" ? `${row.traitType} ${row.value}`.toLowerCase() : key === "count" ? row.count : key === "median" ? row.medianEdgePct : row.beatHoldPct;

const leagueHref = (row: TraitAlphaRow) => `/league?trait=${encodeURIComponent(`${row.traitType}:${row.value}`)}`;

/** One side of a headline: a single trait value or a family of them. */
type Contender = { type: string; noun: string; label: string; count: number; medianEdgePct: number; href: string };

/** A trait value as shown: flagged values under their neutral names (lib/brand-safety.ts). */
const shown = (row: TraitAlphaRow) => displayTraitValue(row.traitType, row.value);

const fromRow = (row: TraitAlphaRow): Contender => ({
  type: row.traitType,
  noun: `${shown(row)} Chogs`,
  label: `${shown(row)} Chogs`,
  count: row.count,
  medianEdgePct: row.medianEdgePct,
  href: leagueHref(row),
});

const fromFamily = (family: FamilyStats): Contender => ({
  type: family.type,
  noun: family.noun,
  label: family.noun,
  count: family.count,
  medianEdgePct: family.medianEdgePct,
  href: `/league?trait=${encodeURIComponent(`family:${family.key}`)}`,
});

/** Within one trait type, the best and worst common contenders; the type with the widest gap wins. */
function findHeadline(contenders: Contender[]) {
  let best: { type: string; top: Contender; bottom: Contender; gap: number } | null = null;
  for (const type of new Set(contenders.map((c) => c.type))) {
    const common = contenders.filter((c) => c.type === type && c.count >= HEADLINE_MIN);
    if (common.length < 2) continue;
    const sorted = [...common].sort((a, b) => b.medianEdgePct - a.medianEdgePct);
    const top = sorted[0];
    const bottom = sorted[sorted.length - 1];
    const gap = top.medianEdgePct - bottom.medianEdgePct;
    if (!best || gap > best.gap) best = { type, top, bottom, gap };
  }
  return best;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * The Trait Alpha index: which trait values make the best and worst traders, on real $CHOG history.
 * With the league index (server-built) it also pools related values into families ("laser eyes").
 */
export function TraitAlphaBoard({ index }: { index?: LeagueIndex }) {
  const [span, setSpan] = useState<WindowKey>(DEFAULT_WINDOW);
  const [type, setType] = useState("");
  const [minCount, setMinCount] = useState<number>(10);
  const [sort, setSort] = useState<Sort>({ key: "median", desc: true });
  const { data, error, refetch, isFetching } = useTraitAlpha(span);
  // Families need every Chog's edge; the league shares this query, so it's often cached already.
  const population = usePopulation(span);

  const allRows = useMemo(() => data?.rows ?? [], [data]);
  const types = useMemo(() => [...new Set(allRows.map((r) => r.traitType))].sort(), [allRows]);
  const families = useMemo(
    () => (index && population.data ? familyStats(index, population.data.rows) : []),
    [index, population.data],
  );
  // The story reads best family vs family ("side-eyed Chogs beat laser-eyed Chogs"); single values
  // carry it until the families are in, or when they don't split the field.
  const headline = useMemo(() => {
    const byFamily = findHeadline(families.map(fromFamily));
    return byFamily && byFamily.gap >= 5 ? byFamily : findHeadline(allRows.map(fromRow));
  }, [families, allRows]);
  // Hold the headline until the families are in, so it doesn't change under the reader.
  const headlineReady = !index || !population.isPending;
  const spotlight = useMemo(() => {
    const common = allRows.filter((r) => r.count >= HEADLINE_MIN).sort((a, b) => b.medianEdgePct - a.medianEdgePct);
    return { alpha: common.slice(0, 5), rekt: common.slice(-5).reverse() };
  }, [allRows]);

  const rows = useMemo(() => {
    const filtered = allRows.filter((r) => (!type || r.traitType === type) && r.count >= minCount);
    const dir = sort.desc ? -1 : 1;
    return filtered.sort((a, b) => {
      const va = value(a, sort.key);
      const vb = value(b, sort.key);
      const cmp = typeof va === "string" ? va.localeCompare(vb as string) : va - (vb as number);
      return cmp * dir || b.count - a.count;
    });
  }, [allRows, type, minCount, sort]);
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.medianEdgePct)));

  const sortBy = (key: SortKey) =>
    setSort((current) => (current.key === key ? { key, desc: !current.desc } : { key, desc: key !== "trait" }));

  if (!data) {
    if (!error) return <TraitAlphaSkeleton />;
    return (
      <div role="alert" className="card border-danger/40 px-6 py-10 text-center">
        <p className="font-medium text-danger">Couldn&apos;t load the Trait Alpha index</p>
        <p className="mt-1 break-words font-mono text-xs text-muted">{error.message}</p>
        <button type="button" onClick={() => refetch()} disabled={isFetching} className="btn btn-secondary mt-5">
          {isFetching ? "Retrying…" : "Try again"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-subtle">
          {SIM_LABEL} · {data.window.label} · genome <span className="font-mono">{data.genomeVersion}</span>
          <span className="block">{IN_SAMPLE_NOTE}</span>
        </p>
        <WindowPicker value={span} onChange={setSpan} />
      </div>

      {!headlineReady && <div aria-hidden className="card h-56 animate-pulse sm:h-60" />}

      {headlineReady && headline && (
        <section aria-label="Headline" className="card relative overflow-hidden px-5 py-6 sm:px-8 sm:py-8">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-accent/20 blur-3xl"
          />
          <p className="eyebrow">This window&apos;s headline · {headline.type}</p>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-balance sm:text-4xl">
            <span className="text-success">{capitalize(headline.top.noun)}</span> beat{" "}
            <span className="text-danger">{headline.bottom.noun}</span>
          </p>
          <p className="mt-3 max-w-2xl text-sm text-muted">
            Median edge vs holding:{" "}
            <span className={`font-mono ${edgeTone(headline.top.medianEdgePct)}`}>{signedPct(headline.top.medianEdgePct)}</span> for{" "}
            {formatInt(headline.top.count)} {headline.top.noun} against{" "}
            <span className={`font-mono ${edgeTone(headline.bottom.medianEdgePct)}`}>
              {signedPct(headline.bottom.medianEdgePct)}
            </span>{" "}
            for {formatInt(headline.bottom.count)} {headline.bottom.noun}.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href={headline.top.href} className="btn btn-secondary">
              See the {headline.top.label}
            </Link>
            <Link href={headline.bottom.href} className="btn btn-ghost">
              See the {headline.bottom.label}
            </Link>
          </div>
        </section>
      )}

      {spotlight.alpha.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Spotlight title="Alpha traits" note={`Best median edge, ${HEADLINE_MIN}+ Chogs`} rows={spotlight.alpha} />
          <Spotlight title="Rekt traits" note={`Worst median edge, ${HEADLINE_MIN}+ Chogs`} rows={spotlight.rekt} />
        </div>
      )}

      {families.length > 0 && <Families families={families} />}

      <section aria-labelledby="trait-table-title" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="trait-table-title" className="text-lg font-semibold tracking-tight">
            Every trait value
          </h2>
          <label className="flex items-center gap-2 text-xs text-muted">
            Min. Chogs
            <select value={minCount} onChange={(e) => setMinCount(Number(e.target.value))} className="input w-auto py-1.5 text-xs">
              {MIN_COUNTS.map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? "Any" : `${n}+`}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div role="group" aria-label="Trait type" className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
          {["", ...types].map((t) => (
            <button
              key={t || "all"}
              type="button"
              aria-pressed={type === t}
              onClick={() => setType(t)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors ${
                type === t ? "bg-accent/20 text-foreground ring-accent/50" : "text-muted ring-line hover:text-foreground"
              }`}
            >
              {t || "All traits"}
            </button>
          ))}
        </div>

        <div className="card overflow-hidden">
          <table className="w-full table-fixed text-left text-sm">
            <caption className="sr-only">
              Median simulated edge vs holding $CHOG and share of Chogs beating holding, per trait value. Column headers sort.
            </caption>
            <thead className="border-b border-line text-[11px] uppercase tracking-wider text-subtle">
              <tr>
                <SortHeader label="Trait" sortKey="trait" sort={sort} onSort={sortBy} />
                <SortHeader label="Chogs" sortKey="count" sort={sort} onSort={sortBy} className="hidden w-20 text-right sm:table-cell" />
                <SortHeader label="Median" sortKey="median" sort={sort} onSort={sortBy} className="w-[6.5rem] text-right sm:w-56" />
                <SortHeader label="Beat hold" sortKey="beat" sort={sort} onSort={sortBy} className="w-[5.5rem] text-right sm:w-32" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.traitType}:${row.value}`} className="border-b border-line/50 last:border-0 hover:bg-accent/[0.05]">
                  <th scope="row" className="py-2.5 pr-2 pl-4 font-normal">
                    <Link href={leagueHref(row)} className="group block min-w-0">
                      <span className="block truncate font-medium text-foreground group-hover:underline">{shown(row)}</span>
                      <span className="block truncate text-[11px] text-subtle">
                        {row.traitType}
                        <span className="sm:hidden"> · {formatInt(row.count)} Chogs</span>
                      </span>
                    </Link>
                  </th>
                  <td className="hidden py-2.5 pr-4 text-right font-mono text-xs tabular-nums text-muted sm:table-cell">
                    {formatInt(row.count)}
                  </td>
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center justify-end gap-2">
                      <DivergingBar pct={row.medianEdgePct} maxAbs={maxAbs} />
                      <span className={`w-14 shrink-0 text-right font-mono text-xs tabular-nums ${edgeTone(row.medianEdgePct)}`}>
                        {signedPct(row.medianEdgePct)}
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 pr-4 text-right">
                    <span className="font-mono text-xs tabular-nums text-muted">{Math.round(row.beatHoldPct)}%</span>
                    <span aria-hidden className="mt-1 ml-auto block h-1 w-full max-w-20 overflow-hidden rounded-full bg-surface-2">
                      <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.min(100, row.beatHoldPct)}%` }} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted">No trait value has that many Chogs.</p>}
        </div>
        <p className="text-xs text-subtle">
          Each Chog runs its own genome; a trait&apos;s row summarizes every Chog carrying it, so traits that ride along with
          each other share credit. Points of edge are simulated, not earned.
        </p>
      </section>
    </div>
  );
}

function Families({ families }: { families: FamilyStats[] }) {
  const sorted = [...families].sort((a, b) => b.medianEdgePct - a.medianEdgePct);
  const maxAbs = Math.max(1, ...sorted.map((f) => Math.abs(f.medianEdgePct)));
  return (
    <section aria-labelledby="families-title" className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="families-title" className="font-semibold">
          Trait families
        </h2>
        <span className="text-[11px] text-subtle">Related values pooled: all four laser eyes count as one</span>
      </div>
      <div
        aria-hidden
        className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_3rem] gap-3 px-1 text-[10px] font-medium uppercase tracking-wider text-subtle"
      >
        <span>Family</span>
        <span className="text-right">Median edge</span>
        <span className="text-right">Beat hold</span>
      </div>
      <ol className="mt-1 divide-y divide-line/50">
        {sorted.map((family) => (
          <li key={family.key}>
            <Link
              href={`/league?trait=${encodeURIComponent(`family:${family.key}`)}`}
              className="grid grid-cols-[minmax(0,1fr)_auto_3rem] items-center gap-3 rounded-lg px-1 py-2 hover:bg-surface-2"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {family.label} <span className="text-xs font-normal text-subtle">{family.type}</span>
                </span>
                <span className="block truncate text-[11px] text-subtle">
                  {formatInt(family.count)} Chogs · {family.values.join(", ")}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <DivergingBar pct={family.medianEdgePct} maxAbs={maxAbs} />
                <span className={`w-14 text-right font-mono text-xs tabular-nums ${edgeTone(family.medianEdgePct)}`}>
                  {signedPct(family.medianEdgePct)}
                </span>
              </span>
              <span className="text-right font-mono text-xs tabular-nums text-muted" title="Share of these Chogs that beat holding">
                {Math.round(family.beatHoldPct)}%
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Spotlight({ title, note, rows }: { title: string; note: string; rows: TraitAlphaRow[] }) {
  return (
    <section aria-label={title} className="card p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        <span className="text-[11px] text-subtle">{note}</span>
      </div>
      <ol className="mt-3 space-y-2">
        {rows.map((row, i) => (
          <li key={`${row.traitType}:${row.value}`}>
            <Link href={leagueHref(row)} className="flex items-center gap-3 rounded-lg px-1 py-1 text-sm hover:bg-surface-2">
              <span className="w-4 font-mono text-xs text-subtle">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">
                {shown(row)} <span className="text-xs text-subtle">{row.traitType}</span>
              </span>
              <span className={`font-mono text-xs tabular-nums ${edgeTone(row.medianEdgePct)}`}>{signedPct(row.medianEdgePct)}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  className = "",
}: {
  label: string;
  sortKey: SortKey;
  sort: Sort;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sort.key === sortKey;
  return (
    <th scope="col" aria-sort={active ? (sort.desc ? "descending" : "ascending") : "none"} className={`py-2.5 font-medium first:pl-4 last:pr-4 ${className}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-foreground ${active ? "text-foreground" : ""}`}
      >
        {label}
        <span aria-hidden className={active ? "" : "opacity-0"}>
          {sort.desc ? "↓" : "↑"}
        </span>
      </button>
    </th>
  );
}

/** A bar growing right (green) or left (red) from a center line, scaled to the largest |value| shown. */
function DivergingBar({ pct, maxAbs }: { pct: number; maxAbs: number }) {
  const width = `${Math.min(50, (Math.abs(pct) / maxAbs) * 50)}%`;
  return (
    <span aria-hidden className="relative hidden h-2 w-28 rounded-full bg-surface-2 sm:block">
      <span className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
      <span
        className={`absolute inset-y-0 rounded-full ${pct >= 0 ? "left-1/2 bg-success/70" : "right-1/2 bg-danger/70"}`}
        style={{ width }}
      />
    </span>
  );
}

export function TraitAlphaSkeleton() {
  return (
    <div role="status" className="space-y-6">
      <span className="sr-only">Loading the Trait Alpha index…</span>
      <div aria-hidden className="card h-44 animate-pulse" />
      <div aria-hidden className="grid gap-4 sm:grid-cols-2">
        <div className="card h-48 animate-pulse" />
        <div className="card h-48 animate-pulse" />
      </div>
      <div aria-hidden className="card h-96 animate-pulse" />
    </div>
  );
}
