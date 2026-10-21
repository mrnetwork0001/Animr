"use client";

import { QueryClientContext, skipToken, useQuery } from "@tanstack/react-query";
import { type ComponentType, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { WagmiContext, useConnection } from "wagmi";
import { nextBellAt, ringOverdue } from "@/components/bell/format";
import { HOUR_MS } from "@/lib/bell/rules";
import type { BellSummaryResponse } from "@/lib/bell/types";
import { HEIST_ATTEMPT_EVENT } from "@/components/heist/api";
import type { HeistCounters } from "@/lib/heist/types";
import type { HoldingsResponse } from "@/lib/holdings";
import { NavBellIcon, NavChogIcon, NavLeagueIcon, NavMaskIcon, NavShieldIcon, NavVersusIcon } from "./icons";
import type { V2NavLink } from "./nav";

/*
 * The header nav's "HUD": a glyph per section and small live badges from real data, shared by the desktop links
 * (nav-links.tsx) and the hamburger rows (mobile-menu.tsx).
 *
 *   Daily Bell     countdown to the ride window's close while a live Bell is open, else to the next ring (15:00 UTC)
 *   Rob this Chog  today's attempts on the House Chog (GET /api/heist/counters), hidden at 0
 *   Your Chogs     how many Chogs the connected wallet holds (GET /api/holders/[address], YourChogs' cache entry)
 *
 * Nothing renders on the server or during hydration (every snapshot starts null), and the badges sit outside the
 * flow on desktop (absolutely placed corner chips), so their arrival never moves the nav. Requests start when the
 * browser is idle after hydration, refresh gently (heist every 60 s, the Bell only when its countdown runs out) and
 * every timer stops while the tab is hidden.
 */

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  "/app": NavChogIcon,
  "/league": NavLeagueIcon,
  "/versus": NavVersusIcon,
  "/bell": NavBellIcon,
  "/heist": NavMaskIcon,
  "/guard": NavShieldIcon,
};

const HEIST_REFRESH_MS = 60_000;
/** After a countdown runs out, give the once-a-day cron a moment before asking what changed. */
const BELL_SETTLE_MS = 20_000;
/** While a scheduled ring is overdue (cron jitter), ask again this often. */
const BELL_OVERDUE_RETRY_MS = 30_000;

// --- shared state ---------------------------------------------------------------------------------

/** What /api/bell/today said: the latest Bell's day and, while a live one takes rides, when they close. */
type BellPlan = { latestDay: string | null; ridesCloseAt: number | null };
type HudData = { bell: BellPlan | null; heistTries: number | null; chogs: number | null };

let data: HudData = { bell: null, heistTries: null, chogs: null };
const dataListeners = new Set<() => void>();
const SERVER_DATA: HudData = { bell: null, heistTries: null, chogs: null };

function setData(patch: Partial<HudData>) {
  const next = { ...data, ...patch };
  if ((Object.keys(patch) as (keyof HudData)[]).every((key) => Object.is(next[key], data[key]))) return;
  data = next;
  for (const listener of dataListeners) listener();
}

function subscribeData(listener: () => void) {
  dataListeners.add(listener);
  return () => {
    dataListeners.delete(listener);
  };
}

function useHudData(): HudData {
  return useSyncExternalStore(
    subscribeData,
    () => data,
    () => SERVER_DATA,
  );
}

// A one-second clock for the Bell countdown, running only while something shows it and the tab is visible.
let clockNow: number | null = null;
let clockTimer: ReturnType<typeof setInterval> | undefined;
const clockListeners = new Set<() => void>();

const visible = () => typeof document === "undefined" || document.visibilityState === "visible";

function tick() {
  clockNow = Date.now();
  onClock(clockNow);
  for (const listener of clockListeners) listener();
}

function syncClock() {
  const run = clockListeners.size > 0 && visible();
  if (run && clockTimer === undefined) {
    tick();
    clockTimer = setInterval(tick, 1000);
  } else if (!run && clockTimer !== undefined) {
    clearInterval(clockTimer);
    clockTimer = undefined;
  }
}

function subscribeClock(listener: () => void) {
  clockListeners.add(listener);
  syncClock();
  return () => {
    clockListeners.delete(listener);
    syncClock();
  };
}

function useClock(): number | null {
  return useSyncExternalStore(
    subscribeClock,
    () => clockNow,
    () => null,
  );
}

// --- fetching -------------------------------------------------------------------------------------

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

let bellLoading = false;

