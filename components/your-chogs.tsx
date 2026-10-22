"use client";

import { skipToken, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useSyncExternalStore } from "react";
import { useConnection } from "wagmi";
import { shortAddress, timeAgo } from "@/lib/format";
import type { HolderChog, HoldingsResponse } from "@/lib/holdings";
import { ConnectButton, useIsClient } from "./connect-button";
import { ArrowRightIcon } from "@/components/v2/icons";
import { Badge, EmptyState, SectionTitle, Skeleton, StatRow, Toast, type V2Stat, pillClass } from "@/components/v2/primitives";
import { ChogThumb } from "./dna/chog-thumb";
import { randomChogId } from "./dna/shared";
import { useHiddenChogs } from "./hidden-chogs";

// "Your Chogs": a connected holder sees every Chog Genesis they hold, best League rank first, each with its art, both
// numbers, its DNA, its League place, its call on the latest Daily Bell and its AI, one tap from the Time Machine, Versus,
// its profile and waking its AI. Data: GET /api/holders/[address] (lib/holdings.ts), shared by YourChogs and the
// header's YourChogsLink through one react-query key.

/** Cards shown before "Show all". */
const INITIAL_SHOWN = 6;
/** Every state carries the anchor the header's YourChogsLink points at (/app#your-chogs), clear of the sticky header. */
const ANCHOR = { id: "your-chogs", scroll: "scroll-mt-36 min-[1100px]:scroll-mt-24" } as const;
/** A row label inside a card (Bell, AI). */
const LABEL = "v2-overline pt-1";
const SMALL_BTN = `${pillClass("glass", "sm")} px-2`;

class HoldingsApiError extends Error {
  name = "HoldingsApiError";
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function fetchHoldings(address: string, signal?: AbortSignal): Promise<HoldingsResponse> {
  const res = await fetch(`/api/holders/${address}`, { signal });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const error = body && typeof body === "object" ? (body as { error?: unknown }).error : undefined;
    throw new HoldingsApiError(typeof error === "string" ? error : `Couldn't load your Chogs (HTTP ${res.status}).`, res.status);
  }
  if (!body || typeof body !== "object" || !Array.isArray((body as Partial<HoldingsResponse>).chogs)) {
    throw new HoldingsApiError("Couldn't read the answer about your Chogs.", 502);
  }
  return body as HoldingsResponse;
}

/** One cache entry per wallet, shared by every component that shows its Chogs. */
export const holdingsKey = (address: string) => ["holders", address.toLowerCase()] as const;

/** The Chogs `address` holds (GET /api/holders/[address]); idle without an address. */
export function useHoldings(address: string | undefined) {
  return useQuery({
    queryKey: holdingsKey(address ?? ""),
    queryFn: address ? ({ signal }) => fetchHoldings(address, signal) : skipToken,
    staleTime: 30_000,
    // Bell calls, ranks and AIs move on their own; ownership is re-read server-side when it changes.
    refetchInterval: 120_000,
    retry: (failures, error) =>
      failures < 2 && !(error instanceof HoldingsApiError && [400, 429, 501].includes(error.status)),
  });
}

/** The connected wallet once hydrated (the server renders "disconnected"); `pending` while wagmi reconnects. */
function useWallet(): { address?: string; pending: boolean } {
  const isClient = useIsClient();
  const connection = useConnection();
  if (!isClient) return { pending: false };
  if (connection.status === "connected") return { address: connection.address, pending: false };
  return { pending: connection.status === "connecting" || connection.status === "reconnecting" };
}

// A clock for "read 3m ago": ticks every 30 s, null on the server and while hydrating.
let clockNow = 0;
const clockListeners = new Set<() => void>();
let clockTimer: ReturnType<typeof setInterval> | undefined;

function subscribeClock(listener: () => void) {
  clockListeners.add(listener);
  clockNow = Date.now();
  clockTimer ??= setInterval(() => {
    clockNow = Date.now();
    clockListeners.forEach((notify) => notify());
  }, 30_000);
  return () => {
    clockListeners.delete(listener);
    if (!clockListeners.size && clockTimer) {
      clearInterval(clockTimer);
      clockTimer = undefined;
    }
  };
}

function useClock(): number | null {
  return useSyncExternalStore(
    subscribeClock,
    () => clockNow || null,
    () => null,
  );
}

const fmtInt = (value: number) => value.toLocaleString("en-US");

