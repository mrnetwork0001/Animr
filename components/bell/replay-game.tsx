"use client";

import { useCallback, useState } from "react";
import type { BellCall, BellSummary } from "@/lib/bell/types";
import { useBells } from "./api";
import { Forecast, LABEL, SectionTitle, Skeleton, Stamp } from "./bits";
import { CallCard } from "./call-card";
import { errorOf, formatDay, formatErrorPts, formatPoints, formatPrice, herdLine, hitOf, signedPct } from "./format";
import { BullBearBar, HerdHistogram, sharePastError } from "./herd";

const CANDIDATES = 6;

/** Featured and boldest calls interleaved, without repeats: a mix of steady hands and wild ones. */
function candidatesOf(bell: BellSummary): BellCall[] {
  const seen = new Set<number>();
  const picks: BellCall[] = [];
  for (let i = 0; i < Math.max(bell.featured.length, bell.boldest.length); i++) {
    for (const call of [bell.featured[i], bell.boldest[i]]) {
      if (!call || seen.has(call.tokenId) || picks.length >= CANDIDATES) continue;
      seen.add(call.tokenId);
      picks.push(call);
    }
  }
  return picks;
}

const closeness = (call: BellCall, actualPct: number) => errorOf(call, actualPct) ?? Number.POSITIVE_INFINITY;

/** For the "Surprise me" button (called from its click handler, never while rendering). */
const randomItem = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

/**
 * "Replay a past Bell": pick a settled day, read that day's calls without the answer, ride one,
 * and the real result is revealed at once from the settled data. Just for fun: nothing is saved.
 */
