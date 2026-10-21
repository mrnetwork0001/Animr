"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type FormEvent, type ReactNode, useEffect, useEffectEvent, useId, useRef, useState } from "react";
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
import { ExternalIcon } from "@/components/v2/icons";
import { Badge, PageHeader, Skeleton, Toast, pillClass } from "@/components/v2/primitives";
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

/** The dashboard's title block, rendered by ChogLookup around its search box (the PageHeader's aside). */
export type LookupHeader = { kicker: ReactNode; title: ReactNode; lead: ReactNode };

/** Where the lookup lives: #lookup is a link target (/app?id=7#lookup), clear of the sticky header (two rows below 1100px). */
const LOOKUP_ANCHOR = { id: "lookup", scroll: "scroll-mt-36 min-[1100px]:scroll-mt-24" } as const;
/** The title block sits level with the (taller) search box rather than on its baseline. */
const HEADER_CLASS = "lg:items-center";

/**
 * Token ID or name input → the Chog's ERC-6551 wallet, its balances and the owner's actions. `metadataIds[i]` is
 * token i+1's name number ("CHOG #1462" is token 1): either number finds a Chog, and the other reading of a typed
 * number is offered next to the result, which always shows both ("CHOG #1462 · token 1").
 *
 * It renders the page's header (one h1, from `header`) with the search box as its aside, then the result under it:
 * the input and the result share state, so both live in this one client component.
 */
