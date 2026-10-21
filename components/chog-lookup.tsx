"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type FormEvent, type ReactNode, useEffect, useEffectEvent, useId, useState } from "react";
import {
  type Address,
  type Hash,
  erc20Abi,
  erc721Abi,
  formatUnits,
  isAddressEqual,
  maxUint256,
  parseUnits,
  zeroAddress,
} from "viem";
import {
  useBalance,
  useConnection,
  useReadContract,
  useReadContracts,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { isFlaggedTokenId, traitSafety } from "@/lib/brand-safety";
import { type ChogQueryHit, chogLabel, chogQueryText, nameNumberOf, parseChogQuery } from "@/lib/chog-id";
import { publicClient } from "@/lib/clients";
import { appConfig } from "@/lib/config";
import {
  ERC6551_REGISTRY_ADDRESS,
  type TokenBoundAccountParams,
  type TokenBoundAccountStatus,
  computeTokenBoundAccount,
  createAndInitializeAccountRequest,
  getTokenBoundAccountStatus,
} from "@/lib/erc6551";
import {
  explorerAddressUrl,
  explorerTxUrl,
  formatAmount,
  marketplaceUrl,
  shortAddress,
} from "@/lib/format";
import { type NftMetadata, fetchNftMetadata } from "@/lib/nft";
import { isContractRevert, isZeroDataError, walletErrorMessage } from "@/lib/wagmi";
import { ConfigNotice } from "./config-notice";
import { ConnectButton, useIsClient } from "./connect-button";
import { LookupDna } from "./dna/lookup-dna";
import { chogThumbUrl } from "./dna/thumb-url";
import { fetchLeaderboard, leaderboardKey } from "./leaderboard-api";

const chainId = appConfig.chain.id;
const nativeSymbol = appConfig.chain.nativeCurrency.symbol;
const ZERO = BigInt(0); // tsconfig targets ES2017, so no bigint literals

// Reverts and "no contract here" are deterministic; only retry transient RPC failures.
const retryTransient = (failureCount: number, error: unknown) =>
  failureCount < 2 && !isContractRevert(error) && !isZeroDataError(error);

type ParsedId =
  | { kind: "empty" }
  | { kind: "invalid"; message: string }
  | { kind: "valid"; id: string };

/** A lookup: a token id, or (Chog Genesis) a name number, with the other reading of a typed number when it differs. */
type ParsedLookup =
  | Exclude<ParsedId, { kind: "valid" }>
  | {
      kind: "valid";
      id: string;
      /** Its name number ("CHOG #1462" -> 1462), when known. */
      nameNumber?: number;
      via: "token" | "name";
      other?: ChogQueryHit & { via: "token" | "name" };
    };

const { min: MIN_ID, max: MAX_ID } = appConfig.tokenIdRange;
/** Chog Genesis has a known range; another collection accepts any uint256. */
const BOUNDED = MAX_ID < maxUint256;

/**
 * Chog Genesis: a token id ("1", "token 1") or a name ("CHOG #1462", "#1462", "1462 (name)"); a bare number is a token
 * id and the name reading is offered beside it (lib/chog-id.ts). Another collection: token ids only.
 */
function parseLookup(raw: string, nameNumbers: readonly number[] | undefined): ParsedLookup {
  if (BOUNDED && nameNumbers && nameNumbers.length > 0) {
    const query = parseChogQuery(raw, nameNumbers, Number(MAX_ID));
    if (query.kind !== "ok") return query;
    return {
      kind: "valid",
      id: String(query.tokenId),
      ...(query.nameNumber > 0 && { nameNumber: query.nameNumber }),
      via: query.via,
      ...(query.other && { other: query.other }),
    };
  }
  const parsed = parseTokenId(raw);
  return parsed.kind === "valid" ? { ...parsed, via: "token" } : parsed;
}

function parseTokenId(raw: string): ParsedId {
  const value = raw.trim().replace(/^#/, "");
  if (!value) return { kind: "empty" };
  if (!/^\d+$/.test(value)) {
    return { kind: "invalid", message: `Token IDs are whole numbers, like ${MIN_ID} or 420.` };
  }
  const id = BigInt(value);
  if (id < MIN_ID || id > MAX_ID) {
    return {
      kind: "invalid",
      message: BOUNDED ? `Chog token IDs run from ${MIN_ID} to ${MAX_ID}.` : "That's larger than any token ID can be.",
    };
  }
  return { kind: "valid", id: id.toString() };
}

/** Only meaningful for a bounded range. Never a Chog whose art carries flagged words (lib/brand-safety.ts). */
function randomTokenId(): string {
  const span = Number(MAX_ID - MIN_ID) + 1;
  for (;;) {
    const id = MIN_ID + BigInt(Math.floor(Math.random() * span));
    if (!isFlaggedTokenId(id)) return id.toString();
  }
}

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/**
 * Token ID or name input → the Chog's ERC-6551 wallet, its balances and the owner's actions. `metadataIds[i]` is
 * token i+1's name number ("CHOG #1462" is token 1): either number finds a Chog, and the other reading of a typed
 * number is offered next to the result, which always shows both ("CHOG #1462 · token 1").
 */
export function ChogLookup({ metadataIds }: { metadataIds?: readonly number[] } = {}) {
  const searchParams = useSearchParams();
  const [input, setInput] = useState(() => searchParams.get("id") ?? "");
  const parsed = parseLookup(input, metadataIds);
  const tokenId = useDebounced(parsed.kind === "valid" ? parsed.id : "", 300);
  const hint = parsed.kind === "valid" ? <ReadingHint parsed={parsed} onPick={setInput} /> : undefined;

  // Mirror the lookup in ?id= so it can be shared.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (tokenId) url.searchParams.set("id", tokenId);
    else url.searchParams.delete("id");
    if (url.href !== window.location.href) window.history.replaceState(null, "", url);
  }, [tokenId]);

  const { chogNft, accountImplementation } = appConfig;
  return (
    <div className="space-y-4">
      <LookupCard
        value={input}
        onChange={setInput}
        error={parsed.kind === "invalid" ? parsed.message : undefined}
        hint={hint}
        named={Boolean(BOUNDED && metadataIds?.length)}
        disabled={!chogNft || !accountImplementation}
      />
      {!chogNft || !accountImplementation ? (
        <ConfigNotice />
      ) : tokenId ? (
        <ChogResult
          key={tokenId}
          nameNumber={BOUNDED ? metadataIds?.[Number(tokenId) - 1] || undefined : undefined}
          params={{
            implementation: accountImplementation,
            tokenContract: chogNft,
            tokenId: BigInt(tokenId),
            chainId,
            salt: appConfig.salt,
          }}
        />
      ) : (
        <div className="rounded-2xl border border-dashed border-line px-5 py-8 text-center text-sm text-subtle">
          {BOUNDED ? (
            <>
              <p>
                Enter a token ID above ({MIN_ID.toString()}–{MAX_ID.toString()}) or a name like CHOG #1462, or{" "}
                <button
                  type="button"
                  onClick={() => setInput(randomTokenId())}
                  className="font-medium text-accent-strong hover:underline"
                >
                  pick a random Chog
                </button>
                .
              </p>
              <ExampleChogs onPick={setInput} metadataIds={metadataIds} />
              <AwakeNow metadataIds={metadataIds} />
            </>
          ) : (
            "Enter a token ID above."
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The Chogs the landing page features (components/landing/content.ts), one tap away, so a first
 * visit doesn't start from a blank form. Names are their AI names (stable: lib/agent/persona.ts).
 * Chog Genesis only: the caller shows them for the bounded collection.
 */
const EXAMPLE_CHOGS = [
  { id: "1820", name: "Silver Whiskers" },
  { id: "1342", name: "Clever Ears" },
  { id: "241", name: "Clever Snout" },
  { id: "255", name: "Sleepy Purr" },
  { id: "45", name: "Diamond Mane" },
] as const;

/** "CHOG #1469 · token 8" when the name number is known, else "token 8". */
const idsOf = (tokenId: string | number, metadataIds?: readonly number[]) =>
  chogLabel(tokenId, { number: metadataIds?.[Number(tokenId) - 1] || undefined });

function ExampleChogs({ onPick, metadataIds }: { onPick: (id: string) => void; metadataIds?: readonly number[] }) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
      <span className="text-xs text-subtle">Try</span>
      {EXAMPLE_CHOGS.map((chog) => (
        <button
          key={chog.id}
          type="button"
          onClick={() => onPick(chog.id)}
          className="chip px-3 py-1 transition-colors hover:border-accent/50 hover:text-foreground"
        >
          {chog.name} <span className="font-mono text-[11px] text-subtle">{idsOf(chog.id, metadataIds)}</span>
        </button>
      ))}
    </div>
  );
}

/** Chogs whose AI is running now (from the leaderboard), linking to their feeds. Hidden when none are. */
function AwakeNow({ metadataIds }: { metadataIds?: readonly number[] }) {
  const leaderboard = useQuery({ queryKey: leaderboardKey, queryFn: fetchLeaderboard, staleTime: 30_000 });
  const awake = (leaderboard.data?.agents ?? []).filter((agent) => agent.active).slice(0, 4);
  if (awake.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
      <span className="text-xs text-subtle">Awake now</span>
      {awake.map((agent) => (
        <Link
          key={agent.tokenId}
          href={`/chog/${agent.tokenId}`}
          className="chip px-3 py-1 transition-colors hover:border-success/50 hover:text-foreground"
        >
          <span aria-hidden className="size-1.5 rounded-full bg-success" />
          {agent.persona.name} <span className="font-mono text-[11px] text-subtle">{idsOf(agent.tokenId, metadataIds)}</span>
        </Link>
      ))}
    </div>
  );
}

/**
 * Which Chog the text found and the other reading of the same number: "Token 1462 is CHOG #1209. Looking for
 * CHOG #1462? [CHOG #1462 · token 1 →]". Picking the other reading types it into the box.
 */
function ReadingHint({
  parsed,
  onPick,
}: {
  parsed: Extract<ParsedLookup, { kind: "valid" }>;
  onPick: (text: string) => void;
}) {
  const { id, nameNumber, via, other } = parsed;
  if (!nameNumber && !other) return null;
  const found =
    via === "name" ? (
      <>
        <span className="font-mono text-foreground">CHOG #{nameNumber}</span> is token {id}.
      </>
    ) : nameNumber ? (
      <>
        Token {id} is <span className="font-mono text-foreground">CHOG #{nameNumber}</span>.
      </>
    ) : null;
  return (
    <p className="mt-2 text-sm text-muted">
      {found}
      {other && (
        <>
          {" "}
          Looking for {other.via === "name" ? <span className="font-mono">CHOG #{other.nameNumber}</span> : `token ${other.tokenId}`}
          ?{" "}
          <button
            type="button"
            onClick={() => onPick(chogQueryText(other))}
            className="font-medium text-accent-strong hover:underline"
          >
            Show {chogLabel(other.tokenId, { number: other.nameNumber })} →
          </button>
        </>
      )}
    </p>
  );
}

/** Suspense fallback with the same footprint as the lookup card. */
export function ChogLookupSkeleton() {
  return <LookupCard value="" onChange={() => {}} named={BOUNDED} disabled />;
}

function LookupCard({
  value,
  onChange,
  error,
  hint,
  named = false,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: ReactNode;
  /** Names ("CHOG #1462") are accepted too: a text keyboard and no "#" prefix (that would read as a name). */
  named?: boolean;
  disabled?: boolean;
}) {
  const errorId = useId();
  return (
    <div className="card p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Look up a Chog</h2>
      <p className="mt-1 text-sm text-muted">
        By token ID or by the name marketplaces show (CHOG #1462). Every Chog NFT has its own wallet address, computed
        locally from the ERC-6551 registry, before it is even deployed.
      </p>
      {/* The lookup runs as you type; submitting (the keyboard's Search key) just closes the keyboard. */}
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          event.currentTarget.querySelector("input")?.blur();
        }}
      >
        <label className="relative mt-4 block">
          <span className="sr-only">{named ? "Chog token ID or name" : "Chog token ID"}</span>
          {!named && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-4 flex items-center font-mono text-lg text-subtle"
            >
              #
            </span>
          )}
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            disabled={disabled}
            inputMode={named ? "text" : "numeric"}
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            placeholder={named ? "Token ID (1) or name (CHOG #1462)" : "Token ID, e.g. 42"}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className={`input font-mono text-lg ${named ? "" : "pl-9"}`}
          />
        </label>
      </form>
      {error && (
        <p id={errorId} role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
      {!error && hint}
    </div>
  );
}

function ChogResult({ params, nameNumber }: { params: TokenBoundAccountParams; nameNumber?: number }) {
  let tba: Address;
  try {
    tba = computeTokenBoundAccount(params);
  } catch (error) {
    return (
      <div role="alert" className="card border-danger/40 p-5 text-sm">
        <p className="font-medium text-danger">Couldn&apos;t compute the wallet address.</p>
        <p className="mt-1 text-muted">
          Check <code className="font-mono">NEXT_PUBLIC_TBA_SALT</code> (a 32-byte hex value) and
          the configured addresses. {error instanceof Error ? error.message.split("\n")[0] : ""}
        </p>
      </div>
    );
  }
  return <ChogDetails params={params} tba={tba} nameNumber={nameNumber} />;
}

function ChogDetails({ params, tba, nameNumber }: { params: TokenBoundAccountParams; tba: Address; nameNumber?: number }) {
  const { tokenContract: nft, tokenId } = params;
  const id = tokenId.toString();
  const token = appConfig.chogToken;

  // The server renders "disconnected"; only trust wallet state once hydrated.
  const isClient = useIsClient();
  const connection = useConnection();
  const account = isClient && connection.status === "connected" ? connection.address : undefined;
  const onTargetChain = isClient && connection.chainId === chainId;

  // Not just "has code": a created Tokenbound proxy is unusable until it's initialized.
  const accountStatus = useQuery({
    queryKey: ["tba-status", tba],
    queryFn: () => getTokenBoundAccountStatus(publicClient, tba),
    retry: retryTransient,
  });
  const owner = useReadContract({
    address: nft,
    abi: erc721Abi,
    functionName: "ownerOf",
    args: [tokenId],
    chainId,
    query: { retry: retryTransient },
  });
  const metadata = useQuery({
    queryKey: ["nft-metadata", nft, id],
    queryFn: () => fetchNftMetadata(nft, tokenId),
    staleTime: Infinity,
  });
  const native = useBalance({ address: tba, chainId });
  const chog = useReadContracts({
    allowFailure: false,
    chainId,
    contracts: [
      { address: token ?? zeroAddress, abi: erc20Abi, functionName: "balanceOf", args: [tba] },
      { address: token ?? zeroAddress, abi: erc20Abi, functionName: "decimals" },
      { address: token ?? zeroAddress, abi: erc20Abi, functionName: "symbol" },
    ],
    query: { enabled: Boolean(token), retry: retryTransient },
  });
  const walletChog = useReadContract({
    address: token ?? zeroAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account ?? zeroAddress],
    chainId,
    query: { enabled: Boolean(token && account), retry: retryTransient },
  });

  const refresh = () => {
    void accountStatus.refetch();
    void native.refetch();
    if (token) void chog.refetch();
    if (token && account) void walletChog.refetch();
  };

  const notMinted = owner.isError && isContractRevert(owner.error);
  const noNftContract = owner.isError && isZeroDataError(owner.error);
  const ownerAddress = owner.data;
  const isOwner = Boolean(account && ownerAddress && isAddressEqual(account, ownerAddress));
  const status = accountStatus.data;
  const meta = metadata.data ?? undefined;
  // Both numbers, always: the name marketplaces show and the token id ("CHOG #1462 · token 1"). The metadata name
  // wins once loaded (a 1:1 keeps its title, "CHOG #53 — Blaze"); a collection without "CHOG #" names keeps
  // "Chog #<id>" with its marketplace name as a secondary detail.
  const metaNamed = meta?.name && nameNumberOf(meta.name) !== null ? meta.name : undefined;
  const heading = metaNamed ?? (nameNumber ? `CHOG #${nameNumber}` : `Chog #${id}`);
  const named = heading !== `Chog #${id}`;
  const idLabel = named ? chogLabel(id, { metadataName: heading }) : `Chog #${id}`;
  const metadataName = !named && meta?.name && meta.name !== heading ? meta.name : undefined;
  const buyUrl = marketplaceUrl(nft, id);
  const tbaUrl = explorerAddressUrl(tba);
  const tokenInfo = chog.data
    ? { balance: chog.data[0], decimals: chog.data[1], symbol: chog.data[2] }
    : undefined;
  const tokenLabel = `$${tokenInfo?.symbol ?? "CHOG"}`;

  return (
    <article className="card">
      {/* Identity */}
      <div className="flex items-start gap-4 p-5 sm:gap-5 sm:p-6">
        <ChogImage
          key={meta?.image}
          image={meta?.image}
          alt={idLabel}
          id={id}
          loading={metadata.isPending}
        />
        <div className="min-w-0 flex-1">
          <h3 className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-xl font-semibold sm:text-2xl">
            <span className="min-w-0 truncate">{heading}</span>
            {named && (
              <span className="text-base font-normal whitespace-nowrap text-muted sm:text-lg">
                <span aria-hidden>· </span>token {id}
              </span>
            )}
          </h3>
          {metadataName && (
            <p className="mt-0.5 text-xs text-subtle">
              Marketplace name: <span className="font-mono">{metadataName}</span>
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            {owner.isPending ? (
              <span className="inline-block h-4 w-40 animate-pulse rounded bg-surface-2" />
            ) : ownerAddress ? (
              <>
                <span>
                  Owned by <AddressLink address={ownerAddress} />
                </span>
                {isOwner && <span className="chip border-accent/40 text-accent-strong">You</span>}
              </>
            ) : notMinted ? (
              <span className="chip border-danger/40 text-danger">Not minted</span>
            ) : (
              <span className="text-danger">Owner unavailable</span>
            )}
          </div>
          {meta && meta.attributes.length > 0 && (
            <ul className="mt-3 hidden flex-wrap gap-1.5 sm:flex">
              {/* Flagged values show under their neutral names; hidden ones aren't shown (lib/brand-safety.ts). */}
              {meta.attributes
                .map((attr) => ({ type: attr.trait_type, verdict: traitSafety(attr.trait_type, attr.value) }))
                .filter(({ verdict }) => verdict.action !== "hide")
                .slice(0, 6)
                .map(({ type, verdict }, index) => (
                  <li key={`${type}-${index}`} className="chip">
                    <span className="text-subtle">{type}</span> {verdict.display}
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>

      {/* Its trading DNA: archetype, League rank, today's Bell call (Chog Genesis only). */}
      <LookupDna tokenId={id} />

      {/* The token-bound account */}
      <section className="border-t border-line px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-medium text-muted">Chog wallet · ERC-6551 token-bound account</h4>
          <DeploymentChip status={status} failed={accountStatus.isError} />
        </div>
        <div className="mt-2 flex items-center gap-2 rounded-xl border border-line bg-surface-2 py-2 pr-2 pl-3">
          <code className="min-w-0 flex-1 font-mono text-[13px] break-all text-foreground sm:text-[15px]">
            {tba}
          </code>
          <CopyButton value={tba} />
          {tbaUrl && (
            <a
              href={tbaUrl}
              target="_blank"
              rel="noreferrer"
              className="btn btn-ghost px-2 py-1 text-xs"
              aria-label="View the wallet on the block explorer"
            >
              ↗
            </a>
          )}
        </div>
        <p className="mt-2 text-xs text-subtle">
          {status === "none"
            ? "Not deployed yet. Funds sent here are already safe: the account can be created at exactly this address at any time."
            : status === "uninitialized"
              ? "Created but never initialized, so nobody can use it yet. Funds sent here are safe, and one setup transaction makes it usable."
              : "Whoever owns this NFT controls this wallet. Sell the Chog and the wallet goes with it."}
        </p>
        <DerivationDetails params={params} />
      </section>

      {/* Balances, or why there are none */}
      <section className="border-t border-line px-5 py-5 sm:px-6">
        {notMinted ? (
          <p className="text-sm text-muted">
            Token {id} hasn&apos;t been minted (<code className="font-mono">ownerOf</code> reverted).
            Its wallet address is still deterministic, but nobody can control it yet.
          </p>
        ) : noNftContract ? (
          <p className="text-sm text-danger">
            No contract answered at <code className="font-mono">NEXT_PUBLIC_CHOG_NFT_ADDRESS</code>{" "}
            ({shortAddress(nft)}) on {appConfig.chain.name}. Check the address and network.
          </p>
        ) : owner.isError ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <p className="text-danger">
              Couldn&apos;t read the NFT: {walletErrorMessage(owner.error)}
            </p>
            <button type="button" onClick={() => owner.refetch()} className="btn btn-secondary py-1">
              Retry
            </button>
          </div>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-3">
              <Stat
                label={tokenLabel}
                value={!token ? "—" : tokenInfo ? formatBalance(tokenInfo.balance, tokenInfo.decimals) : undefined}
                error={chog.isError ? walletErrorMessage(chog.error) : undefined}
              />
              <Stat
                label={nativeSymbol}
                value={native.data ? formatBalance(native.data.value, native.data.decimals) : undefined}
                error={native.isError ? walletErrorMessage(native.error) : undefined}
              />
            </dl>
            {!token && (
              <ConfigNotice keys={["chogToken"]} title="$CHOG token not configured" className="mt-3" />
            )}
          </>
        )}
      </section>

      {/* Owner actions */}
      {!notMinted && !noNftContract && (
        <section className="border-t border-line px-5 py-5 sm:px-6">
          <h4 className="text-sm font-medium text-muted">Manage this wallet</h4>
          <div className="mt-3">
            {!isClient ? (
              <p className="text-sm text-subtle">Checking your wallet…</p>
            ) : !account ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted">
                  Connect the wallet that owns {idLabel} to create its account and deposit{" "}
                  {tokenLabel}.
                </p>
                {/* ml-auto keeps the button (and its right-aligned panel) on the right when wrapped. */}
                <ConnectButton className="ml-auto" />
              </div>
            ) : !onTargetChain ? (
              <SwitchNetworkPrompt />
            ) : owner.isPending ? (
              <p className="text-sm text-subtle">Checking ownership…</p>
            ) : owner.isError ? (
              <p className="text-sm text-subtle">Ownership couldn&apos;t be checked yet. Retry above.</p>
            ) : !isOwner ? (
              <p className="text-sm text-muted">
                You&apos;re connected as <AddressLink address={account} />. Only the owner of {idLabel}
                {ownerAddress && (
                  <>
                    {" "}
                    (<AddressLink address={ownerAddress} />)
                  </>
                )}{" "}
                can manage its wallet.
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                <CreateWalletAction
                  status={status}
                  checking={accountStatus.isFetching}
                  params={params}
                  onConfirmed={refresh}
                />
                {!token ? (
                  <div className="rounded-xl border border-line bg-surface-2/50 p-4">
                    <h5 className="font-medium">Deposit {tokenLabel}</h5>
                    <ConfigNotice keys={["chogToken"]} title="$CHOG token not configured" className="mt-3" />
                  </div>
                ) : tokenInfo ? (
                  <DepositAction
                    token={token}
                    tba={tba}
                    decimals={tokenInfo.decimals}
                    symbol={tokenInfo.symbol}
                    walletBalance={walletChog.data}
                    onConfirmed={refresh}
                  />
                ) : (
                  <div className="rounded-xl border border-line bg-surface-2/50 p-4 text-sm text-subtle">
                    {chog.isError ? `Couldn't load ${tokenLabel}: ${walletErrorMessage(chog.error)}` : `Loading ${tokenLabel}…`}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Agent */}
      {!notMinted && !noNftContract && (
        <div className="flex flex-col gap-3 rounded-b-2xl border-t border-line bg-surface-2/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-sm text-muted">
            Its holder can claim it: an AI on 0G Compute then manages this wallet&apos;s {tokenLabel}, with paper fills
            at live prices or real trades through AnimrTradeGuard. Whoever holds the NFT owns the portfolio.
          </p>
          <div className="flex flex-wrap gap-2">
            {buyUrl && !isOwner && (
              <a href={buyUrl} target="_blank" rel="noreferrer" className="btn btn-secondary">
                Buy this Portfolio ↗
              </a>
            )}
            <Link href={`/chog/${id}`} className="btn btn-primary">
              Open its profile →
            </Link>
          </div>
        </div>
      )}
    </article>
  );
}

function ChogImage({
  image,
  alt,
  id,
  loading,
}: {
  image: NftMetadata["image"];
  alt: string;
  id: string;
  loading: boolean;
}) {
  const [status, setStatus] = useState<"loading" | "loaded" | "failed">("loading");
  // A 288px copy of the 1000×1000 original first; the original if the resizer fails.
  const [useOriginal, setUseOriginal] = useState(false);
  const src = image && !useOriginal ? chogThumbUrl(image, 288) : image;
  const waiting = loading || (Boolean(image) && status === "loading");
  return (
    <div className="relative size-20 shrink-0 overflow-hidden rounded-2xl border border-line bg-surface-2 sm:size-28">
      <div
        className={`flex size-full items-center justify-center bg-linear-to-br from-accent/35 to-accent-deep/10 font-mono text-sm text-foreground/80 ${
          waiting ? "animate-pulse" : ""
        }`}
      >
        #{id.length > 5 ? `${id.slice(0, 4)}…` : id}
      </div>
      {image && status !== "failed" && (
        // eslint-disable-next-line @next/next/no-img-element -- token images live on arbitrary hosts and IPFS gateways
        <img
          key={src}
          src={src}
          alt={alt}
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setStatus("loaded")}
          onError={() => (useOriginal || src === image ? setStatus("failed") : setUseOriginal(true))}
          className={`absolute inset-0 size-full object-cover transition-opacity duration-300 ${
            status === "loaded" ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </div>
  );
}

function DeploymentChip({ status, failed }: { status: TokenBoundAccountStatus | undefined; failed: boolean }) {
  if (status === "ready") {
    return (
      <span className="chip border-success/40 text-success">
        <span aria-hidden className="size-1.5 rounded-full bg-success" />
        Deployed
      </span>
    );
  }
  if (status) {
    return (
      <span className="chip border-warning/40 text-warning">
        <span aria-hidden className="size-1.5 rounded-full bg-warning" />
        {status === "uninitialized" ? "Needs setup" : "Not deployed yet"}
      </span>
    );
  }
  return <span className="chip">{failed ? "Status unavailable" : "Checking…"}</span>;
}

function DerivationDetails({ params }: { params: TokenBoundAccountParams }) {
  const rows = [
    ["registry", ERC6551_REGISTRY_ADDRESS],
    ["implementation", params.implementation],
    ["chainId", String(params.chainId)],
    ["tokenContract", params.tokenContract],
    ["tokenId", params.tokenId.toString()],
    ["salt", params.salt ?? "0x0"],
  ] as const;
  return (
    <details className="mt-3 text-xs text-subtle">
      <summary className="w-fit cursor-pointer select-none hover:text-muted">
        How is this address derived?
      </summary>
      <p className="mt-2">
        CREATE2 from the ERC-6551 registry over an ERC-1167 proxy that embeds these values, so the
        same inputs always give the same wallet:
      </p>
      <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 font-mono">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt>{label}</dt>
            <dd className="break-all text-muted">{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

const compactAmount = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });

/** Token balance for a half-width stat tile: 2 decimals from 1,000 and compact ("1.25M") from a million. */
function formatBalance(value: bigint, decimals: number): string {
  const amount = Number(formatUnits(value, decimals));
  if (amount >= 1_000_000) return compactAmount.format(amount);
  return formatAmount(amount, amount >= 1000 ? 2 : 4);
}

function Stat({ label, value, error }: { label: string; value?: string; error?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2/60 p-3 sm:p-4">
      <dt className="text-xs text-subtle">{label}</dt>
      {/* wrap-anywhere: a whale-sized balance must wrap inside its half-width tile on phones. */}
      <dd className="mt-1 font-mono text-lg tabular-nums wrap-anywhere sm:text-2xl">
        {value ?? (error ? "—" : <span className="inline-block h-7 w-24 animate-pulse rounded bg-line/60" />)}
      </dd>
      {error && value === undefined && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

function AddressLink({ address }: { address: Address }) {
  const href = explorerAddressUrl(address);
  const label = <span className="font-mono">{shortAddress(address)}</span>;
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="text-foreground hover:underline" title={address}>
      {label}
    </a>
  ) : (
    <span title={address}>{label}</span>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard unavailable; the full address is selectable.
        }
      }}
      className="btn btn-secondary px-2.5 py-1 text-xs"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function SwitchNetworkPrompt() {
  const switchChain = useSwitchChain();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-warning">
        Your wallet is on another network. Switch to {appConfig.chain.name} to manage this Chog.
      </p>
      <button
        type="button"
        onClick={() => switchChain.mutate({ chainId })}
        disabled={switchChain.isPending}
        className="btn btn-primary"
      >
        {switchChain.isPending ? "Switching…" : `Switch to ${appConfig.chain.name}`}
      </button>
      {switchChain.isError && (
        <p className="w-full text-xs text-danger">{walletErrorMessage(switchChain.error)}</p>
      )}
    </div>
  );
}

type TxState =
  | { status: "idle" }
  | { status: "signing" }
  | { status: "error"; message: string }
  | { status: "confirming"; hash: Hash }
  | { status: "confirmed"; hash: Hash }
  | { status: "failed"; hash: Hash; message: string };

/** writeContract + receipt tracking; `onConfirmed` runs once per confirmed transaction. */
function useContractTx(onConfirmed: () => void) {
  const write = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: write.data, chainId });
  const confirmedHash = receipt.isSuccess ? receipt.data.transactionHash : undefined;
  const handleConfirmed = useEffectEvent(onConfirmed);
  useEffect(() => {
    if (confirmedHash) handleConfirmed();
  }, [confirmedHash]);

  let state: TxState;
  if (write.isPending) state = { status: "signing" };
  else if (write.isError) state = { status: "error", message: walletErrorMessage(write.error) };
  else if (!write.data) state = { status: "idle" };
  else if (receipt.isError)
    state = { status: "failed", hash: write.data, message: walletErrorMessage(receipt.error) };
  else if (receipt.isSuccess) state = { status: "confirmed", hash: write.data };
  else state = { status: "confirming", hash: write.data };

  return {
    state,
    send: write.mutate,
    busy: state.status === "signing" || state.status === "confirming",
  };
}

function TxStatus({ state, success }: { state: TxState; success: string }) {
  if (state.status === "idle") return null;
  const href = "hash" in state ? explorerTxUrl(state.hash) : undefined;
  const pending = state.status === "signing" || state.status === "confirming";
  const tone =
    state.status === "confirmed"
      ? "text-success"
      : state.status === "error" || state.status === "failed"
        ? "text-danger"
        : "text-muted";
  const text = {
    signing: "Confirm the transaction in your wallet…",
    confirming: "Submitted. Waiting for confirmation…",
    confirmed: success,
    error: "message" in state ? state.message : "",
    failed: "message" in state ? `Transaction failed: ${state.message}` : "",
  }[state.status];
  return (
    <p role="status" className={`mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm ${tone}`}>
      {pending && (
        <span
          aria-hidden
          className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      <span>{text}</span>
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-dotted underline-offset-2 hover:text-foreground"
        >
          View transaction ↗
        </a>
      )}
    </p>
  );
}

function CreateWalletAction({
  status,
  checking,
  params,
  onConfirmed,
}: {
  status: TokenBoundAccountStatus | undefined;
  /** The account status is being (re)read: after a confirmed setup it is stale until this settles. */
  checking: boolean;
  params: TokenBoundAccountParams;
  onConfirmed: () => void;
}) {
  const tx = useContractTx(onConfirmed);
  const finishing = status === "uninitialized";
  // Multicall3: registry.createAccount (when nothing is deployed) + the proxy's initialize, in one transaction.
  const request = status ? createAndInitializeAccountRequest(params, status) : null;
  const label = finishing ? "Finish wallet setup" : "Create wallet";
  return (
    <div className="rounded-xl border border-line bg-surface-2/50 p-4">
      <h5 className="font-medium">{label}</h5>
      <p className="mt-1 text-sm text-muted">
        {status === "ready"
          ? "This Chog's account is live on-chain."
          : finishing
            ? "This account was created but never initialized, so it can't be used yet. One transaction finishes the setup."
            : "Deploys the account through the ERC-6551 registry and initializes it, in one transaction. Deposits work before this, too."}
      </p>
      {status !== "ready" && (
        <button
          type="button"
          disabled={!request || checking || tx.busy}
          onClick={() => request && tx.send({ ...request, chainId })}
          className="btn btn-primary mt-3"
        >
          {tx.state.status === "signing"
            ? "Confirm in wallet…"
            : tx.state.status === "confirming"
              ? finishing
                ? "Finishing…"
                : "Creating…"
              : label}
        </button>
      )}
      <TxStatus state={tx.state} success="Wallet ready." />
    </div>
  );
}

function checkAmount(
  raw: string,
  decimals: number,
  balance: bigint | undefined,
): { value?: bigint; error?: string } {
  const value = raw.trim();
  if (!value) return {};
  if (!/^(\d+\.?\d*|\.\d+)$/.test(value)) return { error: "Enter a number, like 100 or 2.5." };
  if ((value.split(".")[1] ?? "").length > decimals) {
    return { error: `Use at most ${decimals} decimal places.` };
  }
  const amount = parseUnits(value, decimals);
  if (amount === ZERO) return { error: "Enter an amount above zero." };
  if (balance !== undefined && amount > balance) return { error: "That's more than your wallet holds." };
  return { value: amount };
}

function DepositAction({
  token,
  tba,
  decimals,
  symbol,
  walletBalance,
  onConfirmed,
}: {
  token: Address;
  tba: Address;
  decimals: number;
  symbol: string;
  walletBalance: bigint | undefined;
  onConfirmed: () => void;
}) {
  const [amount, setAmount] = useState("");
  const errorId = useId();
  const tx = useContractTx(onConfirmed);
  const check = checkAmount(amount, decimals, walletBalance);
  const label = `$${symbol}`;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (check.value === undefined || tx.busy) return;
    tx.send(
      { address: token, abi: erc20Abi, functionName: "transfer", args: [tba, check.value], chainId },
      { onSuccess: () => setAmount("") },
    );
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-line bg-surface-2/50 p-4">
      <h5 className="font-medium">Deposit {label}</h5>
      <p className="mt-1 text-sm text-muted">Send {label} from your wallet into this Chog&apos;s wallet.</p>
      <div className="mt-3 flex gap-2">
        <div className="relative min-w-0 flex-1">
          <input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.0"
            aria-label={`Amount of ${label} to deposit`}
            aria-invalid={check.error ? true : undefined}
            aria-describedby={check.error ? errorId : undefined}
            className="input pr-14 font-mono"
          />
          {walletBalance !== undefined && walletBalance > ZERO && (
            <button
              type="button"
              onClick={() => setAmount(formatUnits(walletBalance, decimals))}
              className="absolute inset-y-0 right-2 my-auto h-7 rounded-md px-2 text-xs font-semibold text-accent-strong hover:bg-accent/15"
            >
              Max
            </button>
          )}
        </div>
        <button type="submit" disabled={check.value === undefined || tx.busy} className="btn btn-primary">
          {tx.state.status === "signing" ? "Confirm…" : tx.state.status === "confirming" ? "Sending…" : "Deposit"}
        </button>
      </div>
      <p className="mt-2 text-xs text-subtle">
        Your balance:{" "}
        <span className="font-mono">
          {walletBalance === undefined ? "…" : formatAmount(formatUnits(walletBalance, decimals))}
        </span>{" "}
        {label}
      </p>
      {check.error && (
        <p id={errorId} role="alert" className="mt-1 text-xs text-danger">
          {check.error}
        </p>
      )}
      <TxStatus state={tx.state} success="Deposit confirmed." />
    </form>
  );
}