async function loadBell() {
  if (bellLoading) return;
  bellLoading = true;
  try {
    const body = (await getJson("/api/bell/today")) as Partial<BellSummaryResponse>;
    const day = typeof body.day === "string" ? body.day : null;
    const closes = typeof body.rideWindowClosesAt === "string" ? Date.parse(body.rideWindowClosesAt) : Number.NaN;
    // Rides are taken on live Bells only (components/bell/call-card.tsx `rideable`).
    const takingRides = body.kind === "live" && body.status === "open" && Number.isFinite(closes);
    setData({ bell: { latestDay: day, ridesCloseAt: takingRides ? closes : null } });
  } catch {
    // The ring hour is a fixed rule (lib/bell/rules.ts), so the next-ring countdown still holds without the API.
    setData({ bell: { latestDay: null, ridesCloseAt: null } });
  } finally {
    bellLoading = false;
  }
}

let heistLoadedAt = 0;
let heistTimer: ReturnType<typeof setInterval> | undefined;

function triesOf(body: Partial<HeistCounters> | null | undefined): number | null {
  return typeof body?.attemptsToday === "number" && Number.isFinite(body.attemptsToday) ? body.attemptsToday : null;
}

async function loadHeist() {
  heistLoadedAt = Date.now();
  try {
    setData({ heistTries: triesOf((await getJson("/api/heist/counters")) as Partial<HeistCounters>) });
  } catch {
    setData({ heistTries: null });
  }
}

/** A heist attempt just finished (components/heist/api.ts): its response carries the fresh counters. */
function onHeistAttempt(event: Event) {
  const tries = triesOf((event as CustomEvent<Partial<HeistCounters> | undefined>).detail);
  if (tries === null) return void loadHeist();
  heistLoadedAt = Date.now();
  setData({ heistTries: tries });
}

function syncHeistTimer() {
  const run = started && visible();
  if (run && heistTimer === undefined) {
    if (Date.now() - heistLoadedAt >= HEIST_REFRESH_MS) void loadHeist();
    heistTimer = setInterval(() => void loadHeist(), HEIST_REFRESH_MS);
  } else if (!run && heistTimer !== undefined) {
    clearInterval(heistTimer);
    heistTimer = undefined;
  }
}

/** What the Bell badge counts down to at `now`; null hides it. */
function bellTarget(plan: BellPlan | null, now: number): { at: number; rides: boolean } | null {
  if (!plan) return null;
  if (plan.ridesCloseAt !== null && now < plan.ridesCloseAt) return { at: plan.ridesCloseAt, rides: true };
  // A ring is due but hasn't landed yet: no honest countdown to show until it does.
  if (plan.latestDay && ringOverdue(plan.latestDay, now)) return null;
  return { at: nextBellAt(now), rides: false };
}

let watchedTarget: number | null = null;
let bellRetryAt = 0;

/** Re-reads the Bell when its countdown runs out (and, while a ring is overdue, every 30 s). */
function onClock(now: number) {
  const plan = data.bell;
  if (!plan) return;
  if (watchedTarget !== null && now >= watchedTarget && bellRetryAt === 0) {
    bellRetryAt = now + BELL_SETTLE_MS;
  }
  if (plan.latestDay && ringOverdue(plan.latestDay, now) && bellRetryAt === 0) {
    bellRetryAt = now + BELL_OVERDUE_RETRY_MS;
  }
  if (bellRetryAt !== 0 && now >= bellRetryAt) {
    bellRetryAt = 0;
    void loadBell();
  }
  watchedTarget = bellTarget(plan, now)?.at ?? null;
}

// The controller starts with the first badge mounted, once the browser is idle, and lives for the page.
let started = false;
let scheduled = false;

function onIdle(callback: () => void): void {
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(callback, { timeout: 2500 });
  else setTimeout(callback, 1200);
}

function startHud() {
  if (scheduled) return;
  scheduled = true;
  // Listened for from the first mount (not after idle), so an attempt made right away still updates the badge.
  window.addEventListener(HEIST_ATTEMPT_EVENT, onHeistAttempt);
  onIdle(() => {
    started = true;
    void loadBell();
    syncHeistTimer();
    document.addEventListener("visibilitychange", () => {
      syncHeistTimer();
      syncClock();
    });
  });
}

function useHudStart() {
  useEffect(startHud, []);
}

// --- badges ---------------------------------------------------------------------------------------

/**
 * "14h", "1h 39m" under 10 hours (the chip's flex gap is the space), "42:13" inside the last hour. The minutes after the hours are `extra`: the
 * narrow desktop rail (1100-1279px) drops them.
 */
function shortCountdown(ms: number): { main: string; extra?: string } {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  if (total < 3600) return { main: `${pad(Math.floor(total / 60))}:${pad(total % 60)}` };
  const hours = Math.floor(total / 3600);
  return hours >= 10 ? { main: `${hours}h` } : { main: `${hours}h`, extra: `${Math.floor((total % 3600) / 60)}m` };
}