const DAY_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
/** "Oct 20" from a Bell day ("2026-10-20", UTC). */
const bellDay = (day: string) => {
  const ms = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(ms) ? DAY_FMT.format(ms) : day;
};

/** Its marketplace name, "CHOG #1462", from "CHOG #1462 · token 1" (a 1:1 keeps its title); "" when it has none. */
function marketNameOf(chog: HolderChog): string {
  const cut = chog.label.lastIndexOf(" · token ");
  return cut > 0 ? chog.label.slice(0, cut) : chog.nameNumber ? `CHOG #${chog.nameNumber}` : "";
}

/**
 * "Trading without you" only when every AI is awake and really trading; otherwise the claim is the League's replay,
 * so the headline says how they trade rather than that they do.
 */
function headline(count: number, asleep: number): string {
  if (asleep === 0) {
    return count === 1
      ? "Your Chog has been trading without you."
      : `Your ${fmtInt(count)} Chogs have been trading without you.`;
  }
  return count === 1 ? "Here's how your Chog trades." : `Here's how your ${fmtInt(count)} Chogs trade.`;
}

/**
 * "Your Chogs" for the connected wallet: a headline, highlights and one card per Chog. Disconnected, it shows a short
 * invitation to connect (`disconnected="prompt"`, the default) or nothing (`"hide"`).
 */
export function YourChogs({
  className = "",
  disconnected = "prompt",
}: {
  className?: string;
  disconnected?: "prompt" | "hide";
}) {
  const { address, pending } = useWallet();
  const holdings = useHoldings(address);

  if (!address) {
    if (pending) return <PanelSkeleton className={className} />;
    return disconnected === "prompt" ? <ConnectPrompt className={className} /> : null;
  }
  if (holdings.data) {
    return (
      <YourChogsPanel
        holdings={holdings.data}
        className={className}
        onRefresh={() => void holdings.refetch()}
        refreshing={holdings.isFetching}
      />
    );
  }
  if (holdings.isError) {
    return (
      <section id={ANCHOR.id} aria-label="Your Chogs" className={`${ANCHOR.scroll} ${className}`}>
        <Toast
          tone="danger"
          title="Couldn't load your Chogs"
          action={
            <button
              type="button"
              onClick={() => void holdings.refetch()}
              disabled={holdings.isFetching}
              className={pillClass("glass", "sm")}
            >
              {holdings.isFetching ? "Trying again…" : "Try again"}
            </button>
          }
        >
          {holdings.error.message}
        </Toast>
      </section>
    );
  }
  return <PanelSkeleton className={className} />;
}

/**
 * For the header: "Your Chogs 3", linking to the list on /app, once the connected wallet holds at least one Chog.
 * Renders nothing otherwise. Shares YourChogs' request.
 */
export function YourChogsLink({ className = "" }: { className?: string }) {
  const { address } = useWallet();
  const count = useHoldings(address).data?.chogs.length ?? 0;
  if (!address || count === 0) return null;
  return (
    <Link
      href="/app#your-chogs"
      title="Every Chog Genesis this wallet holds, with its League rank, Bell call and AI"
      className={`v2-chip is-active ${className}`}
    >
      Your Chogs <span className="v2-num text-[var(--v2-ink)]">{fmtInt(count)}</span>
    </Link>
  );
}

/** "Held by 0x12…ab": the connected states' kicker. */
function Kicker({ address }: { address: string }) {
  return <>Held by {shortAddress(address)}</>;
}

function ConnectPrompt({ className }: { className: string }) {
  const headingId = useId();
  return (
    <section id={ANCHOR.id} aria-labelledby={headingId} className={`${ANCHOR.scroll} ${className}`}>
      <SectionTitle id={headingId} title="Hold a Chog? Watch it trade." />
      <EmptyState
        title="Log in to see your Chogs"
        body="Every Chog Genesis you hold shows up here, ranked: its League place, its Daily Bell call and its AI."
        actions={<ConnectButton />}
        className="py-10"
      />
    </section>
  );
}

function PanelSkeleton({ className }: { className: string }) {
  return (
    <section id={ANCHOR.id} role="status" aria-busy className={`${ANCHOR.scroll} ${className}`}>
      <span className="v2-sr">Loading your Chogs…</span>
      <Skeleton variant="text" className="w-40" />
      <Skeleton variant="title" className="mt-3 h-9 w-4/5 max-w-lg" />
      <Skeleton className="mt-8 h-28 rounded-[var(--v2-r-lg)]" />
      <div className="v2-grid v2-grid--3 mt-6">
        {["", "hidden min-[720px]:block", "hidden lg:block"].map((visibility, i) => (
          <Skeleton key={i} variant="card" className={`h-96 ${visibility}`} />
        ))}
      </div>
    </section>
  );
}