export function ChogLookup({ metadataIds, header }: { metadataIds?: readonly number[]; header: LookupHeader }) {
  const searchParams = useSearchParams();
  const [input, setInput] = useState(() => searchParams.get("id") ?? "");
  const parsed = parseLookup(input, metadataIds);
  const tokenId = useDebounced(parsed.kind === "valid" ? parsed.id : "", 300);
  const hint = parsed.kind === "valid" ? <ReadingHint parsed={parsed} onPick={setInput} /> : undefined;
  const resultRef = useRef<HTMLDivElement>(null);

  // Mirror the lookup in ?id= so it can be shared.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (tokenId) url.searchParams.set("id", tokenId);
    else url.searchParams.delete("id");
    if (url.href !== window.location.href) window.history.replaceState(null, "", url);
  }, [tokenId]);

  const { chogNft, accountImplementation } = appConfig;
  const configured = Boolean(chogNft && accountImplementation);
  return (
    <>
      <PageHeader
        {...header}
        className={HEADER_CLASS}
        aside={
          <LookupCard
            value={input}
            onChange={setInput}
            onSubmit={() => resultRef.current?.scrollIntoView({ block: "nearest" })}
            error={parsed.kind === "invalid" ? parsed.message : undefined}
            hint={hint}
            named={Boolean(BOUNDED && metadataIds?.length)}
            disabled={!configured}
          >
            {configured && !tokenId && BOUNDED && (
              <>
                <p className="v2-help m-0 mt-3">
                  Token IDs run {MIN_ID.toString()}–{MAX_ID.toString()}, names look like CHOG #1462. Or{" "}
                  <button type="button" onClick={() => setInput(randomTokenId())} className="v2-link">
                    pick a random Chog
                  </button>
                  .
                </p>
                <ExampleChogs onPick={setInput} metadataIds={metadataIds} />
                <AwakeNow metadataIds={metadataIds} />
              </>
            )}
            {configured && !tokenId && !BOUNDED && <p className="v2-help m-0 mt-3">Enter a token ID above.</p>}
          </LookupCard>
        }
      />
      <div ref={resultRef} className="scroll-mt-36 min-[1100px]:scroll-mt-24">
        {!chogNft || !accountImplementation ? (
          <ConfigNotice className="mt-10" />
        ) : tokenId ? (
          <section aria-label="Lookup result" className="mt-10">
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
          </section>
        ) : null}
      </div>
    </>
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
    <div className="mt-5">
      <p className="v2-overline">Try</p>
      <ul className="m-0 mt-2 list-none divide-y divide-[var(--v2-line-soft)] p-0">
        {EXAMPLE_CHOGS.map((chog) => (
          <li key={chog.id}>
            <button
              type="button"
              onClick={() => onPick(chog.id)}
              className="group -mx-2 flex w-[calc(100%+1rem)] cursor-pointer items-baseline justify-between gap-3 rounded-[var(--v2-r-xs)] px-2 py-2 text-left transition-colors hover:bg-white/[0.04]"
            >
              <span className="text-[length:var(--v2-fs-sm)] text-[var(--v2-ink)] group-hover:text-[var(--v2-kicker)]">
                {chog.name}
              </span>
              <span className="v2-num text-xs whitespace-nowrap text-[var(--v2-faint)]">{idsOf(chog.id, metadataIds)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Chogs whose AI is running now (from the leaderboard), linking to their feeds. Hidden when none are. */
function AwakeNow({ metadataIds }: { metadataIds?: readonly number[] }) {
  const leaderboard = useQuery({ queryKey: leaderboardKey, queryFn: fetchLeaderboard, staleTime: 30_000 });
  const awake = (leaderboard.data?.agents ?? []).filter((agent) => agent.active).slice(0, 4);
  if (awake.length === 0) return null;
  return (
    <div className="mt-4">
      <p className="v2-overline">Awake now</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {awake.map((agent) => (
          <Link key={agent.tokenId} href={`/chog/${agent.tokenId}`} className="v2-chip h-auto min-h-7 py-1">
            <span aria-hidden className="size-1.5 rounded-full bg-[var(--v2-success)] shadow-[0_0_8px_var(--v2-success)]" />
            {agent.persona.name}{" "}
            <span className="v2-num text-[11px] text-[var(--v2-faint)]">{idsOf(agent.tokenId, metadataIds)}</span>
          </Link>
        ))}
      </div>
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
        <span className="font-medium text-[var(--v2-ink)]">CHOG #{nameNumber}</span> is token {id}.
      </>
    ) : nameNumber ? (
      <>
        Token {id} is <span className="font-medium text-[var(--v2-ink)]">CHOG #{nameNumber}</span>.
      </>
    ) : null;
  return (
    <p className="m-0 mt-3 text-[length:var(--v2-fs-sm)] leading-relaxed text-[var(--v2-nav)]">
      {found}
      {other && (
        <>
          {" "}
          Looking for {other.via === "name" ? <span className="font-medium text-[var(--v2-ink)]">CHOG #{other.nameNumber}</span> : `token ${other.tokenId}`}
          ?{" "}
          <button type="button" onClick={() => onPick(chogQueryText(other))} className="v2-link">
            Show {chogLabel(other.tokenId, { number: other.nameNumber })} →
          </button>
        </>
      )}
    </p>
  );
}

/** Suspense fallback: the same header, with an inert search box of the same footprint. */
export function ChogLookupSkeleton({ header }: { header: LookupHeader }) {
  return (
    <PageHeader
      {...header}
      className={HEADER_CLASS}
      aside={
        <LookupCard value="" onChange={() => {}} named={BOUNDED} disabled>
          {BOUNDED && <Skeleton variant="text" className="mt-4 w-4/5" />}
        </LookupCard>
      }
    />
  );
}

function LookupCard({
  value,
  onChange,
  onSubmit,
  error,
  hint,
  named = false,
  disabled = false,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  /** After the keyboard's Search key or "Find" (the lookup itself runs as you type). */
  onSubmit?: () => void;
  error?: string;
  hint?: ReactNode;
  /** Names ("CHOG #1462") are accepted too: a text keyboard and no "#" prefix (that would read as a name). */
  named?: boolean;
  disabled?: boolean;
  /** Under the box: suggestions while it's empty. */
  children?: ReactNode;
}) {
  const errorId = useId();
  const inputId = useId();
  const headingId = useId();
  return (
    <div
      id={LOOKUP_ANCHOR.id}
      role="region"
      aria-labelledby={headingId}
      className={`v2-card v2-card--roomy ${LOOKUP_ANCHOR.scroll}`}
    >
      <h2 id={headingId} className="v2-h3">
        Look up a Chog
      </h2>
      <p className="m-0 mt-1.5 text-[length:var(--v2-fs-sm)] leading-relaxed text-pretty text-[var(--v2-nav)]">
        By token ID or by the name marketplaces show (CHOG #1462). Every Chog NFT has its own wallet address, computed
        locally from the ERC-6551 registry, before it is even deployed.
      </p>
      {/* The lookup runs as you type; submitting (Find, or the keyboard's Search key) closes the keyboard. */}
      <form
        role="search"
        aria-labelledby={headingId}
        onSubmit={(event) => {
          event.preventDefault();
          event.currentTarget.querySelector("input")?.blur();
          onSubmit?.();
        }}
        className="v2-input-group mt-5"
      >
        <label htmlFor={inputId} className="v2-sr">
          {named ? "Chog token ID or name" : "Chog token ID"}
        </label>
        {!named && (
          <span aria-hidden className="v2-num pl-4 text-lg text-[var(--v2-faint)]">
            #
          </span>
        )}
        <input
          id={inputId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          inputMode={named ? "text" : "numeric"}
          enterKeyHint="search"
          autoComplete="off"
          spellCheck={false}
          placeholder={named ? "Token ID or CHOG #1462" : "Token ID, e.g. 42"}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={`v2-input min-w-0 flex-1 text-[17px] ${named ? "" : "pl-1"}`}
        />
        <button type="submit" disabled={disabled} className={pillClass("primary")}>
          Find
        </button>
      </form>
      {error && (
        <p id={errorId} role="alert" className="m-0 mt-3 text-[length:var(--v2-fs-sm)] text-[var(--v2-danger)]">
          {error}
        </p>
      )}
      {!error && hint}
      {children}
    </div>
  );
}

/** A section of the result card: hairline on top, the card's padding. */
const SECTION = "border-t border-[var(--v2-line-soft)] p-5 sm:p-6";
/** A section's small heading. */
const SECTION_TITLE = "v2-kicker m-0";
/** A nested panel inside the card (owner actions). */
const PANEL = "rounded-[var(--v2-r-md)] border border-[var(--v2-line-soft)] bg-white/[0.02] p-4 sm:p-5";
const TEXT = "m-0 text-[length:var(--v2-fs-sm)] leading-relaxed text-pretty text-[var(--v2-nav)]";

function ChogResult({ params, nameNumber }: { params: TokenBoundAccountParams; nameNumber?: number }) {
  let tba: Address;
  try {
    tba = computeTokenBoundAccount(params);
  } catch (error) {
    return (
      <Toast tone="danger" title="Couldn't compute the wallet address.">
        Check <code className="v2-mono">NEXT_PUBLIC_TBA_SALT</code> (a 32-byte hex value) and the configured addresses.{" "}
        {error instanceof Error ? error.message.split("\n")[0] : ""}
      </Toast>
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
  const exists = !notMinted && !noNftContract;

  return (
    <article className="v2-card v2-card--flush v2-card--feature">
      {/* Identity, and the way on: its profile */}
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:p-6 lg:p-7">
        <div className="flex min-w-0 flex-1 items-start gap-4 sm:gap-6">
          <ChogImage key={meta?.image} image={meta?.image} alt={idLabel} id={id} loading={metadata.isPending} />
          <div className="min-w-0 flex-1">
            <p className="v2-kicker m-0">Lookup result</p>
            <h2 className="v2-h2 mt-2 flex min-w-0 flex-wrap items-baseline gap-x-3 text-[clamp(26px,1.4vw+18px,36px)]">
              <span className="min-w-0 truncate">{heading}</span>
              {named && (
                <span className="text-[0.6em] whitespace-nowrap text-[var(--v2-faint)]">
                  <span aria-hidden>· </span>token {id}
                </span>
              )}
            </h2>
            {metadataName && (
              <p className="v2-note mt-1">
                Marketplace name: <span className="v2-mono">{metadataName}</span>
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[length:var(--v2-fs-sm)] text-[var(--v2-nav)]">
              {owner.isPending ? (
                <Skeleton variant="text" className="w-44" />
              ) : ownerAddress ? (
                <>
                  <span>
                    Owned by <AddressLink address={ownerAddress} />
                  </span>
                  {isOwner && <Badge tone="teal">You</Badge>}
                </>
              ) : notMinted ? (
                <Badge tone="danger">Not minted</Badge>
              ) : (
                <span className="text-[var(--v2-danger)]">Owner unavailable</span>
              )}
            </div>
            {meta && meta.attributes.length > 0 && (
              <ul className="m-0 mt-4 hidden list-none flex-wrap gap-1.5 p-0 sm:flex">
                {/* Flagged values show under their neutral names; hidden ones aren't shown (lib/brand-safety.ts). */}
                {meta.attributes
                  .map((attr) => ({ type: attr.trait_type, verdict: traitSafety(attr.trait_type, attr.value) }))
                  .filter(({ verdict }) => verdict.action !== "hide")
                  .slice(0, 6)
                  .map(({ type, verdict }, index) => (
                    <li key={`${type}-${index}`} className="v2-chip">
                      <span className="text-[var(--v2-faint)]">{type}</span> {verdict.display}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>
        {exists && (
          <div className="flex shrink-0 flex-wrap gap-2 max-sm:[&>*]:flex-1 max-sm:[&>*]:px-4 sm:flex-col sm:items-stretch">
            <Link href={`/chog/${id}`} className={pillClass("primary")}>
              Open its profile <span aria-hidden>→</span>
            </Link>
            {buyUrl && !isOwner && (
              <a href={buyUrl} target="_blank" rel="noreferrer" className={pillClass("glass")}>
                Buy this Portfolio <span aria-hidden>↗</span>
              </a>
            )}
          </div>
        )}
      </div>

      {/* Its trading DNA: archetype, League rank, today's Bell call (Chog Genesis only). */}
      <LookupDna tokenId={id} />

      {/* The token-bound account and what's in it */}
      <div className={`${SECTION} grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]`}>
        <section aria-label="Chog wallet" className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className={SECTION_TITLE}>Chog wallet · ERC-6551 token-bound account</h3>
            <DeploymentBadge status={status} failed={accountStatus.isError} />
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-[var(--v2-r-md)] border border-[var(--v2-line)] bg-white/[0.03] py-2 pr-2 pl-4 shadow-[var(--v2-glass-glow)]">
            <code className="v2-mono min-w-0 flex-1 text-[13px] break-all text-[var(--v2-ink)] sm:text-[15px]">{tba}</code>
            <CopyButton value={tba} />
            {tbaUrl && (
              <a
                href={tbaUrl}
                target="_blank"
                rel="noreferrer"
                className={`${pillClass("glass", "sm")} v2-btn--icon`}
                aria-label="View the wallet on the block explorer"
              >
                <ExternalIcon className="size-4" />
              </a>
            )}
          </div>
          <p className="v2-note mt-2.5">
            {status === "none"
              ? "Not deployed yet. Funds sent here are already safe: the account can be created at exactly this address at any time."
              : status === "uninitialized"
                ? "Created but never initialized, so nobody can use it yet. Funds sent here are safe, and one setup transaction makes it usable."
                : "Whoever owns this NFT controls this wallet. Sell the Chog and the wallet goes with it."}
          </p>
          <DerivationDetails params={params} />
        </section>

        {/* Balances, or why there are none */}
        <section aria-label="Balances" className="min-w-0">
          <h3 className={SECTION_TITLE}>In its wallet</h3>
          <div className="mt-3">
            {notMinted ? (
              <p className={TEXT}>
                Token {id} hasn&apos;t been minted (<code className="v2-mono">ownerOf</code> reverted). Its wallet address is
                still deterministic, but nobody can control it yet.
              </p>
            ) : noNftContract ? (
              <p className={`${TEXT} text-[var(--v2-danger)]`}>
                No contract answered at <code className="v2-mono">NEXT_PUBLIC_CHOG_NFT_ADDRESS</code> ({shortAddress(nft)})
                on {appConfig.chain.name}. Check the address and network.
              </p>
            ) : owner.isError ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className={`${TEXT} text-[var(--v2-danger)]`}>Couldn&apos;t read the NFT: {walletErrorMessage(owner.error)}</p>
                <button type="button" onClick={() => owner.refetch()} className={pillClass("glass", "sm")}>
                  Retry
                </button>
              </div>
            ) : (
              <>
                <dl className="v2-stats v2-stats--inline">
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
                {!token && <ConfigNotice keys={["chogToken"]} title="$CHOG token not configured" className="mt-4" />}
              </>
            )}
          </div>
        </section>
      </div>

      {/* Owner actions */}
      {exists && (
        <section aria-label="Manage this wallet" className={SECTION}>
          <h3 className={SECTION_TITLE}>Manage this wallet</h3>
          <div className="mt-3">
            {!isClient ? (
              <p className={TEXT}>Checking your wallet…</p>
            ) : !account ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className={TEXT}>
                  Connect the wallet that owns {idLabel} to create its account and deposit {tokenLabel}.
                </p>
                {/* ml-auto keeps the button (and its right-aligned panel) on the right when wrapped. */}
                <ConnectButton className="ml-auto" size="sm" />
              </div>
            ) : !onTargetChain ? (
              <SwitchNetworkPrompt />
            ) : owner.isPending ? (
              <p className={TEXT}>Checking ownership…</p>
            ) : owner.isError ? (
              <p className={TEXT}>Ownership couldn&apos;t be checked yet. Retry above.</p>
            ) : !isOwner ? (
              <p className={TEXT}>
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
                  <div className={PANEL}>
                    <h4 className="v2-h3 text-base">Deposit {tokenLabel}</h4>
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
                  <div className={`${PANEL} ${TEXT}`}>
                    {chog.isError ? `Couldn't load ${tokenLabel}: ${walletErrorMessage(chog.error)}` : `Loading ${tokenLabel}…`}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Agent */}
      {exists && (
        <p className={`${TEXT} border-t border-[var(--v2-line-soft)] bg-white/[0.015] px-5 py-4 sm:px-6`}>
          Its holder can claim it: an AI on 0G Compute then manages this wallet&apos;s {tokenLabel}, with paper fills at
          live prices or real trades through AnimrTradeGuard. Whoever holds the NFT owns the portfolio.
        </p>
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
    <div className="v2-avatar v2-avatar--lg sm:size-[132px] sm:rounded-[24px] sm:shadow-[0_0_0_6px_rgb(255_255_255/0.02),0_30px_60px_-30px_rgb(111_90_220/0.6)]">
      <div
        className={`v2-num flex size-full items-center justify-center bg-[radial-gradient(circle_at_50%_35%,rgb(111_90_220/0.35),transparent_70%)] text-sm text-white/70 ${
          waiting ? "animate-pulse motion-reduce:animate-none" : ""
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

function DeploymentBadge({ status, failed }: { status: TokenBoundAccountStatus | undefined; failed: boolean }) {
  if (status === "ready") {
    return (
      <Badge tone="success" dot>
        Deployed
      </Badge>
    );
  }
  if (status) {
    return (
      <Badge tone="warning" dot>
        {status === "uninitialized" ? "Needs setup" : "Not deployed yet"}
      </Badge>
    );
  }
  return <Badge>{failed ? "Status unavailable" : "Checking…"}</Badge>;
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
    <details className="group mt-3 text-[length:var(--v2-fs-xs)] text-[var(--v2-faint)]">
      <summary className="w-fit cursor-pointer rounded select-none hover:text-[var(--v2-nav)]">
        How is this address derived?
      </summary>
      <p className="m-0 mt-2 leading-relaxed">
        CREATE2 from the ERC-6551 registry over an ERC-1167 proxy that embeds these values, so the same inputs always
        give the same wallet:
      </p>
      <dl className="v2-mono m-0 mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 rounded-[var(--v2-r-sm)] border border-[var(--v2-line-soft)] bg-white/[0.02] p-3">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt>{label}</dt>
            <dd className="m-0 break-all text-[var(--v2-nav)]">{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

const compactAmount = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });

/** Token balance for a half-width stat: 2 decimals from 1,000 and compact ("1.25M") from a million. */
function formatBalance(value: bigint, decimals: number): string {
  const amount = Number(formatUnits(value, decimals));
  if (amount >= 1_000_000) return compactAmount.format(amount);
  return formatAmount(amount, amount >= 1000 ? 2 : 4);
}

/** One balance in the v2 stat style: a DM Sans number over its label. */
function Stat({ label, value, error }: { label: string; value?: string; error?: string }) {
  return (
    <div className="v2-stat">
      <dt className="v2-stat-label">{label}</dt>
      {/* wrap-anywhere: a whale-sized balance must wrap inside its half-width column on phones. */}
      <dd className="v2-stat-value wrap-anywhere">
        {value ??
          (error ? (
            <>
              —
              <span className="mt-1 block text-[length:var(--v2-fs-xs)] whitespace-normal text-[var(--v2-danger)]">
                {error}
              </span>
            </>
          ) : (
            <Skeleton className="h-9 w-24" />
          ))}
      </dd>
    </div>
  );
}

function AddressLink({ address }: { address: Address }) {
  const href = explorerAddressUrl(address);
  const label = <span className="v2-mono">{shortAddress(address)}</span>;
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="v2-link font-normal" title={address}>
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
      className={`${pillClass("glass", "sm")} px-3.5`}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function SwitchNetworkPrompt() {
  const switchChain = useSwitchChain();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className={`${TEXT} text-[var(--v2-warning)]`}>
        Your wallet is on another network. Switch to {appConfig.chain.name} to manage this Chog.
      </p>
      <button
        type="button"
        onClick={() => switchChain.mutate({ chainId })}
        disabled={switchChain.isPending}
        className={pillClass("primary", "sm")}
      >
        {switchChain.isPending ? "Switching…" : `Switch to ${appConfig.chain.name}`}
      </button>
      {switchChain.isError && (
        <p className="m-0 w-full text-xs text-[var(--v2-danger)]">{walletErrorMessage(switchChain.error)}</p>
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

/** A transaction's progress as an inline v2 toast: signing, confirming, confirmed or failed, with its explorer link. */
function TxStatus({ state, success }: { state: TxState; success: string }) {
  if (state.status === "idle") return null;
  const href = "hash" in state ? explorerTxUrl(state.hash) : undefined;
  const tone =
    state.status === "confirmed" ? "success" : state.status === "error" || state.status === "failed" ? "danger" : "info";
  const text = {
    signing: "Confirm the transaction in your wallet…",
    confirming: "Submitted. Waiting for confirmation…",
    confirmed: success,
    error: "message" in state ? state.message : "",
    failed: "message" in state ? `Transaction failed: ${state.message}` : "",
  }[state.status];
  return (
    <Toast
      tone={tone}
      title={text}
      className="mt-3"
      action={
        href ? (
          <a href={href} target="_blank" rel="noreferrer" className="v2-link text-xs whitespace-nowrap">
            View transaction <span aria-hidden>↗</span>
          </a>
        ) : undefined
      }
    />
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
    <div className={PANEL}>
      <h4 className="v2-h3 text-base">{label}</h4>
      <p className={`${TEXT} mt-1`}>
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
          className={`${pillClass("primary", "sm")} mt-4`}
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
    <form onSubmit={submit} className={PANEL}>
      <h4 className="v2-h3 text-base">Deposit {label}</h4>
      <p className={`${TEXT} mt-1`}>Send {label} from your wallet into this Chog&apos;s wallet.</p>
      <div className="mt-4 flex gap-2">
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
            className="v2-input v2-num h-11 pr-16 text-base"
          />
          {walletBalance !== undefined && walletBalance > ZERO && (
            <button
              type="button"
              onClick={() => setAmount(formatUnits(walletBalance, decimals))}
              className="absolute inset-y-0 right-2 my-auto h-7 rounded-full px-2.5 text-xs font-medium text-[var(--v2-teal)] hover:bg-[rgb(159_240_236/0.1)]"
            >
              Max
            </button>
          )}
        </div>
        <button type="submit" disabled={check.value === undefined || tx.busy} className={`${pillClass("primary")} h-11`}>
          {tx.state.status === "signing" ? "Confirm…" : tx.state.status === "confirming" ? "Sending…" : "Deposit"}
        </button>
      </div>
      <p className="v2-note mt-2">
        Your balance:{" "}
        <span className="v2-num text-[var(--v2-nav)]">
          {walletBalance === undefined ? "…" : formatAmount(formatUnits(walletBalance, decimals))}
        </span>{" "}
        {label}
      </p>
      {check.error && (
        <p id={errorId} role="alert" className="m-0 mt-1 text-xs text-[var(--v2-danger)]">
          {check.error}
        </p>
      )}
      <TxStatus state={tx.state} success="Deposit confirmed." />
    </form>
  );
}
