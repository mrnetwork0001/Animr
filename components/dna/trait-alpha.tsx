"use client";

import Link from "next/link";
import { type ReactNode, useId, useMemo, useState } from "react";
import { GenomeIcon, PulseIcon } from "@/components/v2/icons";
import { EmptyState, GlassCard, PageHeader, SectionTitle, pillClass } from "@/components/v2/primitives";
import { displayTraitValue } from "@/lib/brand-safety";
import type { TraitAlphaRow } from "@/lib/dna/types";
import { useIsClient } from "../connect-button";
import { usePopulation, useTraitAlpha } from "./api";
import { EdgeBadge } from "./edge-badge";
import { type FamilyStats, familyStats } from "./families";
import type { LeagueIndex } from "./league-index";
import { DEFAULT_WINDOW, type WindowKey, formatInt, windowDates } from "./shared";
import { WindowPicker } from "./window-picker";
import "./dna.css";

type SortKey = "trait" | "count" | "median" | "beat";
type Sort = { key: SortKey; desc: boolean };
const SORTS: { key: SortKey; label: string }[] = [
  { key: "median", label: "Median" },
  { key: "beat", label: "Beat holding" },
  { key: "count", label: "Chogs" },
  { key: "trait", label: "A–Z" },
];

const MIN_COUNTS = [1, 5, 10, 25] as const;
/** The index opens on one trait type (all 13 at once run thousands of pixels): eyes pick the signal. */
const DEFAULT_TYPE = "Eyes";
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

/** The page's title block, from the server (the board renders it so the headline can sit beside it). */
export type TraitAlphaHeader = { title: ReactNode; lead: ReactNode; actions?: ReactNode };

/**
 * The Traits index: which trait values make the best and worst traders, on real $CHOG history.
 * With the league index (server-built) it also pools related values into families ("laser eyes").
 * With `header`, it renders the page header too, with this window's headline as its aside.
 */
