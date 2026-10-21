"use client";

import Link from "next/link";
import { type ReactNode, useCallback, useState } from "react";
import type { FanState } from "@/lib/bell/types";
import { VERSUS_COPY } from "@/lib/rewind/rules";
import type { VersusBout, VersusRecord } from "@/lib/rewind/types";
import { DiceIcon, Portrait, SIDE_TONE } from "./bits";
import {
  type FighterLabel,
  PICK_POINTS,
  POINTS_LABEL,
  SIDES,
  type Side,
  boutPath,
  edgeOf,
  edgeTone,
  formatChog,
  formatFee,
  formatHour,
  formatPrice,
  koLine,
  otherSide,
  signedPct,
} from "./shared";

/** How the visitor came to watch: a pick just sent, a pick this browser made earlier, or no pick at all. */
export type PlayKind = "points" | "returning" | "watch";

type KoCardProps = {
  bout: VersusBout;
  labels: Record<Side, FighterLabel>;
  pick: Side | null;
  kind: PlayKind;
  correct: boolean | null;
  /** Points this pick added (0 when wrong, a repeat, a draw or past the daily cap). */
  awarded?: number;
  fan?: FanState;
  record?: VersusRecord;
  onRematch: () => void;
  onRandom: () => void;
  onReplay: () => void;
  busy: "rematch" | "random" | null;
  /** Bring the card into view when it appears (after a race played out, not on a static load). */
  scrollIntoView: boolean;
};

