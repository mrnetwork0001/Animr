"use client";

import { useEffect, useState } from "react";
import type { ChogStanding } from "@/lib/dna/types";
import { hero, statBand } from "./content";

// The landing page is prerendered, so its League numbers are computed from the committed candles at build time. The
// League, the replay and a Chog's page read the live rolling window (GET /api/dna/...), which moves on every hour.
// These islands swap the build-time numbers for the live ones once the page is idle, so the landing, /replay and
// /league always agree; the build-time numbers stay as the no-JS fallback (and when the API can't answer, e.g. a
// Chog its holder hid answers 404).

const WINDOW = "45d";

const requests = new Map<number, Promise<ChogStanding | null>>();

function loadStanding(tokenId: number): Promise<ChogStanding | null> {
  let request = requests.get(tokenId);
  if (!request) {
    request = fetch(`/api/dna/${tokenId}/standing?window=${WINDOW}`)
      .then((res) => (res.ok ? (res.json() as Promise<ChogStanding>) : null))
      .then((body) => (body && body.row && typeof body.row.edgePct === "number" && body.stats ? body : null))
      .catch(() => {
        requests.delete(tokenId);
        return null;
      });
    requests.set(tokenId, request);
  }
  return request;
}

/** The live standing of `tokenId` once the page is idle, or null (before, and whenever the API can't answer). */
function useLiveStanding(tokenId: number): ChogStanding | null {
  const [standing, setStanding] = useState<ChogStanding | null>(null);
  useEffect(() => {
    let active = true;
    const load = () => void loadStanding(tokenId).then((value) => active && value && setStanding(value));
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(load, { timeout: 3_000 });
      return () => {
        active = false;
        window.cancelIdleCallback(handle);
      };
    }
    const timer = setTimeout(load, 1_000);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [tokenId]);
  return standing;
}

/** "+9.1%" / "−9.4%" with a real minus sign (same as showcase.ts). */
function signedPct(pct: number, digits = 1): string {
  if (!Number.isFinite(pct)) return "—";
  const rounded = Math.abs(pct) < 0.5 * 10 ** -digits ? 0 : pct;
  return `${rounded > 0 ? "+" : rounded < 0 ? "−" : ""}${Math.abs(rounded).toFixed(digits)}%`;
}

/** "39%" or "38.6%" (same as showcase.ts). */
function plainPct(pct: number): string {
  const text = pct.toFixed(1);
  return `${text.endsWith(".0") ? text.slice(0, -2) : text}%`;
}

const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const YEAR = new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: "UTC" });

/** "Sep 6 – Oct 21, 2026" from unix seconds (same as showcase.ts). */
function windowLabel(from: number, to: number): string {
  const [a, b] = [from * 1000, to * 1000];
  const fromYear = YEAR.format(a) === YEAR.format(b) ? "" : `, ${YEAR.format(a)}`;
  return `${DAY.format(a)}${fromYear} – ${DAY.format(b)}, ${YEAR.format(b)}`;
}

export type BuildScore = { edgePct: number; rank: number; total: number; window: string };

/** The hero card's score: build-time numbers first, then the live League's. */
export function HeroScore({ tokenId, build }: { tokenId: number; build: BuildScore }) {
  const live = useLiveStanding(tokenId);
  const score: BuildScore = live
    ? { edgePct: live.row.edgePct, rank: live.row.rank, total: live.total, window: windowLabel(live.window.from, live.window.to) }
    : build;
  return (
    <>
      <span className={`font-semibold tabular-nums ${score.edgePct >= 0 ? "text-success" : "text-danger"}`}>
        {signedPct(score.edgePct)}
      </span>{" "}
      <span className="text-foreground">{hero.visual.vsHolding}</span>
      <span className="block text-xs text-subtle">
        {hero.visual.rank(score.rank, score.total)} · {score.window} · simulated
      </span>
    </>
  );
}

export type BuildLeague = {
  total: number;
  genomeVersion: string;
  window: string;
  beatHoldPct: number;
  medianEdgePct: number;
  bestEdgePct: number;
  worstEdgePct: number;
};

/** The stat band's four tiles and caption: build-time numbers first, then the live League's. */
export function LeagueTiles({ tokenId, build, note }: { tokenId: number; build: BuildLeague; note: string }) {
  const live = useLiveStanding(tokenId);
  const league: BuildLeague = live
    ? {
        total: live.total,
        genomeVersion: live.genomeVersion,
        window: windowLabel(live.window.from, live.window.to),
        ...live.stats,
      }
    : build;
  // Symmetric on purpose: the best and the worst Chog get the same weight.
  const tiles = [
    { label: statBand.beat, value: plainPct(league.beatHoldPct) },
    { label: statBand.median, value: signedPct(league.medianEdgePct) },
    { label: statBand.best, value: signedPct(league.bestEdgePct) },
    { label: statBand.worst, value: signedPct(league.worstEdgePct) },
  ];
  return (
    <figure>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line/70 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="flex flex-col-reverse justify-end gap-1.5 bg-background/90 px-5 py-5 sm:px-6 sm:py-6">
            <dt className="text-sm leading-snug text-pretty text-muted">{tile.label}</dt>
            <dd className="text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">{tile.value}</dd>
          </div>
        ))}
      </dl>
      <figcaption className="mt-3 max-w-4xl text-xs leading-relaxed text-pretty text-subtle">
        {live
          ? statBand.liveCaption(league.total, league.genomeVersion, league.window)
          : statBand.caption(league.total, league.genomeVersion, league.window)}{" "}
        {note}
      </figcaption>
    </figure>
  );
}
