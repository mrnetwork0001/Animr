"use client";

import { skipToken, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useId, useState, useSyncExternalStore } from "react";
import { useConnection } from "wagmi";
import { shortAddress, timeAgo } from "@/lib/format";
import type { HolderChog, HoldingsResponse } from "@/lib/holdings";
import { ConnectButton, useIsClient } from "./connect-button";
import { ChogThumb } from "./dna/chog-thumb";
import { EdgeBadge } from "./dna/edge-badge";
import { randomChogId } from "./dna/shared";
import { useHiddenChogs } from "./hidden-chogs";
import { PnlBadge } from "./pnl-badge";

// "Your Chogs": a connected holder sees every Chog Genesis they hold, best League rank first, each with its art, both
// numbers, its genome, its League place, its call on the latest Daily Bell and its AI, one tap from Rewind, Versus,
// its profile and waking its AI. Data: GET /api/holders/[address] (lib/holdings.ts), shared by YourChogs and the
// header's YourChogsLink through one react-query key.

/** Cards shown before "Show all". */
const INITIAL_SHOWN = 6;
const LABEL = "text-[11px] font-medium uppercase tracking-wider text-subtle";
const PANEL = "rounded-2xl border border-accent/25 bg-accent/[0.04] p-5 sm:p-6";
/** Every state carries the anchor the header's YourChogsLink points at (/app#your-chogs), clear of the sticky header. */
const ANCHOR = { id: "your-chogs", scroll: "scroll-mt-28 md:scroll-mt-24" } as const;
const SMALL_BTN = "btn btn-secondary px-2 py-1.5 text-xs";

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

/** "CHOG #1462" from "CHOG #1462 · token 1" (a 1:1 keeps its title); "Chog #7" when it has no name. */
function titleOf(chog: HolderChog): string {
  const cut = chog.label.lastIndexOf(" · token ");
  return cut > 0 ? chog.label.slice(0, cut) : `Chog #${chog.tokenId}`;
}

function headline(count: number): string {
  return count === 1
    ? "Your Chog has been trading without you."
    : `Your ${fmtInt(count)} Chogs have been trading without you.`;
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
      <section role="alert" className={`card border-danger/40 p-5 ${className}`}>
        <p className="font-medium text-danger">Couldn&apos;t load your Chogs</p>
        <p className="mt-1 text-sm text-muted">{holdings.error.message}</p>
        <button
          type="button"
          onClick={() => void holdings.refetch()}
          disabled={holdings.isFetching}
          className="btn btn-secondary mt-3"
        >
          {holdings.isFetching ? "Trying again…" : "Try again"}
        </button>
      </section>
    );
  }
  return <PanelSkeleton className={className} />;
}

/**
 * For the header: "Your Chogs 3", linking to the dashboard's list, once the connected wallet holds at least one Chog.
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
      className={`chip border-accent/40 text-accent-strong transition-colors hover:border-accent hover:text-foreground ${className}`}
    >
      Your Chogs <span className="font-mono text-foreground tabular-nums">{fmtInt(count)}</span>
    </Link>
  );
}

function ConnectPrompt({ className }: { className: string }) {
  return (
    <div
      id={ANCHOR.id}
      className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-line px-5 py-4 ${ANCHOR.scroll} ${className}`}
    >
      <p className="max-w-2xl text-sm text-pretty text-muted">
        <span className="font-medium text-foreground">Hold a Chog?</span> Connect your wallet and every Chog Genesis you
        hold shows up here, ranked: its League place, its Daily Bell call and its AI.
      </p>
      {/* ml-auto keeps the button (and its right-aligned panel) on the right when wrapped. */}
      <ConnectButton className="ml-auto" />
    </div>
  );
}