/** The list itself, from a HoldingsResponse (no wallet code: it renders whatever it is given). */
export function YourChogsPanel({
  holdings,
  className = "",
  onRefresh,
  refreshing = false,
}: {
  holdings: HoldingsResponse;
  className?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const headingId = useId();
  const [showAll, setShowAll] = useState(false);
  const { chogs, league, bell } = holdings;
  if (chogs.length === 0) return <EmptyPanel address={holdings.address} className={className} />;

  const shown = showAll ? chogs : chogs.slice(0, INITIAL_SHOWN);
  const visible = chogs.filter((chog) => !chog.hidden);
  const plural = chogs.length > 1;
  const asleep = chogs.filter((chog) => !chog.agent?.active).length;
  // The best-ranked Chog leads the list (the API sorts by League rank).
  const best = visible[0]?.league ? visible[0] : undefined;

  return (
    <section id={ANCHOR.id} aria-labelledby={headingId} className={`${ANCHOR.scroll} ${className}`}>
      <SectionTitle
        id={headingId}
        kicker={<Kicker address={holdings.address} />}
        title={headline(chogs.length, asleep)}
        description={
          <>
            {plural ? "Their traits are their strategy" : "Its traits are its strategy"}, and the{" "}
            <Link href="/league" className="v2-link">
              League
            </Link>{" "}
            scores {plural ? "each one" : "it"} on the real $CHOG chart.
            {asleep > 0 &&
              (plural
                ? asleep === chogs.length
                  ? " Claim one's AI and it trades for that Chog on 0G Compute."
                  : ` ${asleep} of them still ${asleep === 1 ? "has its AI" : "have their AIs"} unclaimed.`
                : " Claim its AI and it trades for it on 0G Compute.")}
          </>
        }
        action={
          onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className={pillClass("ghost", "sm")}
              title="Read your Chogs again (bought or sold one just now? It shows up within a minute)"
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          )
        }
      />

      <Highlights holdings={holdings} best={best} />

      <ul className="v2-grid v2-grid--3 m-0 mt-6 list-none p-0">
        {shown.map((chog) => (
          <ChogCard
            key={chog.tokenId}
            chog={chog}
            total={league?.total ?? null}
            bellLabel={bell ? `${bell.kind === "replay" ? "Replayed Bell" : "Bell"} of ${bellDay(bell.day)}` : null}
            best={chog === best && visible.length > 1}
          />
        ))}
      </ul>

      {chogs.length > INITIAL_SHOWN && (
        <div className="mt-6 text-center">
          <button type="button" onClick={() => setShowAll((all) => !all)} className={pillClass("glass")}>
            {showAll ? "Show fewer" : `Show all ${fmtInt(chogs.length)} Chogs`}
          </button>
        </div>
      )}

      <Footnote holdings={holdings} />
    </section>
  );
}

