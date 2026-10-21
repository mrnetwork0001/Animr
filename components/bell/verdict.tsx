"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import type { BellCall, BellPurse, BellSummary, BellSummaryResponse } from "@/lib/bell/types";
import { explorerTxUrl } from "@/lib/format";
import { CallResult, ChogAvatar, Forecast, LABEL, SectionTitle } from "./bits";
import { formatChog, formatDay, formatPrice, herdLine, oracleLine, rektLine } from "./format";
import { CoinIcon } from "./icons";
import { useChogTag, useChogTitle } from "./names";

/**
 * A settled Bell's verdict: the real move and both sides of the crowd, then the Best call (with its purse on live
 * Bells) and the Most Rekt. `cardsOnly` drops the move card and the heading, for a page that already shows the move
 * (the day page's stat row).
 */
export function Verdict({ bell, cardsOnly = false }: { bell: BellSummaryResponse; cardsOnly?: boolean }) {
  if (bell.status !== "settled" || bell.actualPct === null) return null;
  const actualPct = bell.actualPct;
  const cards = (
    <div className={`grid gap-4 md:grid-cols-2 ${cardsOnly ? "" : "mt-4"}`}>
      {bell.oracle && <VerdictCard kind="oracle" call={bell.oracle} bell={bell} actualPct={actualPct} purse={bell.purse} />}
      {bell.mostRekt && <VerdictCard kind="rekt" call={bell.mostRekt} bell={bell} actualPct={actualPct} />}
    </div>
  );
  if (cardsOnly) return <section aria-label="Best and worst call">{cards}</section>;
  const title = `How the Bell of ${formatDay(bell.day)} settled`;
  return (
    <section aria-label={title}>
      <SectionTitle
        title={title}
        hint="Settled on the real CHOG/WMON hourly candle."
        action={
          <Link href={`/bell/${bell.day}`} className="v2-link text-sm">
            All {bell.calls.toLocaleString("en-US")} calls
          </Link>
        }
      />
      <div className="v2-card grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-8">
        <div>
          <p className={LABEL}>$CHOG moved</p>
          <Forecast pct={actualPct} size="xl" className="mt-2" />
        </div>
        <div className="min-w-0">
          <p className="m-0 text-[length:var(--v2-fs-md)] text-[var(--v2-ink)]">{herdLine(bell, actualPct)}</p>
          <p className="v2-note mt-1.5">
            <span className="v2-num text-[var(--v2-muted)]">{formatPrice(bell.entryPrice)}</span> →{" "}
            <span className="v2-num text-[var(--v2-muted)]">{formatPrice(bell.settlePrice)}</span> WMON per $CHOG over
            24h{bell.kind === "replay" ? ", replayed from real candles" : ""}.
          </p>
        </div>
      </div>
      {cards}
    </section>
  );
}

function VerdictCard({
  kind,
  call,
  bell,
  actualPct,
  purse,
}: {
  kind: "oracle" | "rekt";
  call: BellCall;
  bell: BellSummary;
  actualPct: number;
  /** The Best call's purse, when the Bell has one. */
  purse?: BellPurse;
}) {
  const best = kind === "oracle";
  const tag = useChogTag(call.tokenId);
  const heading = best ? "Best call" : "Most Rekt";
  return (
    <article
      className={`v2-card bell-honour ${best ? "bell-honour--oracle" : "bell-honour--rekt"} flex flex-col gap-4`}
      aria-label={`${heading}: ${[call.name, tag].filter(Boolean).join(" · ")}`}
    >
      <p className={best ? "text-[13.5px] font-medium text-[var(--v2-teal)]" : "text-[13.5px] font-medium text-[var(--v2-violet-ink)]"}>
        {heading}
      </p>
      <div className="flex items-center gap-4">
        <ChogAvatar src={call.image} tokenId={call.tokenId} className="size-16 rounded-[16px]" />
        <div className="min-w-0">
          <Link href={`/chog/${call.tokenId}`} className="v2-h3 block truncate hover:text-[var(--v2-kicker)]">
            {call.name}
            {tag && <span className="text-[length:var(--v2-fs-sm)] font-normal text-[var(--v2-faint)]"> · {tag}</span>}
          </Link>
          <p className="mt-1.5 text-sm text-[var(--v2-nav)]">
            Called <Forecast pct={call.forecastPct} size="md" />
          </p>
        </div>
      </div>
      <blockquote
        className="bell-quote"
        style={{ "--bell-quote-line": best ? "var(--v2-line-teal)" : "rgb(169 155 243 / 0.5)" } as CSSProperties}
      >
        “{best ? oracleLine(call, actualPct, bell.day) : rektLine(call, actualPct, bell.day)}”
      </blockquote>
      <CallResult call={call} actualPct={actualPct} className="mt-auto" />
      {purse && <PurseLine purse={purse} bestId={call.tokenId} />}
    </article>
  );
}

/**
 * The purse: real $CHOG from the team into the Best call's own ERC-6551 wallet. The amount and a link to the transfer
 * once it is confirmed, "on its way" until then. When the Best call is the House Chog's, the next-closest call takes
 * it (the House never pays itself).
 */
function PurseLine({ purse, bestId }: { purse: BellPurse; bestId: number }) {
  const amount = `${formatChog(purse.amount)} $CHOG`;
  const href = purse.status === "sent" && purse.txHash ? explorerTxUrl(purse.txHash) : undefined;
  const runnerUp = useChogTitle(purse.tokenId);
  const recipient = purse.tokenId === bestId ? "this Chog's" : `runner-up ${runnerUp}'s`;
  return (
    <div className="flex items-start gap-3 rounded-[var(--v2-r-md)] border border-[var(--v2-line-teal)] bg-[rgb(159_240_236/0.05)] px-4 py-3 text-sm">
      <CoinIcon className="mt-0.5 size-4 shrink-0 text-[var(--v2-teal)]" />
      <div className="min-w-0">
        {purse.status === "sent" ? (
          <p className="text-[var(--v2-nav)]">
            <span className="font-medium text-[var(--v2-ink)]">Purse: {amount}</span> sent to {recipient} own wallet.{" "}
            {href && (
              <a href={href} target="_blank" rel="noopener noreferrer" className="v2-link whitespace-nowrap">
                View the transfer ↗
              </a>
            )}
          </p>
        ) : purse.status === "unsent" ? (
          <p className="text-[var(--v2-nav)]">
            <span className="font-medium text-[var(--v2-ink)]">Purse not sent:</span> the team hasn&apos;t sent this
            Bell&apos;s {amount} to {recipient} own wallet.
          </p>
        ) : (
          <p className="text-[var(--v2-nav)]">
            <span className="font-medium text-[var(--v2-ink)]">Purse on its way:</span> {amount} to {recipient} own wallet.
          </p>
        )}
        <p className="v2-note mt-1">
          {purse.tokenId === bestId
            ? "Real $CHOG from the team, into the Chog's ERC-6551 wallet: the purse stays with the NFT."
            : "The House Chog doesn't pay itself, so the next-closest call takes the purse. It stays with that NFT."}
        </p>
      </div>
    </div>
  );
}
