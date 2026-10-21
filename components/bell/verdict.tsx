"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import type { BellCall, BellPurse, BellSummary, BellSummaryResponse } from "@/lib/bell/types";
import { explorerTxUrl } from "@/lib/format";
import { CallResult, ChogAvatar, Forecast, KindBadge, LABEL, SectionTitle } from "./bits";
import { errorOf, formatChog, formatDay, formatErrorPts, formatPrice, herdLine, oracleLine, rektLine } from "./format";
import { CoinIcon, CrownIcon, SkullIcon } from "./icons";

/**
 * A settled Bell's verdict: the real move, both sides of the herd, the Oracle of the Day (with its Oracle Purse on
 * live Bells) and the Most Rekt.
 */
export function Verdict({
  bell,
  title = "The last Bell's verdict",
  feature = false,
}: {
  bell: BellSummaryResponse;
  title?: string;
  /** The page's lead card (the day page's verdict). */
  feature?: boolean;
}) {
  if (bell.status !== "settled" || bell.actualPct === null) return null;
  const actualPct = bell.actualPct;
  return (
    <section aria-label={title}>
      <SectionTitle
        kicker={`Bell of ${formatDay(bell.day)} · settled`}
        title={title}
        hint="Settled on the real CHOG/WMON hourly candle."
        action={
          <Link href={`/bell/${bell.day}`} className="v2-link text-sm">
            All {bell.calls.toLocaleString("en-US")} calls
          </Link>
        }
      />
      <div className={`v2-card ${feature ? "v2-card--feature" : ""} grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-8`}>
        <div>
          <p className={LABEL}>$CHOG moved</p>
          <Forecast pct={actualPct} size="xl" className="mt-2" />
        </div>
        <div className="min-w-0">
          <p className="m-0 text-[length:var(--v2-fs-md)] text-[var(--v2-ink)]">{herdLine(bell, actualPct)}</p>
          <p className="v2-note mt-1.5">
            <span className="v2-num text-[var(--v2-muted)]">{formatPrice(bell.entryPrice)}</span> →{" "}
            <span className="v2-num text-[var(--v2-muted)]">{formatPrice(bell.settlePrice)}</span> WMON per $CHOG over
            24h.
          </p>
        </div>
        <KindBadge kind={bell.kind} />
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {bell.oracle && (
          <VerdictCard kind="oracle" call={bell.oracle} bell={bell} actualPct={actualPct} purse={bell.purse} />
        )}
        {bell.mostRekt && <VerdictCard kind="rekt" call={bell.mostRekt} bell={bell} actualPct={actualPct} />}
      </div>
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
  /** The Oracle card's purse, when the Bell has one. */
  purse?: BellPurse;
}) {
  const oracle = kind === "oracle";
  const error = errorOf(call, actualPct);
  return (
    <article
      className={`v2-card bell-honour ${oracle ? "bell-honour--oracle" : "bell-honour--rekt"} flex flex-col gap-4`}
      aria-label={`${oracle ? "Oracle of the Day" : "Most Rekt"}: ${call.label ?? `Chog #${call.tokenId}`}`}
    >
      <div className="v2-card-head">
        <span aria-hidden className={`v2-icon-tile v2-icon-tile--sm ${oracle ? "" : "v2-icon-tile--violet"}`}>
          {oracle ? <CrownIcon className="size-[18px]" /> : <SkullIcon className="size-[18px]" />}
        </span>
        <span className={oracle ? "v2-kicker" : "v2-kicker text-[var(--v2-violet-ink)]"}>
          {oracle ? "Oracle of the Day" : "Most Rekt"}
        </span>
      </div>
      <div className="flex items-center gap-4">
        <ChogAvatar src={call.image} tokenId={call.tokenId} className="size-16 rounded-[16px]" />
        <div className="min-w-0">
          <Link href={`/chog/${call.tokenId}`} className="v2-h3 block truncate hover:text-[var(--v2-kicker)]">
            {call.label ?? `Chog #${call.tokenId}`}
          </Link>
          <p className="truncate text-xs text-[var(--v2-faint)]">{call.name}</p>
          <p className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 text-sm text-[var(--v2-nav)]">
            Called <Forecast pct={call.forecastPct} size="md" />
            {error !== null && <span>· off by {formatErrorPts(error)}</span>}
          </p>
        </div>
      </div>
      <blockquote
        className="bell-quote"
        style={{ "--bell-quote-line": oracle ? "var(--v2-line-teal)" : "rgb(169 155 243 / 0.5)" } as CSSProperties}
      >
        “{oracle ? oracleLine(call, actualPct, bell.day) : rektLine(call, actualPct, bell.day)}”
      </blockquote>
      <CallResult call={call} actualPct={actualPct} className="mt-auto" />
      {purse && <PurseLine purse={purse} oracleId={call.tokenId} />}
    </article>
  );
}

/**
 * The Oracle Purse: real $CHOG from the team into the winning Chog's own ERC-6551 wallet. The amount and a link to
 * the transfer once it is confirmed, "on its way" until then. When the Oracle is the House Chog, the next-closest
 * call takes it (the House never pays itself).
 */
function PurseLine({ purse, oracleId }: { purse: BellPurse; oracleId: number }) {
  const amount = `${formatChog(purse.amount)} $CHOG`;
  const href = purse.status === "sent" && purse.txHash ? explorerTxUrl(purse.txHash) : undefined;
  const recipient = purse.tokenId === oracleId ? "this Chog's" : `runner-up ${purse.label ?? `Chog #${purse.tokenId}`}'s`;
  return (
    <div className="flex items-start gap-3 rounded-[var(--v2-r-md)] border border-[var(--v2-line-teal)] bg-[rgb(159_240_236/0.05)] px-4 py-3 text-sm">
      <CoinIcon className="mt-0.5 size-4 shrink-0 text-[var(--v2-teal)]" />
      <div className="min-w-0">
        {purse.status === "sent" ? (
          <p className="text-[var(--v2-nav)]">
            <span className="font-medium text-[var(--v2-ink)]">Oracle Purse: {amount}</span> sent to {recipient} own
            wallet.{" "}
            {href && (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="v2-link whitespace-nowrap"
              >
                View the transfer ↗
              </a>
            )}
          </p>
        ) : purse.status === "unsent" ? (
          <p className="text-[var(--v2-nav)]">
            <span className="font-medium text-[var(--v2-ink)]">Oracle Purse not sent:</span> the team hasn&apos;t sent this
            Bell&apos;s {amount} to {recipient} own wallet.
          </p>
        ) : (
          <p className="text-[var(--v2-nav)]">
            <span className="font-medium text-[var(--v2-ink)]">Purse on its way:</span> {amount} to {recipient} own wallet.
          </p>
        )}
        <p className="v2-note mt-1">
          {purse.tokenId === oracleId
            ? "Real $CHOG from the team, into the Chog's ERC-6551 wallet: the purse stays with the NFT."
            : "The House Chog doesn't pay itself, so the next-closest call takes the purse. It stays with that NFT."}
        </p>
      </div>
    </div>
  );
}