function Highlights({ holdings, best }: { holdings: HoldingsResponse; best?: HolderChog }) {
  const { chogs, league, bell } = holdings;
  const ranked = chogs.filter((chog) => chog.league);
  const ahead = ranked.filter((chog) => (chog.league?.edgePct ?? 0) > 0).length;
  const bestEdge = ranked.reduce<number | null>((top, chog) => Math.max(top ?? -Infinity, chog.league?.edgePct ?? -Infinity), null);
  const awake = chogs.filter((chog) => chog.agent?.active).length;
  const calls = chogs.flatMap((chog) => (chog.bell ? [chog.bell] : []));
  const up = calls.filter((call) => call.forecastPct > 0).length;
  const down = calls.filter((call) => call.forecastPct < 0).length;
  const settled = calls.filter((call) => typeof call.points === "number");
  const points = settled.reduce((sum, call) => sum + (call.points ?? 0), 0);

  // One Chog gets its own numbers ("League rank", "Its AI"); several get the best of them and counts.
  const single = chogs.length === 1;
  const stats: V2Stat[] = [];
  if (best?.league && league) {
    stats.push({
      key: "best",
      label: ranked.length > 1 ? "Best in the League" : "League rank",
      hint: ranked.length > 1 ? `of ${fmtInt(league.total)}: ${best.name}` : `of ${fmtInt(league.total)} Chogs`,
      value: `#${fmtInt(best.league.rank)}`,
    });
  }
  if (ranked.length > 0) {
    stats.push(
      ahead > 0 && ranked.length > 1
        ? {
            key: "ahead",
            label: "Ahead of holding $CHOG",
            hint: "League window, simulated",
            value: `${ahead} of ${fmtInt(ranked.length)}`,
          }
        : {
            key: "edge",
            label: ranked.length > 1 ? "Best vs holding" : "vs holding $CHOG",
            hint: "League window, simulated",
            value: bestEdge === null ? "—" : signedPct(bestEdge),
            tone: bestEdge === null ? undefined : toneOf(bestEdge),
          },
    );
  }
  stats.push({
    key: "awake",
    label: single ? "Its AI" : "AIs awake",
    hint: awake > 0 ? "trading on 0G Compute" : single ? "claim it below" : "claim one below",
    value: single ? (awake ? "Awake" : "Unclaimed") : `${awake} of ${fmtInt(chogs.length)}`,
  });
  if (bell && calls.length > 0) {
    stats.push({
      key: "bell",
      label: `${bell.kind === "replay" ? "Replayed Bell" : "Bell"} of ${bellDay(bell.day)}`,
      hint: bell.status === "settled" && settled.length ? `${fmtInt(points)} points` : "settled by the market in 24h",
      value:
        calls.length === 1 ? (
          <Forecast pct={calls[0].forecastPct} />
        ) : (
          <>
            <span className="v2-up">
              <span aria-hidden className="mr-1 align-middle text-[0.5em]">
                ▲
              </span>
              <span className="v2-sr">Up </span>
              {up}
            </span>{" "}
            <span className="text-[var(--v2-faint)]">·</span>{" "}
            <span className="v2-down">
              <span aria-hidden className="mr-1 align-middle text-[0.5em]">
                ▼
              </span>
              <span className="v2-sr">Down </span>
              {down}
            </span>
          </>
        ),
    });
  }
  return <StatRow boxed stats={stats} className="[&_.v2-stat-label]:text-pretty" />;
}

/** Signed changes only: green above +0.05, red below −0.05 (they print as +0.0% / −0.0% otherwise). */
function toneOf(pct: number): "up" | "down" | undefined {
  return pct >= 0.05 ? "up" : pct <= -0.05 ? "down" : undefined;
}

/** "+9.1%", "−4.2%" (a real minus), "0.0%". */
function signedPct(pct: number): string {
  const sign = Math.abs(pct) < 0.05 ? 0 : Math.sign(pct);
  return `${sign > 0 ? "+" : sign < 0 ? "−" : ""}${Math.abs(sign ? pct : 0).toFixed(1)}%`;
}

function Forecast({ pct }: { pct: number }) {
  const sign = Math.abs(pct) < 0.05 ? 0 : Math.sign(pct);
  const tone = sign > 0 ? "v2-up" : sign < 0 ? "v2-down" : "text-[var(--v2-nav)]";
  return (
    <span className={`v2-num inline-flex items-center gap-1 whitespace-nowrap ${tone}`}>
      {sign !== 0 && (
        <span aria-hidden className="text-[0.6em]">
          {sign > 0 ? "▲" : "▼"}
        </span>
      )}
      {signedPct(pct)}
    </span>
  );
}

const MODE_LABEL: Record<NonNullable<HolderChog["agent"]>["mode"], string> = {
  paper: "paper trading",
  onchain: "real $CHOG",
};

/** Trading (on-chain, live), Paper (awake at live prices), Paused or Asleep. */
function StatusBadge({ agent }: { agent: HolderChog["agent"] }) {
  if (agent?.active) {
    return agent.mode === "onchain" ? (
      <Badge tone="teal" live>
        Trading
      </Badge>
    ) : (
      <Badge tone="warning" dot>
        Paper
      </Badge>
    );
  }
  return <Badge>{agent ? "Paused" : "Unclaimed"}</Badge>;
}