/** The end of the race: the KO, both edges and fees, the visitor's call, the real dates, what's next. */
export function KoCard({
  bout,
  labels,
  pick,
  kind,
  correct,
  awarded,
  fan,
  record,
  onRematch,
  onRandom,
  onReplay,
  busy,
  scrollIntoView,
}: KoCardProps) {
  const { result, reveal, frames, startChog } = bout;
  const draw = result.winner === "draw";
  const last = frames[frames.length - 1];
  const stats: Record<Side, { edge: number; fees: number; stack: number; trades: number }> = {
    a: { edge: result.aEdgePct, fees: result.aFeesChog, stack: last.a, trades: bout.trades.filter((t) => t.fighter === "a").length },
    b: { edge: result.bEdgePct, fees: result.bFeesChog, stack: last.b, trades: bout.trades.filter((t) => t.fighter === "b").length },
  };
  const priceMove = edgeOf(reveal.priceEnd, reveal.priceStart);

  const showCard = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node || !scrollIntoView) return;
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      node.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "nearest" });
    },
    [scrollIntoView],
  );

  return (
    <div
      ref={showCard}
      role="group"
      aria-label="Result"
      className="vs-rise scroll-mt-28 rounded-2xl border border-line-strong bg-surface-2/60 p-4 md:scroll-mt-24 sm:p-6"
    >
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <span
          aria-hidden
          className={`vs-stamp inline-flex -rotate-3 items-center rounded-lg border-[3px] px-3 py-1 text-2xl font-black tracking-widest sm:text-3xl ${
            draw ? "border-muted text-muted" : `${result.winner === "a" ? "border-accent-strong" : "border-warning"} ${SIDE_TONE[result.winner as Side].text}`
          }`}
        >
          {draw ? "DRAW" : "K.O."}
        </span>
        <div className="min-w-0 flex-1 basis-56">
          <p className="text-lg font-semibold tracking-tight text-balance sm:text-2xl">{koLine(bout, labels)}</p>
          <Verdict
            pick={pick}
            kind={kind}
            correct={correct}
            awarded={awarded}
            winner={result.winner}
            labels={labels}
            fan={fan}
            record={record}
          />
        </div>
      </div>

      {/* Both fighters side by side: a table, so a phone keeps every number on one line. */}
      <div className="mt-5 overflow-hidden rounded-xl border border-line/70 bg-background/30">
        <table className="w-full table-fixed text-xs sm:text-sm">
          <caption className="sr-only">Both Chogs at the KO</caption>
          <colgroup>
            <col className="w-[5.5rem] sm:w-36" />
            <col />
            <col />
          </colgroup>
          <thead>
            <tr>
              <td />
              {SIDES.map((side) => {
                const won = result.winner === side;
                return (
                  <th key={side} scope="col" className={`px-2 pt-3 pb-2 text-left align-top font-normal sm:px-3 ${won ? "bg-white/[0.03]" : ""}`}>
                    <span className="flex min-w-0 items-center gap-2">
                      <Portrait
                        side={side}
                        image={bout[side].image}
                        tokenId={bout[side].tokenId}
                        size={32}
                        className="hidden rounded-lg sm:block"
                      />
                      <span className="min-w-0">
                        <span className={`block truncate font-semibold ${SIDE_TONE[side].text}`}>{labels[side].title}</span>
                        <span className="block truncate text-[10px] tracking-wider text-subtle uppercase">
                          {won ? "Winner" : draw ? "Level" : "Runner-up"}
                        </span>
                      </span>
                    </span>
                    {pick === side && kind !== "watch" && (
                      <span className={`mt-1.5 inline-flex rounded px-1 text-[9px] font-bold tracking-wider uppercase ring-1 ring-current/40 ${SIDE_TONE[side].text}`}>
                        Your pick
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-line/50 border-t border-line/50">
            {[
              {
                label: "vs holding",
                cell: (side: Side) => (
                  <span className={`font-mono font-semibold tabular-nums ${edgeTone(stats[side].edge)}`}>{signedPct(stats[side].edge)}</span>
                ),
              },
              {
                label: "Final $CHOG",
                cell: (side: Side) => <span className="font-mono tabular-nums">{formatChog(stats[side].stack)}</span>,
              },
              {
                label: "Fees, $CHOG",
                cell: (side: Side) => <span className="font-mono tabular-nums">{formatFee(stats[side].fees)}</span>,
              },
              { label: "Trades", cell: (side: Side) => <span className="font-mono tabular-nums">{stats[side].trades}</span> },
            ].map((row) => (
              <tr key={row.label}>
                <th scope="row" className="px-2 py-2 text-left text-[11px] font-normal text-subtle sm:px-3">
                  {row.label}
                </th>
                {SIDES.map((side) => (
                  <td key={side} className={`px-2 py-2 sm:px-3 ${result.winner === side ? "bg-white/[0.03]" : ""}`}>
                    {row.cell(side)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-line/50 px-3 py-2 text-[11px] text-subtle">
          Both started with {formatChog(startChog)} $CHOG; just holding ends with exactly that.
        </p>
      </div>

      {/* The reveal: until now the window was "48 hours of real $CHOG history". */}
      <div className="mt-5 rounded-xl border border-dashed border-accent/50 bg-accent/5 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="vs-stamp inline-flex -rotate-2 rounded-md border-2 border-accent-strong px-2 py-0.5 text-xs font-black tracking-[0.2em] text-accent-strong">
            REVEAL
          </span>
          <p className="min-w-0 flex-1 text-sm font-semibold text-balance sm:text-base">{reveal.label}</p>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          The real window:{" "}
          <time dateTime={reveal.from} className="font-mono text-foreground">
            {formatHour(Date.parse(reveal.from))}
          </time>{" "}
          to{" "}
          <time dateTime={reveal.to} className="font-mono text-foreground">
            {formatHour(Date.parse(reveal.to))}
          </time>
          . $CHOG went from <span className="font-mono text-foreground">{formatPrice(reveal.priceStart)}</span> to{" "}
          <span className="font-mono text-foreground">{formatPrice(reveal.priceEnd)}</span> WMON (
          <span className={edgeTone(priceMove)}>{signedPct(priceMove)}</span>).
        </p>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={onRematch} disabled={busy !== null} className="btn btn-primary">
          {busy === "rematch" ? "Finding another window…" : "Rematch on another window"}
        </button>
        <button type="button" onClick={onRandom} disabled={busy !== null} className="btn btn-secondary">
          <DiceIcon /> {busy === "random" ? "Shuffling…" : "Random bout"}
        </button>
        <ShareButton bout={bout} labels={labels} />
        <button type="button" onClick={onReplay} className="btn btn-ghost">
          <span aria-hidden>↺</span> Watch again
        </button>
      </div>

      <nav aria-label="Both Chogs" className="mt-4 grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
        {SIDES.map((side) => (
          <p key={side} className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className={`truncate font-medium ${SIDE_TONE[side].text}`}>{labels[side].title}:</span>
            <Link href={`/chog/${bout[side].tokenId}`} className="text-muted hover:text-foreground hover:underline">
              its page
            </Link>
            <Link href={`/replay/${bout[side].tokenId}`} className="text-muted hover:text-foreground hover:underline">
              its Time Machine
            </Link>
          </p>
        ))}
        <p className="sm:col-span-2">
          <Link
            href={`/replay/${bout.a.tokenId}?vs=${bout.b.tokenId}`}
            className="font-medium text-accent-strong hover:underline"
          >
            Race these two over all of $CHOG&apos;s history →
          </Link>
        </p>
      </nav>

      <p className="mt-4 border-t border-line/70 pt-3 text-[11px] leading-relaxed text-subtle">
        Genome <span className="font-mono">{bout.a.genomeVersion}</span>: a rules replay of each Chog&apos;s DNA on real
        candles, not a promise. Past candles don&apos;t predict the next ones.
      </p>
    </div>
  );
}

/** The visitor's side of the story. Losing calls roast the genome, never the person. */
function Verdict({
  pick,
  kind,
  correct,
  awarded,
  winner,
  labels,
  fan,
  record,
}: {
  pick: Side | null;
  kind: PlayKind;
  correct: boolean | null;
  awarded?: number;
  winner: Side | "draw";
  labels: Record<Side, FighterLabel>;
  fan?: FanState;
  record?: VersusRecord;
}) {
  if (kind === "watch" || !pick) {
    return (
      <p className="mt-1.5 text-sm text-muted">
        {VERSUS_COPY.spectate} A fresh bout lets you call it for +{PICK_POINTS}.
      </p>
    );
  }
  const right = winner === pick;
  const fumbled =
    winner === "draw" ? "Dead heat: neither genome stacked more." : `${labels[pick].title}'s genome fumbled this window.`;
  let text: ReactNode;
  if (kind === "returning" || correct === null) {
    text = right ? (
      <>You picked {labels[pick].title} on this bout earlier, and called it. Here&apos;s the replay: no new points.</>
    ) : (
      <>You picked {labels[pick].title} on this bout earlier. {fumbled} Here&apos;s the replay: no new points.</>
    );
  } else if (correct) {
    text =
      awarded && awarded > 0 ? (
        <>
          <span className="font-semibold text-success">Called it: +{awarded} points.</span> {labels[pick].title}&apos;s genome
          read the chart better.
        </>
      ) : (
        <>
          <span className="font-semibold text-success">Called it.</span> {VERSUS_COPY.capped}
        </>
      );
  } else {
    text =
      winner === "draw" ? (
        <>{fumbled} No points for a draw.</>
      ) : (
        <>
          {fumbled} {labels[otherSide(pick)].title}&apos;s genome read it better. No points this time.
        </>
      );
  }
  return (
    <div className="mt-1.5 space-y-1 text-sm text-muted">
      <p>{text}</p>
      {kind === "points" && (fan || record) && (
        <p className="text-xs">
          {record && (
            <>
              VERSUS record: {record.correct} of {record.picks} called · {formatChog(record.points)} pts ({record.pointsToday}/
              {record.dailyCap} today).{" "}
            </>
          )}
          {fan && (
            <>
              Fan card: <span className="font-mono font-semibold text-accent-strong">{formatChog(fan.points)} pts</span>,{" "}
              <Link href="/bell" className="underline-offset-2 hover:text-foreground hover:underline">
                shared with the Daily Bell
              </Link>
              .{" "}
            </>
          )}
          {POINTS_LABEL}.
        </p>
      )}
    </div>
  );
}

function ShareButton({ bout, labels }: { bout: VersusBout; labels: Record<Side, FighterLabel> }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const [url, setUrl] = useState<string | null>(null);

  const share = async () => {
    const link = new URL(boutPath(bout.id), window.location.origin).toString();
    const text = `${labels.a.title} vs ${labels.b.title}: two Chog trading genomes, 48 hidden hours of real $CHOG history. Who stacks more $CHOG? (Simulated, 1% fee + impact.)`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "Animr VERSUS", text, url: link });
        return;
      }
      await navigator.clipboard.writeText(link);
      setState("copied");
    } catch (error) {
      if ((error as Error)?.name === "AbortError") return;
      setUrl(link);
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2500);
  };

  return (
    <>
      <button type="button" onClick={share} className="btn btn-secondary">
        {state === "copied" ? "Link copied" : state === "failed" ? "Copy the link below" : "Share this bout"}
      </button>
      {url && (
        <input
          readOnly
          value={url}
          aria-label="Link to this bout"
          onFocus={(e) => e.currentTarget.select()}
          className="input w-full font-mono text-xs"
        />
      )}
      <span aria-live="polite" className="sr-only">
        {state === "copied" ? "Link copied to the clipboard." : ""}
      </span>
    </>
  );
}