function BellBadge() {
  useHudStart();
  const { bell } = useHudData();
  const now = useClock();
  const target = now === null ? null : bellTarget(bell, now);
  if (now === null || !target) return null;
  const left = target.at - now;
  const countdown = shortCountdown(left);
  return (
    <>
      <span
        className="v2-nav-badge"
        data-tone={target.rides ? "live" : undefined}
        data-urgent={left < HOUR_MS ? "" : undefined}
        aria-hidden="true"
      >
        {countdown.main}
        {countdown.extra && <span className="v2-nav-badge-extra">{countdown.extra}</span>}
      </span>
      {target.rides && <span className="v2-sr">, rides open</span>}
    </>
  );
}

/** A count chip: `unit` shows after the number on wide screens ("15 tries"); `spoken` is for screen readers. */
function CountBadge({ value, unit, spoken }: { value: number | null; unit?: string; spoken: string }) {
  if (value === null || value <= 0) return null;
  return (
    <>
      <span className="v2-nav-badge" aria-hidden="true">
        {value}
        {unit && <span className="v2-nav-badge-extra">{unit}</span>}
      </span>
      <span className="v2-sr">, {spoken}</span>
    </>
  );
}

function HeistBadge() {
  useHudStart();
  const { heistTries: n } = useHudData();
  const unit = n === 1 ? "try" : "tries";
  return <CountBadge value={n} unit={unit} spoken={`${n} ${unit} today`} />;
}

function ChogsBadge() {
  const { chogs: n } = useHudData();
  return <CountBadge value={n} spoken={`${n} ${n === 1 ? "Chog" : "Chogs"} held`} />;
}

function NavBadge({ href }: { href: string }) {
  if (href === "/bell") return <BellBadge />;
  if (href === "/heist") return <HeistBadge />;
  if (href === "/app") return <ChogsBadge />;
  return null;
}

/**
 * A nav item's inside: glyph, label (on desktop CSS shows the full or the short one, by width) and its live
 * badge. `row` is the hamburger panel's layout: always the full label, the badge at the row's end; `badges`
 * false skips the badges (a closed panel needn't tick).
 */
export function NavItemContent({ link, row = false, badges = true }: { link: V2NavLink; row?: boolean; badges?: boolean }) {
  const Icon = ICONS[link.href];
  return (
    <>
      {Icon && <Icon className="v2-nav-glyph" />}
      {row || link.label === link.short ? (
        <span className="v2-nav-label">{link.label}</span>
      ) : (
        <>
          <span className="v2-nav-label v2-nav-full">{link.label}</span>
          {/* CSS shows exactly one of the two, so the link's name is whichever is visible. */}
          <span className="v2-nav-label v2-nav-short">{link.short}</span>
        </>
      )}
      {badges && <NavBadge href={link.href} />}
    </>
  );
}

// --- the connected wallet's Chogs -----------------------------------------------------------------

async function fetchHoldings(address: string, signal: AbortSignal): Promise<HoldingsResponse> {
  const res = await fetch(`/api/holders/${address}`, { signal });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok || !body || typeof body !== "object" || !Array.isArray((body as Partial<HoldingsResponse>).chogs)) {
    throw new Error(`Couldn't load this wallet's Chogs (HTTP ${res.status}).`);
  }
  return body as HoldingsResponse;
}

/** True once the browser has been idle after hydration. */
function useIdleReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => onIdle(() => setReady(true)), []);
  return ready;
}

/**
 * Feeds the "Your Chogs" badge. Render it once in the header: it does nothing outside the app's providers
 * (the 404, previews), and only asks once a wallet is connected, sharing YourChogs' cache entry.
 */
export function NavWalletSource() {
  const wagmi = useContext(WagmiContext);
  const queryClient = useContext(QueryClientContext);
  if (!wagmi || !queryClient) return null;
  return <WalletChogs />;
}

function WalletChogs() {
  const connection = useConnection();
  const address = connection.status === "connected" ? connection.address : undefined;
  const ready = useIdleReady();
  const holdings = useQuery({
    // components/your-chogs.tsx `holdingsKey`: one entry per wallet, whoever asks first.
    queryKey: ["holders", (address ?? "").toLowerCase()],
    queryFn: address && ready ? ({ signal }) => fetchHoldings(address, signal) : skipToken,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  const count = address ? (holdings.data?.chogs.length ?? null) : null;
  useEffect(() => setData({ chogs: count }), [count]);
  return null;
}