function ChogCard({
  chog,
  total,
  bellLabel,
  best,
}: {
  chog: HolderChog;
  total: number | null;
  bellLabel: string | null;
  best: boolean;
}) {
  const { tokenId } = chog;
  const marketName = marketNameOf(chog);
  const profile = `/chog/${tokenId}`;
  const awake = Boolean(chog.agent?.active);
  const rank = chog.league?.rank;
  const topPct = rank && total ? Math.max(1, Math.ceil((rank / total) * 100)) : null;
  const stats: V2Stat[] = chog.league
    ? [
        { key: "rank", label: "League", value: `#${fmtInt(chog.league.rank)}` },
        { key: "edge", label: "vs holding", value: signedPct(chog.league.edgePct), tone: toneOf(chog.league.edgePct) },
        { key: "trades", label: "Trades", value: fmtInt(chog.league.trades) },
      ]
    : [];

  return (
    <li className={`v2-card v2-card--interactive flex min-w-0 flex-col p-5 ${best ? "v2-card--feature" : ""}`}>
      <div className="flex items-start gap-4">
        <Link href={profile} tabIndex={-1} aria-hidden className="shrink-0">
          <ChogThumb image={chog.image} tokenId={tokenId} size={88} className="v2-avatar size-[88px] rounded-[18px]" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            {/* Its persona name first, then the name marketplaces show: "Silver Whiskers", "CHOG #1312". */}
            <h3 className="m-0 min-w-0 text-[length:var(--v2-fs-h3)] leading-snug font-medium tracking-[-0.012em]">
              <Link href={profile} className="text-[var(--v2-ink)] transition-colors hover:text-[var(--v2-kicker)]">
                <span className="block truncate">{chog.name}</span>
                {marketName && (
                  <span className="v2-num block text-xs font-normal text-[var(--v2-faint)]">
                    <span className="v2-sr">, </span>
                    {marketName}
                  </span>
                )}
              </Link>
            </h3>
            <StatusBadge agent={chog.agent} />
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {best && <Badge tone="violet">Your best trader</Badge>}
            {topPct !== null && topPct <= 25 && <Badge tone="success">Top {topPct}%</Badge>}
            {chog.house && (
              <Link href="/heist" className="v2-badge v2-badge--warning">
                House Chog
              </Link>
            )}
            {chog.hidden && <Badge tone="warning">Hidden</Badge>}
          </div>
        </div>
      </div>
      {(chog.archetype || chog.style) && (
        <p className="m-0 mt-4 text-[length:var(--v2-fs-sm)] leading-snug text-pretty text-[var(--v2-nav)]">
          {chog.archetype}
          {chog.archetype && chog.style && <span aria-hidden> · </span>}
          {chog.style && <span className="v2-muted capitalize">{chog.style}</span>}
        </p>
      )}

      {chog.hidden ? (
        <p className="v2-note mt-3 text-pretty">
          Hidden from Animr&apos;s public pages, so its League place, replays and Bell calls stay off until you show it
          again.
        </p>
      ) : chog.league ? (
        <StatRow
          size="sm"
          inline
          stats={stats}
          className={`mt-4 [&_.v2-stat]:px-4 [&_.v2-stat:first-child]:pl-0 [&_.v2-stat:last-child]:pr-0`}
        />
      ) : (
        <p className="v2-note mt-4">Not ranked in the League right now</p>
      )}

      <dl className="m-0 mt-4 grid grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-x-3 gap-y-3 border-t border-[var(--v2-line-soft)] pt-4 text-[length:var(--v2-fs-sm)]">
        {!chog.hidden && bellLabel && (
          <>
            <dt className={LABEL}>Bell</dt>
            <dd className="m-0 min-w-0">
              {chog.bell ? (
                <Link href={`${profile}#bell`} className="group block" title={`${bellLabel}: its call on $CHOG over 24h`}>
                  <span className="flex flex-wrap items-center gap-x-2">
                    <Forecast pct={chog.bell.forecastPct} />
                    <span className="text-xs text-[var(--v2-nav)]">{Math.round(chog.bell.conviction * 100)}% sure</span>
                    {typeof chog.bell.points === "number" && (
                      <span className="v2-num text-xs text-[var(--v2-ink)]">
                        {fmtInt(chog.bell.points)} points{chog.bell.hit ? " ✓" : ""}
                      </span>
                    )}
                    <span className="text-[11px] text-[var(--v2-faint)]">
                      {chog.bell.source === "llm" ? "by its AI" : "by its DNA"}
                    </span>
                  </span>
                  {chog.bell.thesis && (
                    <span className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--v2-faint)] group-hover:text-[var(--v2-nav)]">
                      “{chog.bell.thesis}”
                    </span>
                  )}
                </Link>
              ) : (
                <span className="text-xs text-[var(--v2-faint)]">No call on this Bell</span>
              )}
            </dd>
          </>
        )}
        <dt className={LABEL}>AI</dt>
        <dd className="m-0 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {awake && chog.agent ? (
            <>
              <span className="text-xs text-[var(--v2-ink)]">Awake · {MODE_LABEL[chog.agent.mode]}</span>
              <span
                title="Its AI vs simply holding $CHOG"
                className={`v2-num text-sm ${toneOf(chog.agent.pnlPct) === "up" ? "v2-up" : toneOf(chog.agent.pnlPct) === "down" ? "v2-down" : "text-[var(--v2-nav)]"}`}
              >
                {signedPct(chog.agent.pnlPct)}
                <span className="ml-1 text-[11px] text-[var(--v2-faint)]">vs holding</span>
              </span>
            </>
          ) : (
            <span className="text-xs text-[var(--v2-nav)]">{chog.agent ? "Paused" : "Unclaimed"}</span>
          )}
        </dd>
      </dl>

      <div className="mt-auto flex flex-col gap-2 pt-5">
        {!awake && (
          <Link
            href={profile}
            className={`${pillClass("glass", "sm", true)} border-[var(--v2-line-teal)] text-[var(--v2-kicker)] hover:text-[var(--v2-ink)]`}
            title="Opens its page: sign one free message there and an AI on 0G Compute starts trading for it"
          >
            {chog.agent ? "Wake its AI back up" : "Claim its AI"}
            <ArrowRightIcon className="v2-btn-icon size-4" />
          </Link>
        )}
        {chog.hidden ? (
          <div className="grid grid-cols-2 gap-2">
            <Link href={profile} className={SMALL_BTN}>
              Profile
            </Link>
            <Link href="/stats#hide" className={SMALL_BTN}>
              Show it again
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <Link href={`/replay/${tokenId}`} className={SMALL_BTN} aria-label={`${chog.name}: its Time Machine`}>
              <span aria-hidden className="text-[10px]">
                ▶
              </span>{" "}
              Replay
            </Link>
            <Link href={`/versus?a=${tokenId}`} className={SMALL_BTN} aria-label={`Versus: ${chog.name} against a random rival`}>
              Versus
            </Link>
            <Link href={profile} className={SMALL_BTN} aria-label={`${chog.name}: its profile`}>
              Profile
            </Link>
          </div>
        )}
      </div>
    </li>
  );
}

