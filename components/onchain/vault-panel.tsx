"use client";

import { skipToken, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { type Address, type Hex, formatUnits } from "viem";
import { TimeAgo, useNow } from "@/components/decision-feed";
import { ExternalIcon } from "@/components/v2/icons";
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
    <section aria-labelledby="vault-title" className={`v2-card ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="v2-kicker">Vault · real $CHOG</p>
          <h2 id="vault-title" className="v2-h3 mt-1.5">
            On-chain balances
          </h2>
        </div>
        {explorer && (
          <a href={explorer} target="_blank" rel="noopener noreferrer" className="v2-btn-glass v2-btn--sm h-8 px-3 text-xs">
            Explorer
            <ExternalIcon className="size-3.5" />
          </a>
        )}
      </div>

      {!data ? (
        vault.isError ? (
          <p className="mt-4 text-sm text-[var(--v2-danger)]">
            Couldn&apos;t read the vault: {describeTxError(vault.error)}{" "}
            <button type="button" onClick={() => vault.refetch()} className="v2-btn-glass v2-btn--sm ml-1 h-8">
              Retry
            </button>
          </p>
        ) : (
          <div role="status" aria-label="Reading the vault" className="mt-4 grid grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <span key={i} className="v2-skeleton h-14" />
            ))}
          </div>
        )
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-3 gap-3">
            <Balance label="$CHOG" value={fmt(data.balances.chog, 2)} />
            <Balance label="WMON" note={`${MON}, wrapped`} value={fmt(data.balances.wmon)} />
            <Balance label={MON} note="native, not traded" value={fmt(data.balances.mon)} muted />
          </dl>

          <dl className="v2-kv mt-4 border-t border-[var(--v2-line-soft)] pt-4">
            <Row label="AI mode">
              {mode === "onchain" ? (
                <span className="text-[var(--v2-success)]">On-chain</span>
              ) : mode === "paper" ? (
                <span title="Trades are simulated at live prices; no tokens move.">Paper (simulated)</span>
              ) : (
                <span className="text-[var(--v2-faint)]">{agent.isPending && id !== undefined ? "…" : "Not activated"}</span>
              )}
            </Row>
            <GuardRows data={data} launching={!guardAddress} />
          </dl>

          {trades.length > 0 && (
            <div className="mt-4 border-t border-[var(--v2-line-soft)] pt-4">
              <h3 className="v2-overline">Recent on-chain trades</h3>
              <ul className="mt-2.5 space-y-2">
                {trades.map((d) => {
                  const trade = d.trade!;
                  const href = trade.txHash ? explorerTxUrl(trade.txHash) : undefined;
                  return (
                    <li key={d.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
                      <span>
                        <span className={trade.side === "buy" ? "text-[var(--v2-teal)]" : "text-[var(--v2-violet-ink)]"}>
                          {trade.side === "buy" ? "Bought" : "Sold"}
                        </span>{" "}
                        <span className="v2-num">
                          {formatAmount(trade.amountIn, 4)} {trade.tokenIn} → {formatAmount(trade.amountOut, 4)}{" "}
                          {trade.tokenOut}
                        </span>
                      </span>
                      <span className="text-xs text-[var(--v2-faint)]">
                        <TimeAgo iso={d.at} />
                        {href && (
                          <>
                            {" · "}
                            <a href={href} target="_blank" rel="noopener noreferrer" className="v2-link">
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

      <p className="v2-note mt-4">
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
        <span className="text-[var(--v2-warning)]">Launching · paper trading today</span>
      </Row>
    );
  }
  if (!data.guard) {
    return (
      <Row label="Guard">
        <span className="text-[var(--v2-faint)]">{data.account === "ready" ? "Unavailable" : "Wallet not set up yet"}</span>
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
          <span className="text-[var(--v2-success)]">Authorized</span>
        ) : (
          <span className="text-[var(--v2-faint)]">Not authorized</span>
        )}
      </Row>
      <Row label="AI trading">
        {status.paused ? (
          <span className="text-[var(--v2-warning)]">Paused by Animr</span>
        ) : limits.enabled && authorized ? (
          <span className="text-[var(--v2-success)]">Enabled</span>
        ) : limits.enabled ? (
          <span className="text-[var(--v2-warning)]">Enabled, guard not authorized</span>
        ) : (
          <span className="text-[var(--v2-faint)]">Off</span>
        )}
      </Row>
      {limits.enabled && (
        <div>
          <dt className="v2-sr">Limits</dt>
          <dd className="w-full text-left text-xs leading-relaxed font-normal text-[var(--v2-nav)]">{describeLimits(limits)}</dd>
        </div>
      )}
      {limits.enabled && authorized && !status.paused && (
        <Row label="Allowed now">
          <span className="v2-num text-xs">
            sell ≤ {fmt(status.maxSellChog, 2)} $CHOG · buy ≤ {fmt(status.maxBuyWithWmon)} WMON
          </span>
        </Row>
      )}
      <Row label="Last on-chain trade">
        {lastTradeAt > 0 ? (
          <>
            <TimeAgo iso={new Date(lastTradeAt * 1000).toISOString()} />
            {waitSec > 0 && <span className="text-[var(--v2-faint)]"> · next in {formatInterval(waitSec)}</span>}
          </>
        ) : (
          <span className="text-[var(--v2-faint)]">None yet</span>
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
    <div className="min-w-0 rounded-[var(--v2-r-md)] border border-[var(--v2-line-soft)] bg-[rgb(255_255_255/0.02)] px-3 py-2.5">
      <dt className="text-xs text-[var(--v2-faint)]">{label}</dt>
      <dd className={`v2-num mt-1 truncate text-[19px] ${muted ? "text-[var(--v2-nav)]" : "text-[var(--v2-ink)]"}`}>
        {value}
      </dd>
      {note && <dd className="text-[11px] leading-snug text-[var(--v2-faint)]">{note}</dd>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
