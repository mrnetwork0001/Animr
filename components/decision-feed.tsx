"use client";

import { type CSSProperties, useState, useSyncExternalStore } from "react";
import { isAddress } from "viem";
import { SparkIcon } from "@/components/v2/icons";
import { Badge, type BadgeTone, EmptyState } from "@/components/v2/primitives";
import {
  PROVIDER_TEXT,
  type ProviderLabels,
  formatCallCost,
  isTeeVerified,
  providerLabelOf,
  receiptCostUsd,
} from "@/lib/agent/receipts";
import type { AgentAction, Decision, Trade } from "@/lib/agent/types";
import { explorerTxUrl, formatAmount, formatPct, formatUsd, shortAddress, timeAgo } from "@/lib/format";

// One shared 1 Hz clock for every relative timestamp on the page. The server and
// the hydration pass render `null`, so time never causes a hydration mismatch.
let clockNow: number | null = null;
let clockTimer: ReturnType<typeof setInterval> | undefined;
const clockListeners = new Set<() => void>();

function subscribeClock(listener: () => void) {
  clockListeners.add(listener);
  if (clockTimer === undefined) {
    clockNow = Date.now();
    clockTimer = setInterval(() => {
      clockNow = Date.now();
      clockListeners.forEach((notify) => notify());
    }, 1000);
  }
  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0) {
      clearInterval(clockTimer);
      clockTimer = undefined;
    }
  };
}

/** Current time in ms, ticking every second; null until mounted in the browser. */
export function useNow(): number | null {
  return useSyncExternalStore(
    subscribeClock,
    () => clockNow,
    () => null,
  );
}

/** "3m ago", rendered client-side only. */
export function TimeAgo({ iso, className }: { iso: string; className?: string }) {
  const now = useNow();
  return (
    <time dateTime={iso} title={iso} className={className}>
      {now === null ? "…" : timeAgo(iso, now)}
    </time>
  );
}

/** Buy teal, sell violet, hold neutral (the v2 rule: teal/violet name sides, green/red only sign changes). */
const ACTION_TONE: Record<AgentAction, BadgeTone> = { buy: "teal", sell: "violet", hold: "neutral" };
/** The timeline node's colour per action. */
const NODE_TONE: Record<AgentAction, string> = {
  buy: "border-[var(--v2-teal)] bg-[rgb(159_240_236/0.25)] shadow-[0_0_10px_rgb(159_240_236/0.55)]",
  sell: "border-[var(--v2-violet-ink)] bg-[rgb(139_120_236/0.3)] shadow-[0_0_10px_rgb(139_120_236/0.55)]",
  hold: "border-[var(--v2-line-strong)] bg-[var(--v2-bg)]",
};

const PAGE_SIZE = 20;

/** MarketSnapshot.source, in words; unknown sources show as-is. */
const SOURCE_LABEL: Record<string, string> = {
  dexscreener: "DexScreener",
  geckoterminal: "GeckoTerminal",
  mock: "simulated market",
  unavailable: "no price feed",
};

/** Prices are tiny fractions of MON, so show significant digits rather than decimals. */
function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { maximumSignificantDigits: 4 }).format(value);
}

function tokenLabel(token: string): string {
  return isAddress(token) ? shortAddress(token) : token;
}

function changeTone(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) < 0.005) return "text-[var(--v2-muted)]";
  return value > 0 ? "v2-up" : "v2-down";
}

type DecisionFeedProps = {
  /** Newest first, as returned by the API. */
  decisions: Decision[];
  /** The API's labels for the 0G providers behind the LLM decisions (AgentDetailView.providers). */
  providers?: ProviderLabels;
  /** Shown when there are no decisions yet. */
  emptyHint?: string;
};

