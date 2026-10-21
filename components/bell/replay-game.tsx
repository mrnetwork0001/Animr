"use client";

import { useCallback, useState } from "react";
import type { BellCall, BellSummary } from "@/lib/bell/types";
import { useBells } from "./api";
import { Forecast, LABEL, SectionTitle, Skeleton, Stamp } from "./bits";
import { CallCard } from "./call-card";
import { useChogTitle } from "./names";
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
 * Practice on a past Bell: pick a settled day, read that day's calls without the answer, ride one, and the real
 * result is revealed at once from the settled data. Just for fun: nothing is saved.
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
    <section id={id} aria-label="Practice on a past Bell" className="scroll-mt-28 md:scroll-mt-24">
      <SectionTitle
        title="Practice on a past Bell"
        hint="Read a past Bell's calls without the answer, ride one, and see the real result at once. Nothing is saved."
        action={
          session.rounds > 0 && (
            <span className="v2-chip" title="Practice points aren't saved to your fan card">
              {session.rounds} {session.rounds === 1 ? "round" : "rounds"},{" "}
              <span className="text-[var(--v2-kicker)]">
                <span className="v2-num">{formatPoints(session.points)}</span> practice points
              </span>
            </span>
          )
        }
      />
      <div className="v2-card">
        {!bell ? (
          loading ? (
            <div role="status" className="space-y-3">
              <span className="v2-sr">Loading past Bells…</span>
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-32" />
            </div>
          ) : (
            <div className="v2-empty">
              <p className="v2-empty-title">No settled Bells to replay yet</p>
              <p className="v2-empty-body">Come back after the first one settles.</p>
            </div>
          )
        ) : (
          <>
            <div>
              <h3 className={LABEL}>Pick a day</h3>
              <div role="group" aria-label="Past Bells to replay" className="mt-3 flex flex-wrap gap-2">
                {[...playable].reverse().map((b) => (
                  <button
                    key={b.day}
                    type="button"
                    aria-pressed={b.day === bell.day}
                    onClick={() => choose(b.day)}
                    className="v2-chip"
                  >
                    {formatDay(b.day)}
                    {b.kind === "replay" && <span className="opacity-60">replay</span>}
                  </button>
                ))}
                {playable.length > 1 && (
                  <button type="button" onClick={surprise} className="v2-chip border-dashed">
                    Surprise me
                  </button>
                )}
              </div>
            </div>

            <div className="mt-7">
              <h3 className={LABEL}>All calls at the Bell of {formatDay(bell.day)}</h3>
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
              <BullBearBar bell={bell} className="mt-5" />
              <p className="v2-note mt-4">
                $CHOG traded at <span className="v2-num text-[var(--v2-muted)]">{formatPrice(bell.entryPrice)}</span> WMON at the
                Bell. Which Chog would you have ridden?
              </p>
            </div>

            <p role="status" className="v2-sr">
              {picked && bell.actualPct !== null
                ? `$CHOG really moved ${signedPct(bell.actualPct)}. ${picked.name} called ${signedPct(picked.forecastPct)}${
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

            <h3 className={`${LABEL} mt-8`}>Ride one: each card shows its 24h call</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {candidates.map((call) => {
                const mine = call.tokenId === pick;
                return (
                  <CallCard
                    key={call.tokenId}
                    call={call}
                    bell={bell}
                    reveal={Boolean(picked)}
                    className={mine ? "border-[var(--v2-line-teal)] shadow-[var(--v2-glass-glow)]" : ""}
                    action={
                      picked ? (
                        mine && <p className="text-center text-[13.5px] font-medium text-[var(--v2-teal)]">Your pick</p>
                      ) : (
                        <button type="button" onClick={() => ride(call)} className="v2-btn-glass v2-btn--block">
                          Ride {call.name}
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
  const pickedTitle = useChogTitle(picked.tokenId, picked.name);

  return (
    <div
      ref={showResult}
      className="bell-pop v2-card v2-card--feature mt-7 scroll-mt-28 border-[var(--v2-line-teal)] md:scroll-mt-24"
    >
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <div>
          <p className={LABEL}>$CHOG really moved</p>
          <Forecast pct={actualPct} size="xl" className="mt-2" />
        </div>
        <div className="min-w-0 flex-1 basis-60 text-sm">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-[var(--v2-ink)]">
            {hit !== null && <Stamp hit={hit} />}
            {pickedTitle} called <Forecast pct={picked.forecastPct} size="sm" />
          </p>
          <p className="mt-1.5 text-[var(--v2-muted)]">
            {error !== null && <>Missed by {formatErrorPts(error)}. </>}
            {typeof picked.points === "number" && (
              <>
                It scored <span className="v2-num text-[var(--v2-kicker)]">+{formatPoints(picked.points)}</span> points:{" "}
              </>
            )}
            #{place} of {candidates.length} here
            {beat !== null && <>, closer than about {Math.round(beat)}% of all calls</>}.
          </p>
          <p className="v2-note mt-1.5">
            {herdLine(bell, actualPct)}{" "}
            {best && best.tokenId !== picked.tokenId ? `Best pick here: ${best.name}.` : "You found the best pick here."}
            {bell.oracle && ` Best call of the day: ${bell.oracle.name}.`}
          </p>
        </div>
        <button type="button" onClick={next.onClick} className="v2-btn-primary">
          {next.label}
        </button>
      </div>
    </div>
  );
}