function Footnote({ holdings }: { holdings: HoldingsResponse }) {
  const now = useClock();
  const { league, ownership } = holdings;
  const read = now === null ? null : timeAgo(ownership.at, now);
  return (
    <p className="v2-note mt-6 max-w-[90ch] text-pretty">
      {league && <>League place: {league.window.label}, simulated. </>}
      {ownership.stale ? (
        <span className="text-[var(--v2-warning)]">
          Monad&apos;s RPC isn&apos;t answering right now: this list was read from the chain {read ?? "earlier"}.
        </span>
      ) : (
        <>Holdings read from Monad{read ? ` ${read}` : ""}, refreshed about every 10 minutes.</>
      )}
    </p>
  );
}

function EmptyPanel({ address, className }: { address: string; className: string }) {
  const router = useRouter();
  const hidden = useHiddenChogs();
  const headingId = useId();
  return (
    <section id={ANCHOR.id} aria-labelledby={headingId} className={`${ANCHOR.scroll} ${className}`}>
      <SectionTitle id={headingId} kicker={<Kicker address={address} />} title="No Chog Genesis in this wallet yet" />
      <EmptyState
        title="All 1,969 are ranked in the League"
        body="Their traits are their strategy, and the $CHOG market keeps score. Meet a few, race two of them, or ride one at today's Bell. No Chog needed."
        actions={
          <>
            {/* The draw happens on click (never while rendering): never a flagged or hidden Chog. */}
            <button
              type="button"
              onClick={() => router.push(`/replay/${randomChogId(undefined, hidden)}`)}
              className={pillClass("primary")}
            >
              <span aria-hidden className="text-xs">
                ▶
              </span>
              Watch a random Chog trade
            </button>
            <Link href="/league" className={pillClass("glass")}>
              Browse the League
            </Link>
            <Link href="/versus" className={pillClass("ghost")}>
              Race two in Versus
            </Link>
          </>
        }
      />
      <p className="v2-note mt-3 text-center">
        Holding one in another wallet? Switch to it in your wallet and it shows up here.
      </p>
    </section>
  );
}