/** The agent's "AI thoughts": a vertical timeline, one glass row per decision, newest first. */
export function DecisionFeed({ decisions, providers, emptyHint = "No decisions yet." }: DecisionFeedProps) {
  const [limit, setLimit] = useState(PAGE_SIZE);

  if (decisions.length === 0) {
    return <EmptyState icon={<SparkIcon />} title="The AI hasn't decided anything yet" body={emptyHint} />;
  }

  const hidden = decisions.length - limit;
  return (
    <div>
      <ol className="relative" aria-label="Decisions, newest first">
        {/* The rail: a 1px hairline behind the nodes. */}
        <span aria-hidden className="absolute top-3 bottom-3 left-[7px] w-px bg-[var(--v2-line-soft)]" />
        {decisions.slice(0, limit).map((decision) => (
          <DecisionRow key={decision.id} decision={decision} providers={providers} />
        ))}
      </ol>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setLimit((n) => n + PAGE_SIZE)}
          className="v2-btn-glass v2-btn--sm v2-btn--block mt-2"
        >
          Show {Math.min(hidden, PAGE_SIZE)} older {hidden === 1 ? "thought" : "thoughts"}
        </button>
      )}
    </div>
  );
}

/** The skeleton of a few timeline rows, the same shape as the feed. */
export function DecisionFeedSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" className="relative">
      <span className="v2-sr">Loading the AI&apos;s thoughts…</span>
      <span aria-hidden className="absolute top-3 bottom-3 left-[7px] w-px bg-[var(--v2-line-soft)]" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} aria-hidden className="relative pb-4 pl-6 last:pb-0 sm:pl-8">
          <span className="absolute top-5 left-0 size-[15px] rounded-full border border-[var(--v2-line)] bg-[var(--v2-bg)]" />
          <div className="v2-card v2-card--tight space-y-3">
            <span className="v2-skeleton v2-skeleton--text w-40" />
            <span className="v2-skeleton v2-skeleton--text w-full" />
            <span className="v2-skeleton v2-skeleton--text w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The 0G receipt of an LLM decision, as chips: model · 0G Compute · the provider's tier (TeeML / TeeTLS / standard, as
 * the Router lists that provider) · cost. The tier describes the provider, not a check of this call: "TEE verified"
 * appears only when the receipt itself says the Router verified the TEE signature (teeVerified === true).
 */
function ReceiptChips({ decision: d, providers }: { decision: Decision; providers?: ProviderLabels }) {
  if (d.decidedBy !== "llm") {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="v2-chip" title="This call came from its trait genome's rules, not from the LLM">
          Trait instinct · rules
        </span>
      </div>
    );
  }
  const address = d.zg?.provider;
  const label = providerLabelOf(providers, address);
  const text = label ? PROVIDER_TEXT[label.label] : undefined;
  const cost = receiptCostUsd(d);
  const verified = isTeeVerified(d);
  const details = [address && `Provider ${address}`, d.zg?.requestId && `request ${d.zg.requestId}`]
    .filter(Boolean)
    .join(" · ");
  const tierText = text ? (verified ? text.long.replace(" This call's attestation isn't verified.", "") : text.long) : undefined;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="v2-chip text-[var(--v2-ink)]">
          <SparkIcon aria-hidden className="size-3.5 text-[var(--v2-teal)]" />
          {d.model ?? "LLM"}
        </span>
        <span className="v2-chip">0G Compute</span>
        {text && (
          <span className="v2-chip" title={tierText}>
            {text.short}
            {label?.name && <span className="text-[var(--v2-faint)]">· {label.name}</span>}
          </span>
        )}
        {cost !== null && (
          <span className="v2-chip v2-num" title={`${formatUsd(cost)} for this call, billed by the 0G Router`}>
            {formatCallCost(cost)}
            <span className="text-[var(--v2-faint)]">/call</span>
          </span>
        )}
        {address && (
          <span className="v2-chip v2-mono text-[var(--v2-faint)]" title={details}>
            <span className="v2-sr">Provider address </span>
            {shortAddress(address)}
          </span>
        )}
        {verified && (
          <Badge tone="success" dot>
            TEE verified
          </Badge>
        )}
      </div>
      {tierText && <p className="v2-note">{tierText}</p>}
    </div>
  );
}

