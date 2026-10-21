"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { TradingStyle } from "@/lib/agent/types";
import type { MarketRow } from "@/lib/market/board";
import { ChogThumb } from "@/components/dna/chog-thumb";
import { EdgeBadge } from "@/components/dna/edge-badge";
import { chogNumberLabel, formatInt } from "@/components/dna/shared";
import { Badge, PillButton, pillClass } from "@/components/v2/primitives";
import { formatListingPrice } from "./format";
import "@/components/dna/dna.css";

type SortKey = "edge" | "price" | "rank";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "edge", label: "vs holding" },
  { key: "price", label: "Price" },
  { key: "rank", label: "League rank" },
];
const STYLES: TradingStyle[] = ["aggressive", "balanced", "cautious"];
const PAGE = 50;

const COMPARE: Record<SortKey, (a: MarketRow, b: MarketRow) => number> = {
  edge: (a, b) => b.edgePct - a.edgePct || a.price - b.price,
  price: (a, b) => a.price - b.price || b.edgePct - a.edgePct,
  rank: (a, b) => a.rank - b.rank || a.price - b.price,
};

/** Token id of the listing with the most simulated edge per MON (positive edges only), or null. */
function bestValueId(rows: readonly MarketRow[]): number | null {
  let best: MarketRow | null = null;
  for (const row of rows) {
    if (!row.featurable || row.edgePct <= 0 || !(row.price > 0)) continue;
    if (!best || row.edgePct / row.price > best.edgePct / best.price) best = row;
  }
  return best?.tokenId ?? null;
}

