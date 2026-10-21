"use client";

import Link from "next/link";
import type { BellCall, BellPurse, BellSummary, BellSummaryResponse } from "@/lib/bell/types";
import { explorerTxUrl } from "@/lib/format";
import { CallResult, ChogAvatar, Forecast, KindBadge, LABEL, SectionTitle } from "./bits";
import { errorOf, formatChog, formatDay, formatErrorPts, formatPrice, herdLine, oracleLine, rektLine } from "./format";
import { CoinIcon, CrownIcon, SkullIcon } from "./icons";

/**
 * A settled Bell's verdict: the real move, both sides of the herd, the Oracle of the Day (with its Oracle Purse on
 * live Bells) and the Most Rekt.
 */
export function Verdict({ bell, title = "The last Bell's verdict" }: { bell: BellSummaryResponse; title?: string }) {
  if (bell.status !== "settled" || bell.actualPct === null) return null;
  const actualPct = bell.actualPct;
  return (
    <section aria-label={title}>
      <SectionTitle
        title={title}
        hint={`Bell of ${formatDay(bell.day)} · settled on the real CHOG/WMON hourly candle`}
        action={
          <Link href={`/bell/${bell.day}`} className="text-sm font-medium text-accent-strong hover:underline">
            All {bell.calls.toLocaleString("en-US")} calls →
          </Link>
        }
      />
      <div className="card flex flex-wrap items-center gap-x-6 gap-y-3 p-4 sm:p-5">
        <div>
          <p className={LABEL}>$CHOG moved</p>
          <Forecast pct={actualPct} size="xl" className="mt-1" />
        </div>
        <div className="min-w-0 flex-1 basis-56 text-sm">
          <p className="font-medium text-foreground">{herdLine(bell, actualPct)}</p>
          <p className="mt-1 text-muted">
            <span className="font-mono">{formatPrice(bell.entryPrice)}</span> →{" "}
            <span className="font-mono">{formatPrice(bell.settlePrice)}</span> WMON per $CHOG over 24h.
          </p>
        </div>
        <KindBadge kind={bell.kind} />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
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
      className={`card relative overflow-hidden p-4 ${oracle ? "border-warning/40" : "border-danger/35"}`}
      aria-label={`${oracle ? "Oracle of the Day" : "Most Rekt"}: Chog #${call.tokenId}`}
    >
      <span
        aria-hidden
        className={`pointer-events-none absolute -top-10 -right-10 size-32 rounded-full blur-2xl ${
          oracle ? "bg-warning/15" : "bg-danger/15"
        }`}
      />
      <p
        className={`relative flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase ${
          oracle ? "text-warning" : "text-danger"
        }`}
      >
        {oracle ? <CrownIcon className="size-4" /> : <SkullIcon className="size-4" />}
        {oracle ? "Oracle of the Day" : "Most Rekt"}
      </p>
      <div className="relative mt-3 flex items-center gap-3">
        <ChogAvatar src={call.image} tokenId={call.tokenId} className="size-14 rounded-2xl" />
        <div className="min-w-0">
          <Link href={`/chog/${call.tokenId}`} className="font-semibold hover:text-accent-strong">
            Chog #{call.tokenId}
          </Link>
          <p className="truncate text-xs text-subtle">{call.name}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm text-muted">
            Called <Forecast pct={call.forecastPct} size="sm" />
            {error !== null && <span>· off by {formatErrorPts(error)}</span>}
          </p>
        </div>
      </div>
      <blockquote
        className={`relative mt-3 border-l-2 pl-3 text-sm leading-relaxed text-foreground italic ${
          oracle ? "border-warning/60" : "border-danger/60"
        }`}
      >
        “{oracle ? oracleLine(call, actualPct, bell.day) : rektLine(call, actualPct, bell.day)}”
      </blockquote>
      <CallResult call={call} actualPct={actualPct} className="relative mt-3" />
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
  const recipient = purse.tokenId === oracleId ? "this Chog's" : `runner-up Chog #${purse.tokenId}'s`;
  return (
    <div className="relative mt-3 flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5 text-sm">
      <CoinIcon className="mt-0.5 size-4 shrink-0 text-warning" />
      <div className="min-w-0">
        {purse.status === "sent" ? (
          <p className="text-muted">
            <span className="font-semibold text-foreground">Oracle Purse: {amount}</span> sent to {recipient} own
            wallet.{" "}
            {href && (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium whitespace-nowrap text-accent-strong hover:underline"
              >
                View the transfer ↗
              </a>
            )}
          </p>
        ) : (
          <p className="text-muted">
            <span className="font-semibold text-foreground">Purse on its way:</span> {amount} to {recipient} own wallet.
          </p>
        )}
        <p className="mt-0.5 text-xs text-subtle">
          {purse.tokenId === oracleId
            ? "Real $CHOG from the team, into the Chog's ERC-6551 wallet: the purse stays with the NFT."
            : "The House Chog doesn't pay itself, so the next-closest call takes the purse. It stays with that NFT."}
        </p>
      </div>
    </div>
  );
}