function DecisionRow({ decision: d, providers }: { decision: Decision; providers?: ProviderLabels }) {
  const confidence = Math.round(Math.min(1, Math.max(0, d.confidence)) * 100);
  const sold = d.action === "buy" ? "MON" : "$CHOG";

  return (
    <li className="relative pb-4 pl-6 last:pb-0 sm:pl-8">
      <span
        aria-hidden
        className={`absolute top-5 left-0 size-[15px] rounded-full border-2 ${NODE_TONE[d.action] ?? NODE_TONE.hold}`}
      />
      <article className="v2-card v2-card--tight sm:p-5">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Badge tone={ACTION_TONE[d.action] ?? "neutral"}>{d.action}</Badge>
          {d.action !== "hold" && (
            <span className="v2-num text-[15px] text-[var(--v2-ink)]">
              {formatAmount(d.sizeBps / 100, 2)}% <span className="text-[var(--v2-faint)]">of {sold}</span>
            </span>
          )}
          <span className="flex items-center gap-2 text-xs text-[var(--v2-nav)]" title="Model confidence">
            <span className="v2-meter w-14" aria-hidden>
              <span style={{ "--v2-value": `${confidence}%` } as CSSProperties} />
            </span>
            <span className="v2-num">{confidence}% sure</span>
          </span>
          <TimeAgo iso={d.at} className="ml-auto text-xs text-[var(--v2-faint)]" />
        </header>

        <p className="v2-body mt-3 text-[15px] text-pretty text-[var(--v2-ink)]/90">{d.thesis}</p>

        <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--v2-faint)]">
          <div className="flex items-baseline gap-1.5">
            <dt>Price</dt>
            <dd className="v2-num text-[13px] text-[var(--v2-ink)]">
              {formatPrice(d.market.priceQuote)} MON
              {typeof d.market.priceUsd === "number" && (
                <span className="text-[var(--v2-faint)]"> · {formatUsd(d.market.priceUsd)}</span>
              )}
            </dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt>1h</dt>
            <dd className={`v2-num text-[13px] ${changeTone(d.market.change1hPct)}`}>{formatPct(d.market.change1hPct)}</dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt>24h</dt>
            <dd className={`v2-num text-[13px] ${changeTone(d.market.change24hPct)}`}>{formatPct(d.market.change24hPct)}</dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt>Source</dt>
            <dd className={d.market.source === "mock" ? "text-[var(--v2-warning)]" : "text-[var(--v2-nav)]"}>
              {SOURCE_LABEL[d.market.source] ?? d.market.source}
            </dd>
          </div>
        </dl>

        {d.trade && <TradeDetails trade={d.trade} />}

        <div className="mt-3 border-t border-[var(--v2-line-soft)] pt-3">
          <p className="v2-overline mb-2">{d.decidedBy === "llm" ? "0G receipt" : "Decided by"}</p>
          <ReceiptChips decision={d} providers={providers} />
        </div>

        {d.error && (
          <div role="alert" className="v2-toast v2-toast--danger mt-3 shadow-none">
            <div>
              <span className="v2-toast-title">Error</span>
              {d.error}
            </div>
            <span />
          </div>
        )}
      </article>
    </li>
  );
}

function TradeDetails({ trade }: { trade: Trade }) {
  const txUrl = trade.txHash ? explorerTxUrl(trade.txHash) : undefined;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-[var(--v2-r-md)] border border-[var(--v2-line-soft)] bg-[rgb(255_255_255/0.025)] px-3 py-2 text-[13px] text-[var(--v2-ink)]">
      <Badge tone={trade.mode === "paper" ? "neutral" : "success"}>{trade.mode === "paper" ? "Paper fill" : "On-chain"}</Badge>
      <span className="v2-num">
        {trade.side === "buy" ? "Bought" : "Sold"} {formatAmount(trade.amountIn)} {tokenLabel(trade.tokenIn)} →{" "}
        {formatAmount(trade.amountOut)} {tokenLabel(trade.tokenOut)}
      </span>
      <span className="v2-num text-[var(--v2-faint)]">@ {formatPrice(trade.price)} MON/$CHOG</span>
      {trade.txHash &&
        (txUrl ? (
          <a href={txUrl} target="_blank" rel="noopener noreferrer" className="v2-link v2-mono text-xs">
            tx {shortAddress(trade.txHash, 6)} ↗
          </a>
        ) : (
          <span className="v2-mono text-xs text-[var(--v2-faint)]">tx {shortAddress(trade.txHash, 6)}</span>
        ))}
    </div>
  );
}
