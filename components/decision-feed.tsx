"use client";

import { useState, useSyncExternalStore } from "react";
import { isAddress } from "viem";
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

const ACTION_TONE: Record<AgentAction, string> = {
  buy: "bg-success/10 text-success ring-success/30",
  sell: "bg-danger/10 text-danger ring-danger/30",
  hold: "bg-surface-2 text-muted ring-line",
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

type DecisionFeedProps = {
  /** Newest first, as returned by the API. */
  decisions: Decision[];
  /** The API's labels for the 0G providers behind the LLM decisions (AgentDetailView.providers). */
  providers?: ProviderLabels;
  /** Shown when there are no decisions yet. */
  emptyHint?: string;
};

/** The agent's "AI thoughts": one card per decision, newest first. */
export function DecisionFeed({ decisions, providers, emptyHint = "No decisions yet." }: DecisionFeedProps) {
  const [limit, setLimit] = useState(PAGE_SIZE);

  if (decisions.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-subtle">
        {emptyHint}
      </p>
    );
  }

  const hidden = decisions.length - limit;
  return (
    <div>
      <ol className="space-y-3">
        {decisions.slice(0, limit).map((decision) => (
          <DecisionCard key={decision.id} decision={decision} providers={providers} />
        ))}
      </ol>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setLimit((n) => n + PAGE_SIZE)}
          className="btn btn-secondary mt-3 w-full"
        >
          Show {Math.min(hidden, PAGE_SIZE)} older {hidden === 1 ? "thought" : "thoughts"}
        </button>
      )}
    </div>
  );
}

/**
 * Who served an LLM decision on 0G, from its receipt: the provider's tier as the Router lists it (TeeML enclave, TeeTLS
 * broker or standard) and its operator, then its address. The tier describes the provider, not a check of this call:
 * "TEE verified" appears only when the receipt itself says the Router verified the TEE signature (teeVerified === true).
 */
function ProviderReceipt({ decision: d, providers }: { decision: Decision; providers?: ProviderLabels }) {
  const address = d.zg?.provider;
  if (!address) return null;
  const label = providerLabelOf(providers, address);
  const text = label ? PROVIDER_TEXT[label.label] : undefined;
  const details = [`Provider ${address}`, d.zg?.requestId && `request ${d.zg.requestId}`].filter(Boolean).join(" · ");
  return (
    <div className="flex basis-full flex-wrap gap-x-1.5 gap-y-0.5">
      <dt>0G provider</dt>
      <dd className="flex flex-wrap items-baseline gap-x-1.5 text-muted">
        {text && (
          <span className={label?.label === "standard" ? "" : "text-foreground/90"}>
            {isTeeVerified(d) ? text.long.replace(" This call's attestation isn't verified.", "") : text.long}
            {label?.name && <span className="text-muted"> · {label.name}</span>}
          </span>
        )}
        <span className="font-mono text-subtle" title={details}>
          {text && <span aria-hidden>· </span>}
          {shortAddress(address)}
        </span>
        {isTeeVerified(d) && <span className="text-success">· TEE verified</span>}
      </dd>
    </div>
  );
}

function DecisionCard({ decision: d, providers }: { decision: Decision; providers?: ProviderLabels }) {
  const confidence = Math.round(Math.min(1, Math.max(0, d.confidence)) * 100);
  const sold = d.action === "buy" ? "MON" : "$CHOG";
  const cost = receiptCostUsd(d);

  return (
    <li className="rounded-xl border border-line bg-surface-2/40 p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span
          className={`rounded-md px-2 py-0.5 font-mono text-xs font-semibold uppercase tracking-wider ring-1 ring-inset ${ACTION_TONE[d.action]}`}
        >
          {d.action}
        </span>
        {d.action !== "hold" && (
          <span className="font-mono text-sm tabular-nums text-foreground">
            {formatAmount(d.sizeBps / 100, 2)}% <span className="text-subtle">of {sold}</span>
          </span>
        )}
        <span className="flex items-center gap-2 text-xs text-muted" title="Model confidence">
          <span className="h-1.5 w-12 overflow-hidden rounded-full bg-line" aria-hidden>
            <span className="block h-full rounded-full bg-accent" style={{ width: `${confidence}%` }} />
          </span>
          <span className="font-mono tabular-nums">{confidence}% conf.</span>
        </span>
        <TimeAgo iso={d.at} className="ml-auto font-mono text-xs text-subtle" />
      </div>

      <p className="mt-3 text-sm leading-relaxed text-foreground">{d.thesis}</p>

      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-subtle">
        <div className="flex gap-1.5">
          <dt>Price</dt>
          <dd className="font-mono tabular-nums text-muted">
            {formatPrice(d.market.priceQuote)} MON
            {typeof d.market.priceUsd === "number" && (
              <span className="text-subtle"> · {formatUsd(d.market.priceUsd)}</span>
            )}
          </dd>
        </div>
        <div className="flex gap-1.5">
          <dt>1h</dt>
          <dd className="font-mono tabular-nums text-muted">{formatPct(d.market.change1hPct)}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt>24h</dt>
          <dd className="font-mono tabular-nums text-muted">{formatPct(d.market.change24hPct)}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt>Source</dt>
          <dd className={d.market.source === "mock" ? "text-warning" : "text-muted"}>
            {SOURCE_LABEL[d.market.source] ?? d.market.source}
          </dd>
        </div>
        <div className="flex gap-1.5">
          <dt>Decided by</dt>
          <dd className="text-muted">
            {d.decidedBy === "llm" ? `${d.model ?? "LLM"} · 0G Compute` : "its trait instinct (rules)"}
          </dd>
        </div>
        {cost !== null && (
          <div className="flex gap-1.5">
            <dt>AI cost</dt>
            <dd className="font-mono tabular-nums text-muted" title={`${formatUsd(cost)} for this call, billed by the 0G Router`}>
              {formatCallCost(cost)}
            </dd>
          </div>
        )}
        {d.zg?.provider && <ProviderReceipt decision={d} providers={providers} />}
      </dl>

      {d.trade && <TradeDetails trade={d.trade} />}

      {d.error && (
        <p role="alert" className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          <span className="font-semibold">Error:</span> {d.error}
        </p>
      )}
    </li>
  );
}

function TradeDetails({ trade }: { trade: Trade }) {
  const txUrl = trade.txHash ? explorerTxUrl(trade.txHash) : undefined;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-surface-2 px-3 py-2 font-mono text-xs text-foreground">
      <span className="rounded bg-background/60 px-1.5 py-0.5 font-sans text-[10px] uppercase tracking-wider text-subtle">
        {trade.mode === "paper" ? "Paper fill" : "On-chain"}
      </span>
      <span className="tabular-nums">
        {trade.side === "buy" ? "Bought" : "Sold"} {formatAmount(trade.amountIn)} {tokenLabel(trade.tokenIn)} →{" "}
        {formatAmount(trade.amountOut)} {tokenLabel(trade.tokenOut)}
      </span>
      <span className="tabular-nums text-subtle">@ {formatPrice(trade.price)} MON/$CHOG</span>
      {trade.txHash &&
        (txUrl ? (
          <a
            href={txUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-strong underline-offset-2 hover:underline"
          >
            tx {shortAddress(trade.txHash, 6)} ↗
          </a>
        ) : (
          <span className="text-subtle">tx {shortAddress(trade.txHash, 6)}</span>
        ))}
    </div>
  );
}
