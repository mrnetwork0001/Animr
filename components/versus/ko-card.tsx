"use client";

import Link from "next/link";
import { type ReactNode, useCallback, useState } from "react";
import type { FanState } from "@/lib/bell/types";
import { VERSUS_COPY } from "@/lib/rewind/rules";
import type { VersusBout, VersusRecord } from "@/lib/rewind/types";
import { Badge, pillClass } from "@/components/v2/primitives";
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

  const winner = draw ? null : (result.winner as Side);
  const [revealDates, ...revealRest] = reveal.label.split(": ");
  const revealStory = revealRest.join(": ");

  return (
    <div
      ref={showCard}
      role="group"
      aria-label="Result"
      className="v2-card v2-card--feature vs-rise scroll-mt-28 md:scroll-mt-24"
    >
      <div className="grid gap-6 md:grid-cols-[auto_minmax(0,1fr)] md:items-center md:gap-8">
        <div className={`relative flex items-end gap-4 ${winner ? SIDE_TONE[winner].side : ""}`}>
          {winner ? (
            <Portrait
              side={winner}
              image={bout[winner].image}
              tokenId={bout[winner].tokenId}
              size={128}
              box="size-24 sm:size-32"
              large
              alt={`${labels[winner].spoken}, the winner`}
            />
          ) : (
            <span className="flex -space-x-5">
              {SIDES.map((side) => (
                <Portrait key={side} side={side} image={bout[side].image} tokenId={bout[side].tokenId} size={96} box="size-20 sm:size-24" large />
              ))}
            </span>
          )}
          <span aria-hidden className="vs-ko vs-stamp">
            {draw ? "Draw" : "K.O."}
          </span>
        </div>
        <div className="grid min-w-0 gap-3">
          <p className="flex flex-wrap items-center gap-2">
            {draw ? <Badge>Dead heat</Badge> : <Badge tone="success" dot>Winner</Badge>}
            {winner && <span className={`text-sm font-medium ${SIDE_TONE[winner].text}`}>{labels[winner].title}</span>}
          </p>
          <p className="vs-ko-title">{koLine(bout, labels)}</p>
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
      <div className="v2-table-wrap mt-7">
        <table className="v2-table vs-ko-table table-fixed">
          <caption className="v2-sr">Both Chogs at the KO</caption>
          <colgroup>
            <col className="w-[6.5rem] sm:w-40" />
            <col />
            <col />
          </colgroup>
          <thead>
            <tr>
              <td className="bg-transparent" />
              {SIDES.map((side) => {
                const won = result.winner === side;
                return (
                  <th key={side} scope="col" className={`static text-left tracking-normal whitespace-normal normal-case ${won ? "bg-[rgb(255_255_255/0.035)]" : "bg-transparent"}`}>
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Portrait side={side} image={bout[side].image} tokenId={bout[side].tokenId} size={32} className="hidden sm:block" />
                      <span className="min-w-0">
                        <span className={`block text-[13.5px] leading-tight font-medium break-words ${SIDE_TONE[side].text}`}>
                          {labels[side].title}
                        </span>
                        <span className="mt-0.5 block text-[11px] font-normal">{won ? "Winner" : draw ? "Level" : "Runner-up"}</span>
                      </span>
                    </span>
                    {pick === side && kind !== "watch" && <span className={`mt-1.5 ${SIDE_TONE[side].tag}`}>Your pick</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {[
              {
                label: "vs holding",
                cell: (side: Side) => <span className={edgeTone(stats[side].edge)}>{signedPct(stats[side].edge)}</span>,
              },
              { label: "Final $CHOG", cell: (side: Side) => formatChog(stats[side].stack) },
              { label: "Fees, $CHOG", cell: (side: Side) => formatFee(stats[side].fees) },
              { label: "Trades", cell: (side: Side) => stats[side].trades },
            ].map((row) => (
              <tr key={row.label}>
                <th scope="row" className="static border-b-[var(--v2-line-soft)] bg-transparent text-left text-xs font-normal tracking-normal text-[var(--v2-faint)] normal-case">
                  {row.label}
                </th>
                {SIDES.map((side) => (
                  <td key={side} className={`is-num text-left ${result.winner === side ? "bg-[rgb(255_255_255/0.035)]" : ""}`}>
                    {row.cell(side)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="v2-note mt-2.5">Both started with {formatChog(startChog)} $CHOG; just holding ends with exactly that.</p>

      {/* The reveal: until now the window was "48 hours of real $CHOG history". */}
      <div className="vs-reveal mt-7">
        <p className="v2-kicker v2-kicker--dot">Reveal · the real window</p>
        <p className="vs-reveal-dates vs-wipe mt-3">{revealDates}</p>
        {revealStory && <p className="v2-lead mt-2 text-[var(--v2-muted)]">{revealStory}</p>}
        <dl className="vs-reveal-times mt-6">
          <div>
            <dt>From</dt>
            <dd>
              <time dateTime={reveal.from}>{formatHour(Date.parse(reveal.from))}</time>
            </dd>
          </div>
          <div>
            <dt>To</dt>
            <dd>
              <time dateTime={reveal.to}>{formatHour(Date.parse(reveal.to))}</time>
            </dd>
          </div>
          <div>
            <dt>$CHOG, WMON</dt>
            <dd>
              {formatPrice(reveal.priceStart)} → {formatPrice(reveal.priceEnd)}{" "}
              <span className={edgeTone(priceMove)}>{signedPct(priceMove)}</span>
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-7 flex flex-wrap gap-2">
        <button type="button" onClick={onRematch} disabled={busy !== null} className={`max-sm:w-full ${pillClass("primary")}`}>
          {busy === "rematch" ? "Finding another window…" : "Rematch on another window"}
        </button>
        <button type="button" onClick={onRandom} disabled={busy !== null} className={`max-sm:w-full ${pillClass("glass")}`}>
          <DiceIcon /> {busy === "random" ? "Shuffling…" : "Random bout"}
        </button>
        <ShareButton bout={bout} labels={labels} />
        <button type="button" onClick={onReplay} className={`max-sm:w-full ${pillClass("ghost")}`}>
          <span aria-hidden>↺</span> Watch again
        </button>
      </div>

      <nav aria-label="Both Chogs" className="mt-6 grid gap-x-6 gap-y-2 border-t border-[var(--v2-line-soft)] pt-5 text-sm sm:grid-cols-2">
        {SIDES.map((side) => (
          <p key={side} className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className={`truncate font-medium ${SIDE_TONE[side].text}`}>{labels[side].title}:</span>
            <Link href={`/chog/${bout[side].tokenId}`} className="v2-link">
              its page
            </Link>
            <Link href={`/replay/${bout[side].tokenId}`} className="v2-link">
              its Time Machine
            </Link>
          </p>
        ))}
        <p className="sm:col-span-2">
          <Link href={`/replay/${bout.a.tokenId}?vs=${bout.b.tokenId}`} className="v2-link">
            Race these two over all of $CHOG&apos;s history →
          </Link>
        </p>
      </nav>

      <p className="v2-note mt-5">
        Genome <span className="v2-mono">{bout.a.genomeVersion}</span>: a rules replay of each Chog&apos;s DNA on real
        candles, not a promise. Past candles don&apos;t predict the next ones. Simulated, points only.
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
      <p className="v2-body m-0">
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
          <span className="font-medium text-[var(--v2-success)]">Called it: +{awarded} points.</span> {labels[pick].title}&apos;s genome
          read the chart better.
        </>
      ) : (
        <>
          <span className="font-medium text-[var(--v2-success)]">Called it.</span> {VERSUS_COPY.capped}
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
    <div className="v2-body space-y-1.5">
      <p>{text}</p>
      {kind === "points" && (fan || record) && (
        <p className="v2-note">
          {record && (
            <>
              VERSUS record: {record.correct} of {record.picks} called · {formatChog(record.points)} pts ({record.pointsToday}/
              {record.dailyCap} today).{" "}
            </>
          )}
          {record?.pending ? (
            // No fan card yet (VERSUS never makes one): the points wait for the first ride or nickname.
            <>
              {formatChog(record.pending)} pts move onto a fan card with your first{" "}
              <Link href="/bell" className="v2-link">
                Daily Bell ride
              </Link>
              .{" "}
            </>
          ) : fan ? (
            <>
              Fan card: <span className="v2-num text-[var(--v2-kicker)]">{formatChog(fan.points)} pts</span>,{" "}
              <Link href="/bell" className="v2-link">
                shared with the Daily Bell
              </Link>
              .{" "}
            </>
          ) : null}
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
      <button type="button" onClick={share} className={`max-sm:w-full ${pillClass("glass")}`}>
        {state === "copied" ? "Link copied" : state === "failed" ? "Copy the link below" : "Share this bout"}
      </button>
      {url && (
        <input
          readOnly
          value={url}
          aria-label="Link to this bout"
          onFocus={(e) => e.currentTarget.select()}
          className="v2-input v2-mono w-full text-xs"
        />
      )}
      <span aria-live="polite" className="v2-sr">
        {state === "copied" ? "Link copied to the clipboard." : ""}
      </span>
    </>
  );
}