/** Live listings ranked by Trading DNA: filters (max price, style), sort, and a "Best value" mark. */
export function MarketBoard({ rows }: { rows: MarketRow[] }) {
  const [maxPrice, setMaxPrice] = useState("");
  const [style, setStyle] = useState<TradingStyle | "all">("all");
  const [sort, setSort] = useState<SortKey>("edge");
  const [shown, setShown] = useState(PAGE);

  const currency = rows[0]?.currency ?? "MON";
  const cap = Number(maxPrice);
  const capped = maxPrice.trim() !== "" && Number.isFinite(cap) && cap > 0;

  const visible = useMemo(() => {
    const kept = rows.filter((row) => (!capped || row.price <= cap) && (style === "all" || row.style === style));
    return kept.sort(COMPARE[sort]);
  }, [rows, capped, cap, style, sort]);
  const bestValue = useMemo(() => bestValueId(visible), [visible]);
  const filtered = capped || style !== "all";

  return (
    <section aria-label="Listed Chogs" className="mt-8 sm:mt-10">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <label className="v2-field w-[9.5rem]">
          <span className="v2-label">Max price ({currency})</span>
          <input
            className="v2-input"
            inputMode="decimal"
            placeholder="Any"
            value={maxPrice}
            onChange={(event) => {
              setMaxPrice(event.target.value.replace(/[^\d.]/g, ""));
              setShown(PAGE);
            }}
          />
        </label>
        <div className="v2-field max-w-full max-sm:order-1">
          <span className="v2-label" id="market-style">
            Style
          </span>
          <div role="group" aria-labelledby="market-style" className="dna-scroll-x">
            {(["all", ...STYLES] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={style === value}
                onClick={() => {
                  setStyle(value);
                  setShown(PAGE);
                }}
                className="v2-chip h-12 px-4 text-[13.5px] capitalize"
              >
                {value}
              </button>
            ))}
          </div>
        </div>
        <label className="v2-field w-[10rem]">
          <span className="v2-label">Sort by</span>
          <select className="v2-select" value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
            {SORTS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <p className="v2-faint ml-auto pb-3 text-[13.5px] max-sm:order-2" aria-live="polite">
          {filtered ? `${formatInt(visible.length)} of ${formatInt(rows.length)} listed` : `${formatInt(rows.length)} listed`}
        </p>
      </div>

      {visible.length === 0 ? (
        <p className="v2-muted mt-6 text-[15px]">
          No listings match these filters.{" "}
          <button
            type="button"
            className="v2-link"
            onClick={() => {
              setMaxPrice("");
              setStyle("all");
            }}
          >
            Clear filters
          </button>
        </p>
      ) : (
        <div className="v2-table-wrap mt-4">
          <table className="v2-table dna-league">
            <thead>
              <tr>
                <th scope="col" className="w-px" title="League rank among all 1,969 Chogs">
                  Rank
                </th>
                <th scope="col">Chog</th>
                <th scope="col" className="v2-hide-sm">
                  Style
                </th>
                <th scope="col" className="is-num">
                  vs holding<span className="sm:hidden"> · price</span>
                </th>
                <th scope="col" className="is-num v2-hide-sm">
                  Price
                </th>
                <th scope="col" className="v2-hide-sm w-px">
                  <span className="v2-sr">Buy</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.slice(0, shown).map((row) => (
                <MarketRowView key={row.tokenId} row={row} bestValue={row.tokenId === bestValue} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {visible.length > shown && (
        <div className="mt-4 flex justify-center">
          <PillButton variant="glass" size="sm" onClick={() => setShown((n) => n + PAGE)}>
            Show more ({formatInt(visible.length - shown)})
          </PillButton>
        </div>
      )}
    </section>
  );
}

function MarketRowView({ row, bestValue }: { row: MarketRow; bestValue: boolean }) {
  const label = row.nameNumber ? `CHOG #${row.nameNumber}` : chogNumberLabel(row.tokenId);
  const price = `${formatListingPrice(row.price)} ${row.currency}`;
  return (
    <tr className={bestValue ? "is-highlight" : undefined}>
      <td className={`is-rank ${row.rank <= 3 ? "dna-rank-top" : ""}`}>
        <span className="v2-sr">League rank </span>
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
              {bestValue && (
                <span title="Most simulated vs holding per MON among these listings" className="shrink-0 max-sm:hidden">
                  <Badge tone="teal" className="h-5 px-1.5 text-[10px]">
                    Best value
                  </Badge>
                </span>
              )}
            </span>
            <span className="mt-0.5 block truncate text-xs font-normal text-[var(--v2-faint)]">
              {bestValue && <span className="text-[var(--v2-teal)] sm:hidden">Best value · </span>}
              {label}
              <span className="max-sm:hidden">
                {" "}
                · <span className="text-[var(--v2-nav)]">{row.archetype}</span>
              </span>
            </span>
          </span>
        </span>
      </td>

      <td className="v2-hide-sm v2-muted text-[13.5px] capitalize">{row.style}</td>

      <td className="is-num whitespace-nowrap">
        <span className="v2-sr">Simulated vs holding </span>
        <EdgeBadge pct={row.edgePct} className="text-[15px]" />
        {/* Phones: the price sits under the score and is the buy link (the Price and Buy columns are hidden). */}
        <a
          href={row.buyUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Buy ${row.name} (${label}) for ${price} on OpenSea`}
          className="dna-above v2-num mt-0.5 block text-[13.5px] text-[var(--v2-ink)] sm:hidden"
        >
          {formatListingPrice(row.price)}
          <span className="ml-1 text-xs text-[var(--v2-faint)]">{row.currency}</span>
          <span aria-hidden className="ml-1 text-[var(--v2-teal)]">
            ↗
          </span>
        </a>
      </td>

      <td className="is-num v2-hide-sm whitespace-nowrap">
        <span className="v2-num text-[15px] text-[var(--v2-ink)]">
          {formatListingPrice(row.price)}
          <span className="ml-1 text-xs text-[var(--v2-faint)]">{row.currency}</span>
        </span>
      </td>

      <td className="v2-hide-sm w-px text-right">
        <a
          href={row.buyUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Buy ${row.name} (${label}) for ${price} on OpenSea`}
          className={`${pillClass("glass", "sm")} dna-above whitespace-nowrap`}
        >
          Buy <span aria-hidden>↗</span>
        </a>
      </td>
    </tr>
  );
}