export function ReplayGame({ days, id }: { days: string[]; id?: string }) {
  const bells = useBells(days);
  const playable = bells
    .map((query) => query.data)
    .filter((b): b is BellSummary => b?.status === "settled" && b.actualPct !== null && b.calls > 0);
  const loading = bells.some((query) => query.isPending);
  const [chosenDay, setChosenDay] = useState<string | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [session, setSession] = useState({ rounds: 0, points: 0 });

  // Oldest first by default: the newest settled Bell's result is already shown on this page.
  const bell = playable.find((b) => b.day === chosenDay) ?? playable[playable.length - 1];
  const candidates = bell ? candidatesOf(bell) : [];
  const picked = candidates.find((call) => call.tokenId === pick);

  const choose = (day: string) => {
    setChosenDay(day);
    setPick(null);
  };
  const ride = (call: BellCall) => {
    setPick(call.tokenId);
    setSession((s) => ({ rounds: s.rounds + 1, points: s.points + (call.points ?? 0) }));
  };
  const surprise = () => {
    const others = playable.filter((b) => b.day !== bell?.day);
    if (others.length > 0) choose(randomItem(others).day);
  };
  // Walks forward in time through the playable days, wrapping around (or replays a lone day).
  const playNext = () => {
    if (!bell) return;
    const index = playable.findIndex((b) => b.day === bell.day);
    choose(playable[(index + playable.length - 1) % playable.length].day);
  };

  return (
    <section id={id} aria-label="Replay a past Bell" className="scroll-mt-28 md:scroll-mt-24">
      <SectionTitle
        title="Replay a past Bell"
        hint="Practice mini-game: see a past Bell's calls without the answer, ride one, get the real result at once. Nothing is saved."
        action={
          session.rounds > 0 && (
            <span className="chip" title="Practice: these points aren't saved to your fan card">
              Practice · not saved: {session.rounds} {session.rounds === 1 ? "replay" : "replays"} ·{" "}
              <span className="font-mono text-accent-strong">{formatPoints(session.points)} pts</span>
            </span>
          )
        }
      />
      <div className="card p-4 sm:p-5">
        {!bell ? (
          loading ? (
            <div role="status" className="space-y-3">
              <span className="sr-only">Loading past Bells…</span>
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-32" />
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-subtle">
              No settled Bells to replay yet. Come back after the first one settles.
            </p>
          )
        ) : (
          <>
            <div>
              <h3 className={LABEL}>1 · Pick a day</h3>
              <div role="group" aria-label="Past Bells to replay" className="mt-2 flex flex-wrap gap-1.5">
                {[...playable].reverse().map((b) => (
                  <button
                    key={b.day}
                    type="button"
                    aria-pressed={b.day === bell.day}
                    onClick={() => choose(b.day)}
                    className={`chip transition-colors ${
                      b.day === bell.day
                        ? "border-accent bg-accent/15 text-foreground"
                        : "hover:border-accent hover:text-foreground"
                    }`}
                  >
                    {formatDay(b.day)}
                    {b.kind === "replay" && <span className="text-subtle">· replay</span>}
                  </button>
                ))}
                {playable.length > 1 && (
                  <button type="button" onClick={surprise} className="chip border-dashed hover:text-foreground">
                    Surprise me
                  </button>
                )}
              </div>
            </div>

            <div className="mt-5">
              <h3 className={LABEL}>2 · The herd at the Bell of {formatDay(bell.day)}</h3>
              <HerdHistogram
                bell={bell}
                className="mt-3"
                marks={
                  picked
                    ? [
                        { pct: bell.actualPct ?? 0, label: "Actual", tone: "actual" },
                        { pct: picked.forecastPct, label: "Your pick", tone: "pick" },
                      ]
                    : []
                }
              />
              <BullBearBar bell={bell} className="mt-3" />
              <p className="mt-3 text-xs text-subtle">
                $CHOG traded at <span className="font-mono text-muted">{formatPrice(bell.entryPrice)}</span> WMON at the
                Bell. Which Chog would you have ridden?
              </p>
            </div>

            <p role="status" className="sr-only">
              {picked && bell.actualPct !== null
                ? `$CHOG really moved ${signedPct(bell.actualPct)}. Chog #${picked.tokenId} called ${signedPct(picked.forecastPct)}${
                    typeof picked.points === "number" ? ` and scored ${formatPoints(picked.points)} points` : ""
                  }.`
                : ""}
            </p>
            {picked && bell.actualPct !== null && (
              <Reveal
                bell={bell}
                actualPct={bell.actualPct}
                picked={picked}
                candidates={candidates}
                next={{ label: playable.length > 1 ? "Play another day" : "Play again", onClick: playNext }}
              />
            )}

            <h3 className={`${LABEL} mt-6`}>3 · Ride one</h3>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {candidates.map((call) => {
                const mine = call.tokenId === pick;
                return (
                  <CallCard
                    key={call.tokenId}
                    call={call}
                    bell={bell}
                    reveal={Boolean(picked)}
                    className={`bg-surface-2/40 shadow-none ${mine ? "ring-2 ring-accent" : ""}`}
                    action={
                      picked ? (
                        mine && <p className="text-center text-xs font-semibold text-accent-strong">Your pick</p>
                      ) : (
                        <button type="button" onClick={() => ride(call)} className="btn btn-secondary w-full">
                          Ride Chog #{call.tokenId}
                        </button>
                      )
                    }
                  />
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function Reveal({
  bell,
  actualPct,
  picked,
  candidates,
  next,
}: {
  bell: BellSummary;
  actualPct: number;
  picked: BellCall;
  candidates: BellCall[];
  next: { label: string; onClick: () => void };
}) {
  // Brings the result into view when it appears (a ref callback runs once on mount).
  const showResult = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "nearest" });
  }, []);

  const error = errorOf(picked, actualPct);
  const hit = hitOf(picked, actualPct);
  const ranked = [...candidates].sort((a, b) => closeness(a, actualPct) - closeness(b, actualPct));
  const place = ranked.findIndex((call) => call.tokenId === picked.tokenId) + 1;
  const best = ranked[0];
  const beat = error === null ? null : sharePastError(bell.histogram, actualPct, error);

  return (
    <div ref={showResult} className="bell-pop mt-5 scroll-mt-28 rounded-2xl md:scroll-mt-24 border border-accent/40 bg-accent/10 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div>
          <p className={LABEL}>$CHOG really moved</p>
          <Forecast pct={actualPct} size="xl" className="mt-1" />
        </div>
        <div className="min-w-0 flex-1 basis-60 text-sm">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
            {hit !== null && <Stamp hit={hit} />}
            Chog #{picked.tokenId} called <Forecast pct={picked.forecastPct} size="sm" />
          </p>
          <p className="mt-1.5 text-muted">
            {error !== null && <>Off by {formatErrorPts(error)}. </>}
            {typeof picked.points === "number" && (
              <>
                It scored <span className="font-mono font-semibold text-accent-strong">+{formatPoints(picked.points)} pts</span>
                :{" "}
              </>
            )}
            #{place} of {candidates.length} here
            {beat !== null && <>, closer than about {Math.round(beat)}% of the herd</>}.
          </p>
          <p className="mt-1 text-xs text-subtle">
            {herdLine(bell, actualPct)}{" "}
            {best && best.tokenId !== picked.tokenId ? `Best pick here: Chog #${best.tokenId}.` : "You found the best pick here."}
            {bell.oracle && ` Oracle of the Day: Chog #${bell.oracle.tokenId}.`}
          </p>
        </div>
        <button type="button" onClick={next.onClick} className="btn btn-primary">
          {next.label}
        </button>
      </div>
    </div>
  );
}