export function TraitAlphaBoard({ index, header }: { index?: LeagueIndex; header?: TraitAlphaHeader }) {
  const [span, setSpan] = useState<WindowKey>(DEFAULT_WINDOW);
  /** The trait type shown in the full index; "" is every type. */
  const [type, setType] = useState(DEFAULT_TYPE);
  const [minCount, setMinCount] = useState<number>(10);
  const [sort, setSort] = useState<Sort>({ key: "median", desc: true });
  const traits = useTraitAlpha(span);
  const { error, refetch, isFetching } = traits;
  // Families need every Chog's edge; the league shares this query, so it's often cached already.
  const population = usePopulation(span);
  // The server renders the loading state; a query already in the cache only shows after hydration (no mismatch).
  const hydrated = useIsClient();
  const data = hydrated ? traits.data : undefined;
  const populationRows = hydrated ? population.data?.rows : undefined;
  const tableTitleId = useId();

  const allRows = useMemo(() => data?.rows ?? [], [data]);
  // A–Z, with the default type first so its chip is in view on a phone (the row scrolls sideways).
  const types = useMemo(
    () => [...new Set(allRows.map((r) => r.traitType))].sort((a, b) => Number(b === DEFAULT_TYPE) - Number(a === DEFAULT_TYPE) || a.localeCompare(b)),
    [allRows],
  );
  // A type this window doesn't have (the default, on odd data) falls back to every type.
  const shownType = type && types.length > 0 && !types.includes(type) ? "" : type;
  const families = useMemo(() => (index && populationRows ? familyStats(index, populationRows) : []), [index, populationRows]);
  // The story reads best family vs family ("side-eyed Chogs beat laser-eyed Chogs"); single values
  // carry it until the families are in, or when they don't split the field.
  const headline = useMemo(() => {
    const byFamily = findHeadline(families.map(fromFamily));
    return byFamily && byFamily.gap >= 5 ? byFamily : findHeadline(allRows.map(fromRow));
  }, [families, allRows]);
  // Hold the headline until the families are in, so it doesn't change under the reader.
  const headlineReady = Boolean(data) && (!index || (hydrated && !population.isPending));
  const spotlight = useMemo(() => {
    const common = allRows.filter((r) => r.count >= HEADLINE_MIN).sort((a, b) => b.medianEdgePct - a.medianEdgePct);
    return { alpha: common.slice(0, 5), rekt: common.slice(-5).reverse() };
  }, [allRows]);

  const rows = useMemo(() => {
    const filtered = allRows.filter((r) => (!shownType || r.traitType === shownType) && r.count >= minCount);
    const dir = sort.desc ? -1 : 1;
    return filtered.sort((a, b) => {
      const va = value(a, sort.key);
      const vb = value(b, sort.key);
      const cmp = typeof va === "string" ? va.localeCompare(vb as string) : va - (vb as number);
      return cmp * dir || b.count - a.count;
    });
  }, [allRows, shownType, minCount, sort]);
  // One card per trait type, in the order of each type's best row under the current sort.
  const groups = useMemo(() => {
    const byType = new Map<string, TraitAlphaRow[]>();
    for (const row of rows) byType.set(row.traitType, [...(byType.get(row.traitType) ?? []), row]);
    return [...byType];
  }, [rows]);
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.medianEdgePct)));

  const sortBy = (key: SortKey) =>
    setSort((current) => (current.key === key ? { key, desc: !current.desc } : { key, desc: key !== "trait" }));

  const picker = <WindowPicker value={span} onChange={setSpan} />;
  const pageHeader = header && (
    <PageHeader
      title={header.title}
      lead={header.lead}
      actions={header.actions}
      aside={
        headlineReady && headline && data ? (
          <Headline headline={headline} picker={picker} dates={windowDates(data.window)} />
        ) : (
          <HeadlineSkeleton />
        )
      }
    />
  );

  if (!data) {
    return (
      <>
        {pageHeader}
        {error && hydrated ? (
          <div role="alert" className="v2-section">
            <EmptyState
              icon={<PulseIcon />}
              title="Couldn't load the traits"
              body={<span className="v2-mono break-words">{error.message}</span>}
              actions={
                <button type="button" onClick={() => refetch()} disabled={isFetching} className={pillClass("glass")}>
                  {isFetching ? "Retrying…" : "Try again"}
                </button>
              }
            />
          </div>
        ) : (
          <TraitAlphaSkeleton bare />
        )}
      </>
    );
  }

  return (
    <>
      {pageHeader}

      {/* Without the header the picker has no headline to sit in. */}
      {!header && <div className="mt-6 flex justify-end">{picker}</div>}

      {spotlight.alpha.length > 0 && (
        <section aria-labelledby="spotlight-title" className="v2-section">
          <SectionTitle
            id="spotlight-title"
            title="Alpha and rekt traits"
            description={`The five best and five worst medians vs holding among trait values ${HEADLINE_MIN}+ Chogs wear.`}
          />
          <div className="v2-grid--2 grid gap-4">
            <Spotlight title="Alpha traits" tone="up" rows={spotlight.alpha} />
            <Spotlight title="Rekt traits" tone="down" rows={spotlight.rekt} />
          </div>
        </section>
      )}

      {families.length > 0 && <Families families={families} />}

      <section aria-labelledby={tableTitleId} className="v2-section">
        <SectionTitle
          id={tableTitleId}
          title="Every trait value"
          description="Pick a trait type. Each row opens the League filtered to the Chogs wearing it."
          action={
            <label className="flex items-center gap-2 text-[13px] text-[var(--v2-faint)]">
              Min. Chogs
              <select
                value={minCount}
                onChange={(e) => setMinCount(Number(e.target.value))}
                className="v2-select dna-select-sm h-9 w-auto"
              >
                {MIN_COUNTS.map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? "Any" : `${n}+`}
                  </option>
                ))}
              </select>
            </label>
          }
        />

        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div role="group" aria-label="Trait type" className="dna-scroll-x -mx-[var(--v2-gutter)] px-[var(--v2-gutter)] lg:mx-0 lg:flex-wrap lg:px-0">
            {[...types, ""].map((t) => (
              <button
                key={t || "all"}
                type="button"
                aria-pressed={shownType === t}
                onClick={() => setType(t)}
                className="v2-chip h-8 shrink-0 cursor-pointer px-3"
              >
                {t || "All traits"}
              </button>
            ))}
          </div>
          <div role="group" aria-label="Sort trait values" className="v2-tabs shrink-0 self-start">
            {SORTS.map(({ key, label }) => {
              const active = sort.key === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => sortBy(key)}
                  aria-label={active ? `${label}, ${sort.desc ? "descending" : "ascending"}: press to reverse` : `Sort by ${label}`}
                  className="v2-tab h-[30px] px-3 text-[13px]"
                >
                  {label}
                  {active && <span aria-hidden>{sort.desc ? "↓" : "↑"}</span>}
                </button>
              );
            })}
          </div>
        </div>

        {groups.length === 0 ? (
          <EmptyState
            icon={<GenomeIcon />}
            title="No trait value has that many Chogs"
            body="Lower the minimum or pick another trait type."
            actions={
              <button type="button" onClick={() => setMinCount(1)} className={pillClass("glass")}>
                Show every value
              </button>
            }
          />
        ) : (
          // One trait type spans the full width; every type flows into columns.
          <div className={groups.length > 1 ? "dna-columns" : undefined}>
            {groups.map(([traitType, typeRows]) => (
              <TraitGroup key={traitType} type={traitType} rows={typeRows} maxAbs={maxAbs} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

type Headline = NonNullable<ReturnType<typeof findHeadline>>;

/** The header's aside: this window's widest split, winner in teal, loser in violet, with the window picker. */
function Headline({ headline, picker, dates }: { headline: Headline; picker: ReactNode; dates: string }) {
  return (
    <GlassCard feature as="section" aria-label="This window's headline" className="p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13.5px] text-[var(--v2-nav)]">Widest split: {headline.type}</p>
        {picker}
      </div>
      <p className="mt-5 font-[family-name:var(--v2-font-display)] text-[clamp(26px,1.6vw+18px,38px)] leading-[1.12] font-[380] tracking-[-0.018em] text-balance">
        <span className="text-[var(--v2-teal)]">{capitalize(headline.top.noun)}</span>{" "}
        <span className="text-[var(--v2-nav)]">beat</span> <span className="text-[var(--v2-violet-ink)]">{headline.bottom.noun}</span>
      </p>
      <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-[var(--v2-line-soft)] pt-5">
        {[headline.top, headline.bottom].map((side, i) => (
          <div key={side.href} className="min-w-0">
            <dt className="flex items-center gap-2 truncate text-[13px] text-[var(--v2-nav)]">
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ background: i === 0 ? "var(--v2-teal)" : "var(--v2-violet-ink)" }}
              />
              <span className="truncate">
                {formatInt(side.count)} {side.label}
              </span>
            </dt>
            <dd className="mt-1.5">
              <span className="v2-sr">Median vs holding </span>
              <EdgeBadge pct={side.medianEdgePct} className="text-[length:var(--v2-fs-stat-sm)]" />
              <Link href={side.href} className="v2-link mt-1.5 block w-fit text-[13px] font-normal">
                See them
              </Link>
            </dd>
          </div>
        ))}
      </dl>
      <p className="v2-note mt-5">Simulated · {dates}</p>
    </GlassCard>
  );
}

function HeadlineSkeleton() {
  return (
    <div role="status" className="v2-card p-5 sm:p-7">
      <span className="v2-sr">Loading this window&apos;s headline…</span>
      <span aria-hidden className="flex items-center justify-between gap-3">
        <span className="v2-skeleton v2-skeleton--text w-32" />
        <span className="v2-skeleton h-[40px] w-[168px] rounded-full" />
      </span>
      <span aria-hidden className="mt-5 block space-y-3">
        <span className="v2-skeleton v2-skeleton--title w-11/12" />
        <span className="v2-skeleton v2-skeleton--title w-2/3" />
      </span>
      <span aria-hidden className="mt-6 grid grid-cols-2 gap-4 border-t border-[var(--v2-line-soft)] pt-5">
        <span className="v2-skeleton v2-skeleton--title w-24" />
        <span className="v2-skeleton v2-skeleton--title w-24" />
      </span>
    </div>
  );
}

/** A bar from the "just holding" hairline: violet-to-teal ahead, danger behind. Decorative: the number is beside it. */
function DivergingBar({ pct, maxAbs, className = "" }: { pct: number; maxAbs: number; className?: string }) {
  const width = Math.min(50, (Math.abs(pct) / maxAbs) * 50);
  return (
    <span aria-hidden className={`dna-dbar ${className}`}>
      {Number.isFinite(pct) && width >= 0.4 && <span data-tone={pct > 0 ? "up" : "down"} style={{ width: `${width}%` }} />}
    </span>
  );
}

function TraitGroup({ type, rows, maxAbs }: { type: string; rows: TraitAlphaRow[]; maxAbs: number }) {
  const headingId = useId();
  return (
    <GlassCard as="section" aria-labelledby={headingId} padding="flush">
      <div className="flex items-baseline justify-between gap-3 px-5 pt-5 pb-3">
        <h3 id={headingId} className="v2-h3">
          {type}
        </h3>
        <span className="text-xs text-[var(--v2-faint)]">
          {rows.length} {rows.length === 1 ? "value" : "values"}
        </span>
      </div>
      <table className="w-full table-fixed border-collapse text-left text-[13.5px]">
        <caption className="v2-sr">
          {type}: median simulated result vs holding $CHOG and share of Chogs beating holding, per value.
        </caption>
        <thead className="text-[10.5px] tracking-[0.12em] text-[var(--v2-faint)] uppercase">
          <tr className="border-y border-[var(--v2-line-soft)]">
            <th scope="col" className="py-2 pl-5 font-[520]">
              Value
            </th>
            <th scope="col" className="hidden w-[30%] py-2 font-[520] sm:table-cell">
              <span className="v2-sr">Edge bar</span>
            </th>
            <th scope="col" className="w-[5.5rem] py-2 text-right font-[520]">
              Median
            </th>
            <th scope="col" className="w-[7.5rem] py-2 pr-5 text-right font-[520] whitespace-nowrap">
              Beat holding
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.traitType}:${row.value}`} className="border-b border-[var(--v2-line-soft)] last:border-0 hover:bg-white/[0.03]">
              <th scope="row" className="py-2.5 pr-3 pl-5 font-normal">
                <Link href={leagueHref(row)} className="group block min-w-0">
                  <span className="block truncate text-[var(--v2-ink)] group-hover:text-[var(--v2-kicker)]">{shown(row)}</span>
                  <span className="v2-num block truncate text-[11.5px] text-[var(--v2-faint)]">{formatInt(row.count)} Chogs</span>
                </Link>
              </th>
              <td className="hidden py-2.5 pr-3 sm:table-cell">
                <DivergingBar pct={row.medianEdgePct} maxAbs={maxAbs} />
              </td>
              <td className="py-2.5 text-right">
                <EdgeBadge pct={row.medianEdgePct} className="text-[14.5px]" />
              </td>
              <td className="v2-num py-2.5 pr-5 text-right text-[14.5px] text-[var(--v2-nav)]" title="Share of these Chogs that beat holding">
                {Math.round(row.beatHoldPct)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </GlassCard>
  );
}

/** The families list's columns (its header row uses the same grid). */
const FAMILY_GRID =
  "grid grid-cols-[minmax(0,1fr)_auto_6rem] items-center gap-x-4 px-5 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_5.5rem_6.5rem] sm:px-6";

function Families({ families }: { families: FamilyStats[] }) {
  const sorted = [...families].sort((a, b) => b.medianEdgePct - a.medianEdgePct);
  const maxAbs = Math.max(1, ...sorted.map((f) => Math.abs(f.medianEdgePct)));
  return (
    <section aria-labelledby="families-title" className="v2-section">
      <SectionTitle
        id="families-title"
        title="Trait families"
        description="Related values pooled: all four laser eyes count as one, so the bigger groups speak louder."
      />
      <GlassCard padding="flush">
        <div
          aria-hidden
          className={`${FAMILY_GRID} v2-th border-b border-[var(--v2-line-soft)] py-2.5`}
        >
          <span>Family</span>
          <span className="max-sm:hidden" />
          <span className="text-right">Median</span>
          <span className="text-right">Beat holding</span>
        </div>
        <ol className="divide-y divide-[var(--v2-line-soft)]">
          {sorted.map((family) => (
            <li key={family.key}>
              <Link
                href={`/league?trait=${encodeURIComponent(`family:${family.key}`)}`}
                className={`${FAMILY_GRID} py-3.5 transition-colors hover:bg-white/[0.03]`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-[15px] text-[var(--v2-ink)]">
                    {family.label} <span className="text-xs text-[var(--v2-faint)]">{family.type}</span>
                  </span>
                  <span className="block truncate text-xs text-[var(--v2-faint)]">
                    <span className="v2-num">{formatInt(family.count)}</span> Chogs · {family.values.join(", ")}
                  </span>
                </span>
                <DivergingBar pct={family.medianEdgePct} maxAbs={maxAbs} className="max-sm:hidden" />
                <span className="text-right">
                  <span className="v2-sr">Median edge </span>
                  <EdgeBadge pct={family.medianEdgePct} className="text-[15px]" />
                </span>
                <span className="v2-num text-right text-[15px] text-[var(--v2-nav)]" title="Share of these Chogs that beat holding">
                  <span className="v2-sr">Beat holding: </span>
                  {Math.round(family.beatHoldPct)}%
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </GlassCard>
    </section>
  );
}

function Spotlight({ title, tone, rows }: { title: string; tone: "up" | "down"; rows: TraitAlphaRow[] }) {
  const headingId = useId();
  const maxAbs = Math.max(1, ...rows.map((row) => Math.abs(row.medianEdgePct)));
  return (
    <GlassCard as="section" aria-labelledby={headingId}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={headingId} className="v2-h3">
          {title}
        </h3>
        <span className="text-xs text-[var(--v2-faint)]">Median, {HEADLINE_MIN}+ Chogs</span>
      </div>
      <ol className="mt-4 space-y-1">
        {rows.map((row, i) => (
          <li key={`${row.traitType}:${row.value}`}>
            <Link
              href={leagueHref(row)}
              className="-mx-2 grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-[var(--v2-r-sm)] px-2 py-2 transition-colors hover:bg-white/[0.035]"
            >
              <span className="v2-num text-[15px] text-[var(--v2-faint)]">{i + 1}</span>
              <span className="min-w-0 truncate text-[15px] text-[var(--v2-ink)]">
                {shown(row)} <span className="text-xs text-[var(--v2-faint)]">{row.traitType}</span>
              </span>
              <EdgeBadge pct={row.medianEdgePct} className="text-[15px]" />
              <span aria-hidden className="dna-bar col-start-2 col-end-4" data-tone={tone}>
                <span style={{ width: `${Math.max(4, (Math.abs(row.medianEdgePct) / maxAbs) * 100)}%` }} />
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </GlassCard>
  );
}

/** Loading state for the board (bare: without the header, which renders its own). */
export function TraitAlphaSkeleton({ bare = false }: { bare?: boolean }) {
  return (
    <div role="status">
      <span className="v2-sr">Loading the traits…</span>
      {!bare && <HeadlineSkeleton />}
      <div aria-hidden className="v2-section">
        <span className="block space-y-3">
          <span className="v2-skeleton v2-skeleton--text w-20" />
          <span className="v2-skeleton v2-skeleton--title w-64" />
        </span>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <span className="v2-skeleton v2-skeleton--card h-72" />
          <span className="v2-skeleton v2-skeleton--card h-72" />
        </div>
      </div>
    </div>
  );
}
