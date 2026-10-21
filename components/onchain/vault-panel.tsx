"use client";

import { skipToken, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { type Address, type Hex, formatUnits } from "viem";
import { TimeAgo, useNow } from "@/components/decision-feed";
import { publicClient } from "@/lib/clients";
import { appConfig } from "@/lib/config";
import {
  type GuardStatus,
  type VaultBalances,
  animrTradeGuardAbi,
  animrTradeGuardAddress,
  readGuardStatus,
  readVaultBalances,
} from "@/lib/contracts/animr-trade-guard";
import { type TokenBoundAccountStatus, erc6551AccountAbi, getTokenBoundAccountStatus } from "@/lib/erc6551";
import { explorerAddressUrl, explorerTxUrl, formatAmount } from "@/lib/format";
import { agentKey, fetchAgentDetail, onchainKeys, retryTransient } from "./queries";
import { describeLimits, formatInterval } from "./setup-steps";
import { describeTxError } from "./tx-errors";

const LABEL = "text-[11px] font-medium uppercase tracking-wider text-subtle";
/** IERC6551Account.isValidSigner's magic value: the guard may execute for the wallet. */
const VALID_SIGNER: Hex = "0x523e3260";
const MON = appConfig.chain.nativeCurrency.symbol;

const fmt = (value: bigint, digits = 4) => formatAmount(formatUnits(value, 18), digits);

type VaultView = {
  balances: VaultBalances;
  account: TokenBoundAccountStatus;
  /** From the wallet's token() once it is set up. */
  tokenId?: number;
  guard?: {
    authorized: boolean;
    status: GuardStatus;
    /** Unix seconds of the last guard trade for the current holder (0 = never). */
    lastTradeAt: number;
  };
};

async function readVault(tba: Address, guard: Address | undefined): Promise<VaultView> {
  const [balances, account] = await Promise.all([
    readVaultBalances(publicClient, tba),
    getTokenBoundAccountStatus(publicClient, tba),
  ]);
  if (account !== "ready") return { balances, account };
  const wallet = { address: tba, abi: erc6551AccountAbi } as const;
  const [[, , tokenId], owner] = await Promise.all([
    publicClient.readContract({ ...wallet, functionName: "token" }),
    publicClient.readContract({ ...wallet, functionName: "owner" }),
  ]);
  const base = { balances, account, tokenId: Number(tokenId) };
  if (!guard) return base;
  const [status, signer, vault] = await Promise.all([
    readGuardStatus(publicClient, tba, guard),
    publicClient.readContract({ ...wallet, functionName: "isValidSigner", args: [guard, "0x"] }),
    publicClient.readContract({ address: guard, abi: animrTradeGuardAbi, functionName: "vaultOf", args: [tba, owner] }),
  ]);
  return { ...base, guard: { authorized: signer === VALID_SIGNER, status, lastTradeAt: Number(vault.lastTradeAt) } };
}

type VaultPanelProps = {
  /** The Chog's ERC-6551 account. */
  tba: Address;
  /** Saves a read when the caller knows it; otherwise taken from the wallet's token(). */
  tokenId?: number;
  className?: string;
};

/** The Chog's vault on-chain: real balances, AnimrTradeGuard's status and limits, and recent on-chain trades. */
export function VaultPanel({ tba, tokenId, className = "" }: VaultPanelProps) {
  const guardAddress = animrTradeGuardAddress;
  const vault = useQuery({
    queryKey: onchainKeys.vault(guardAddress, tba),
    queryFn: () => readVault(tba, guardAddress),
    refetchInterval: 20_000,
    retry: retryTransient,
  });
  const id = tokenId ?? vault.data?.tokenId;
  const agent = useQuery({
    queryKey: agentKey(id ?? -1),
    queryFn: id !== undefined ? () => fetchAgentDetail(id) : skipToken,
    refetchInterval: 30_000,
  });
  const explorer = explorerAddressUrl(tba);
  const data = vault.data;
  const trades = (agent.data?.decisions ?? []).filter((d) => d.trade?.mode === "onchain" && d.trade.txHash).slice(0, 5);
  const mode = agent.data?.agent?.mode;

  return (
    <section className={`card p-5 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={LABEL}>Vault · real $CHOG</h2>
        {explorer && (
          <a
            href={explorer}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-subtle hover:text-foreground"
          >
            Explorer ↗
          </a>
        )}
      </div>

      {!data ? (
        vault.isError ? (
          <p className="mt-3 text-sm text-danger">
            Couldn&apos;t read the vault: {describeTxError(vault.error)}{" "}
            <button
              type="button"
              onClick={() => vault.refetch()}
              className="btn btn-secondary ml-1 px-2.5 py-1 text-xs"
            >
              Retry
            </button>
          </p>
        ) : (
          <div role="status" aria-label="Reading the vault" className="mt-3 grid grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-2" />
            ))}
          </div>
        )
      ) : (
        <>
          <dl className="mt-3 grid grid-cols-3 gap-3">
            <Balance label="$CHOG" value={fmt(data.balances.chog, 2)} />
            <Balance label="WMON" note={`${MON}, wrapped`} value={fmt(data.balances.wmon)} />
            <Balance label={MON} note="native, not traded" value={fmt(data.balances.mon)} muted />
          </dl>

          <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
            <Row label="AI mode">
              {mode === "onchain" ? (
                <span className="text-success">On-chain</span>
              ) : mode === "paper" ? (
                <span title="Trades are simulated at live prices; no tokens move.">Paper (simulated)</span>
              ) : (
                <span className="text-subtle">{agent.isPending && id !== undefined ? "…" : "Not activated"}</span>
              )}
            </Row>
            <GuardRows data={data} launching={!guardAddress} />
          </dl>

          {trades.length > 0 && (
            <div className="mt-4 border-t border-line pt-4">
              <h3 className={LABEL}>Recent on-chain trades</h3>
              <ul className="mt-2 space-y-1.5">
                {trades.map((d) => {
                  const trade = d.trade!;
                  const href = trade.txHash ? explorerTxUrl(trade.txHash) : undefined;
                  return (
                    <li key={d.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
                      <span>
                        <span className={trade.side === "buy" ? "text-success" : "text-danger"}>
                          {trade.side === "buy" ? "Bought" : "Sold"}
                        </span>{" "}
                        <span className="font-mono">
                          {formatAmount(trade.amountIn, 4)} {trade.tokenIn} → {formatAmount(trade.amountOut, 4)}{" "}
                          {trade.tokenOut}
                        </span>
                      </span>
                      <span className="text-xs text-subtle">
                        <TimeAgo iso={d.at} />
                        {href && (
                          <>
                            {" · "}
                            <a href={href} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
                              tx ↗
                            </a>
                          </>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}

      <p className="mt-4 text-xs leading-relaxed text-subtle">
        Read on-chain every 20s. Through AnimrTradeGuard the AI can only swap CHOG ⇄ WMON inside this wallet; it can
        never withdraw.
      </p>
    </section>
  );
}

function GuardRows({ data, launching }: { data: VaultView; launching: boolean }) {
  const now = useNow();
  if (launching) {
    return (
      <Row label="Guard">
        <span className="text-warning">Launching · paper trading today</span>
      </Row>
    );
  }
  if (!data.guard) {
    return (
      <Row label="Guard">
        <span className="text-subtle">{data.account === "ready" ? "Unavailable" : "Wallet not set up yet"}</span>
      </Row>
    );
  }
  const { authorized, status, lastTradeAt } = data.guard;
  const { limits } = status;
  const nextAt = lastTradeAt > 0 ? lastTradeAt + limits.minInterval : 0;
  const waitSec = now !== null && nextAt > 0 ? Math.max(0, Math.ceil(nextAt - now / 1000)) : 0;
  return (
    <>
      <Row label="Guard">
        {authorized ? (
          <span className="text-success">Authorized</span>
        ) : (
          <span className="text-subtle">Not authorized</span>
        )}
      </Row>
      <Row label="AI trading">
        {status.paused ? (
          <span className="text-warning">Paused by Animr</span>
        ) : limits.enabled && authorized ? (
          <span className="text-success">Enabled</span>
        ) : limits.enabled ? (
          <span className="text-warning">Enabled, guard not authorized</span>
        ) : (
          <span className="text-subtle">Off</span>
        )}
      </Row>
      {limits.enabled && (
        <div>
          <dt className="sr-only">Limits</dt>
          <dd className="text-xs leading-relaxed text-muted">{describeLimits(limits)}</dd>
        </div>
      )}
      {limits.enabled && authorized && !status.paused && (
        <Row label="Allowed now">
          <span className="font-mono text-xs">
            sell ≤ {fmt(status.maxSellChog, 2)} $CHOG · buy ≤ {fmt(status.maxBuyWithWmon)} WMON
          </span>
        </Row>
      )}
      <Row label="Last on-chain trade">
        {lastTradeAt > 0 ? (
          <>
            <TimeAgo iso={new Date(lastTradeAt * 1000).toISOString()} />
            {waitSec > 0 && <span className="text-subtle"> · next in {formatInterval(waitSec)}</span>}
          </>
        ) : (
          <span className="text-subtle">None yet</span>
        )}
      </Row>
    </>
  );
}

function Balance({
  label,
  value,
  note,
  muted = false,
}: {
  label: string;
  value: string;
  note?: string;
  muted?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className={LABEL}>{label}</dt>
      <dd className={`mt-1 truncate font-mono text-sm tabular-nums ${muted ? "text-muted" : "text-foreground"}`}>
        {value}
      </dd>
      {note && <dd className="text-[11px] text-subtle">{note}</dd>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-subtle">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