function PanelSkeleton({ className }: { className: string }) {
  return (
    <section id={ANCHOR.id} role="status" aria-busy className={`${ANCHOR.scroll} ${PANEL} ${className}`}>
      <span className="sr-only">Loading your Chogs…</span>
      <div className="h-3 w-40 animate-pulse rounded bg-surface-2" />
      <div className="mt-3 h-7 w-4/5 max-w-lg animate-pulse rounded bg-surface-2" />
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {["", "hidden sm:block", "hidden lg:block"].map((visibility, i) => (
          <div key={i} className={`card h-56 animate-pulse ${visibility}`} />
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
    <section id={ANCHOR.id} aria-labelledby={headingId} className={`${ANCHOR.scroll} ${PANEL} ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">
            Your Chogs <span className="font-mono tracking-normal normal-case">· {shortAddress(holdings.address)}</span>
          </p>
          <h2 id={headingId} className="mt-2 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            {headline(chogs.length)}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-pretty text-muted">
            {plural ? "Their traits are their strategy" : "Its traits are its strategy"}, and the $CHOG market keeps score:
            in the{" "}
            <Link href="/league" className="font-medium text-accent-strong hover:underline">
              League
            </Link>{" "}
            {plural ? "each genome trades" : "its genome trades"} the real chart hour by hour.
            {asleep > 0 &&
              (plural
                ? asleep === chogs.length
                  ? " Wake one's AI and it starts trading for that Chog on 0G Compute, at live prices."
                  : ` ${asleep} of them still ${asleep === 1 ? "has its AI" : "have their AIs"} asleep.`
                : " Wake its AI and it starts trading for it on 0G Compute, at live prices.")}
          </p>
        </div>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="btn btn-ghost shrink-0 px-2.5 py-1 text-xs"
            title="Read your Chogs again (bought or sold one just now? It shows up within a minute)"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        )}
      </div>

      <Highlights holdings={holdings} best={best} />

      <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
        <div className="mt-4 text-center">
          <button type="button" onClick={() => setShowAll((all) => !all)} className="btn btn-secondary">
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
  const tiles: ReactNode[] = [];
  if (best?.league && league) {
    tiles.push(
      <Tile
        key="best"
        label={ranked.length > 1 ? "Best in the League" : "League rank"}
        sub={ranked.length > 1 ? `of ${fmtInt(league.total)} · ${titleOf(best)}` : `of ${fmtInt(league.total)} Chogs`}
      >
        #{fmtInt(best.league.rank)}
      </Tile>,
    );
  }
  if (ranked.length > 0) {
    tiles.push(
      ahead > 0 && ranked.length > 1 ? (
        <Tile key="ahead" label="Ahead of holding $CHOG" sub="League window, simulated">
          {ahead} of {fmtInt(ranked.length)}
        </Tile>
      ) : (
        <Tile key="edge" label={ranked.length > 1 ? "Best edge vs holding" : "Edge vs holding $CHOG"} sub="League window, simulated">
          {bestEdge === null ? (
            "—"
          ) : (
            <span className={bestEdge >= 0.05 ? "text-success" : undefined}>{signedPct(bestEdge)}</span>
          )}
        </Tile>
      ),
    );
  }
  tiles.push(
    <Tile
      key="awake"
      label={single ? "Its AI" : "AIs awake"}
      sub={awake > 0 ? "trading on 0G Compute" : single ? "wake it below" : "wake one below"}
    >
      {single ? (awake ? "Awake" : "Asleep") : `${awake} of ${fmtInt(chogs.length)}`}
    </Tile>,
  );
  if (bell && calls.length > 0) {
    tiles.push(
      <Tile
        key="bell"
        label={`${bell.kind === "replay" ? "Replayed Bell" : "Bell"} of ${bellDay(bell.day)}`}
        sub={bell.status === "settled" && settled.length ? `${fmtInt(points)} pts, points only` : "settled by the market in 24h"}
      >
        {calls.length === 1 ? (
          <Forecast pct={calls[0].forecastPct} />
        ) : (
          <>
            <span className="text-success">▲{up}</span> <span className="text-subtle">·</span>{" "}
            <span className="text-danger">▼{down}</span>
          </>
        )}
      </Tile>,
    );
  }
  return <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">{tiles}</dl>;
}

function Tile({ label, sub, children }: { label: string; sub: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-line bg-surface/70 px-3 py-2.5">
      {/* Labels and captions wrap rather than truncate: two tiles share a phone's width. */}
      <dt className={`${LABEL} leading-snug text-pretty`}>{label}</dt>
      <dd className="mt-auto pt-1 font-mono text-lg font-semibold tabular-nums">{children}</dd>
      <dd className="text-xs leading-snug text-pretty text-subtle">{sub}</dd>
    </div>
  );
}

/** "+9.1%", "−4.2%" (a real minus), "0.0%". */
function signedPct(pct: number): string {
  const sign = Math.abs(pct) < 0.05 ? 0 : Math.sign(pct);
  return `${sign > 0 ? "+" : sign < 0 ? "−" : ""}${Math.abs(sign ? pct : 0).toFixed(1)}%`;
}

function Forecast({ pct }: { pct: number }) {
  const sign = Math.abs(pct) < 0.05 ? 0 : Math.sign(pct);
  const tone = sign > 0 ? "text-success" : sign < 0 ? "text-danger" : "text-muted";
  return (
    <span className={`inline-flex items-center gap-0.5 font-mono font-semibold tabular-nums whitespace-nowrap ${tone}`}>
      {sign !== 0 && (
        <span aria-hidden className="text-[0.65em]">
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
  const title = titleOf(chog);
  const profile = `/chog/${tokenId}`;
  const awake = Boolean(chog.agent?.active);
  const rank = chog.league?.rank;
  const topPct = rank && total ? Math.max(1, Math.ceil((rank / total) * 100)) : null;

  return (
    <li className={`card relative flex min-w-0 flex-col p-4 ${best ? "border-accent/50" : ""}`}>
      {best && (
        <span className="absolute -top-2.5 left-4 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold tracking-wider text-background uppercase">
          Your best trader
        </span>
      )}
      <div className="flex items-start gap-3">
        <Link href={profile} tabIndex={-1} aria-hidden className="shrink-0">
          <ChogThumb image={chog.image} tokenId={tokenId} size={60} className="rounded-xl" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            {/* Both numbers, always: read as "CHOG #1462 · token 1". */}
            <h3 className="min-w-0 leading-snug font-semibold">
              <Link href={profile} className="hover:underline">
                <span className="block truncate">{title}</span>
                <span className="block font-mono text-xs font-normal text-subtle">
                  <span className="sr-only">· </span>token {tokenId}
                </span>
              </Link>
            </h3>
            {rank !== undefined && (
              <span
                className="chip shrink-0 border-accent/40 px-2 font-mono text-accent-strong"
                title={`League rank${total ? ` of ${fmtInt(total)}` : ""}, simulated on real $CHOG candles`}
              >
                #{fmtInt(rank)}
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {chog.style && <span className="chip py-0 text-[11px] capitalize">{chog.style}</span>}
            {topPct !== null && topPct <= 25 && (
              <span className="chip border-success/35 py-0 text-[11px] text-success">Top {topPct}%</span>
            )}
            {chog.house && (
              <Link href="/heist" className="chip border-warning/40 py-0 text-[11px] text-warning hover:border-warning">
                House Chog
              </Link>
            )}
            {chog.hidden && <span className="chip border-warning/40 py-0 text-[11px] text-warning">Hidden</span>}
          </div>
        </div>
      </div>
      <p className="mt-3 text-sm leading-snug text-pretty">
        <span className="font-medium">{chog.name}</span>
        {chog.archetype && <span className="text-muted"> · {chog.archetype}</span>}
      </p>

      {chog.hidden && (
        <p className="mt-3 text-xs leading-relaxed text-pretty text-muted">
          Hidden from Animr&apos;s public pages, so its League place, replays and Bell calls stay off until you show it
          again.
        </p>
      )}
      <dl className="mt-3 grid grid-cols-[3.25rem_minmax(0,1fr)] items-start gap-x-2 gap-y-2 text-sm">
        {!chog.hidden && (
          <>
            <dt className={`${LABEL} pt-0.5`}>League</dt>
            <dd className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              {chog.league ? (
                <>
                  <EdgeBadge pct={chog.league.edgePct} />
                  <span className="text-xs text-subtle">vs holding · {fmtInt(chog.league.trades)} trades</span>
                </>
              ) : (
                <span className="text-xs text-subtle">Not ranked right now</span>
              )}
            </dd>
            {bellLabel && (
              <>
                <dt className={`${LABEL} pt-0.5`}>Bell</dt>
                <dd className="min-w-0">
                  {chog.bell ? (
                    <Link href={`${profile}#bell`} className="group block" title={`${bellLabel}: its call on $CHOG over 24h`}>
                      <span className="flex flex-wrap items-center gap-x-2">
                        <Forecast pct={chog.bell.forecastPct} />
                        <span className="text-xs text-muted">{Math.round(chog.bell.conviction * 100)}% sure</span>
                        {typeof chog.bell.points === "number" && (
                          <span className="font-mono text-xs text-foreground">
                            {fmtInt(chog.bell.points)} pts{chog.bell.hit ? " ✓" : ""}
                          </span>
                        )}
                        <span className="text-[11px] text-subtle">
                          {chog.bell.source === "llm" ? "by its AI" : "by its DNA"}
                        </span>
                      </span>
                      {chog.bell.thesis && (
                        <span className="mt-0.5 line-clamp-2 text-xs text-subtle group-hover:text-muted">
                          “{chog.bell.thesis}”
                        </span>
                      )}
                    </Link>
                  ) : (
                    <span className="text-xs text-subtle">No call on this Bell</span>
                  )}
                </dd>
              </>
            )}
          </>
        )}
        <dt className={`${LABEL} pt-0.5`}>AI</dt>
        <dd className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {awake && chog.agent ? (
            <>
              <span className="inline-flex items-center gap-1.5 text-xs text-foreground">
                <span aria-hidden className="size-1.5 rounded-full bg-success" />
                Awake · {MODE_LABEL[chog.agent.mode]}
              </span>
              <PnlBadge pct={chog.agent.pnlPct} />
            </>
          ) : (
            <span className="text-xs text-muted">{chog.agent ? "Paused" : "Asleep"}</span>
          )}
        </dd>
      </dl>

      <div className="mt-auto flex flex-col gap-2 pt-4">
        {!awake && (
          <Link
            href={profile}
            className="btn w-full border-accent/45 bg-accent/15 text-accent-strong hover:border-accent hover:bg-accent/25 hover:text-foreground"
            title="Opens its page: sign one free message there and an AI on 0G Compute starts trading for it"
          >
            {chog.agent ? "Wake its AI back up" : "Wake its AI"}
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
            <Link href={`/replay/${tokenId}`} className={SMALL_BTN} aria-label={`Rewind ${chog.label}: its Time Machine`}>
              <span aria-hidden>▶</span> Rewind
            </Link>
            <Link href={`/versus?a=${tokenId}`} className={SMALL_BTN} aria-label={`Versus: ${chog.label} against a random rival`}>
              Versus
            </Link>
            <Link href={profile} className={SMALL_BTN} aria-label={`${chog.label}: its profile`}>
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
    <p className="mt-5 text-xs leading-relaxed text-pretty text-subtle">
      {league && (
        <>
          League place and edge: {league.window.label}, {league.label} (1% fee + impact), not real trades.{" "}
        </>
      )}
      Bell calls score points only.{" "}
      {ownership.stale ? (
        <span className="text-warning">
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
    <section id={ANCHOR.id} aria-labelledby={headingId} className={`${ANCHOR.scroll} ${PANEL} ${className}`}>
      <p className="eyebrow">
        Your Chogs <span className="font-mono tracking-normal normal-case">· {shortAddress(address)}</span>
      </p>
      <h2 id={headingId} className="mt-2 text-xl font-semibold tracking-tight text-balance sm:text-2xl">
        No Chog Genesis in this wallet yet
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-pretty text-muted">
        All 1,969 are already trading: their traits are their strategy, and the $CHOG market keeps score. Meet a few,
        race two of them, or ride one at today&apos;s Bell. No Chog needed.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {/* The draw happens on click (never while rendering): never a flagged or hidden Chog. */}
        <button
          type="button"
          onClick={() => router.push(`/replay/${randomChogId(undefined, hidden)}`)}
          className="btn btn-primary"
        >
          <span aria-hidden>▶</span> Rewind a random Chog
        </button>
        <Link href="/league" className="btn btn-secondary">
          Meet the League
        </Link>
        <Link href="/versus" className="btn btn-secondary">
          Race two in Versus
        </Link>
        <Link href="/bell" className="btn btn-ghost">
          Ride the Daily Bell
        </Link>
      </div>
      <p className="mt-3 text-xs text-subtle">Holding one in another wallet? Switch to it in your wallet and it shows up here.</p>
    </section>
  );
}
