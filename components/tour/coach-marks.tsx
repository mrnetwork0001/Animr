"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ChogImage } from "@/components/landing/chog-image";
import { ArrowRightIcon } from "@/components/v2/icons";
import { pillClass } from "@/components/v2/primitives";
import { COACH_REPLAY_EVENT, coachSeen, markCoachSeen, setCoachMenu } from "@/lib/coach";
import { formatAmount } from "@/lib/format";
import { type AccountState, COACH_STEPS, type CoachFacts, type CoachStep, coachLines } from "./coach-steps";
import "./coach-marks.css";

/*
 * The in-app guide: on a first visit to an app page, the House Chog walks the visitor through the header, one tab
 * at a time, with a spotlight cutout around the live element and a card hanging off it. Shows once per browser
 * (lib/coach.ts), 1.5 s after hydration, never on /tour or /docs, never for a page opened from the judge tour
 * (?tour=N) and never over Privy's modal (it hides while that is open). The header's "?" and the hamburger's
 * "Replay the guide" start it again.
 *
 * Phones and tablets (under 1100px): the tabs live in the hamburger panel, so the first stop is the hamburger
 * itself; the guide then opens the panel (COACH_MENU_EVENT, mobile-menu.tsx) and highlights its rows in turn.
 *
 * Geometry is written straight to the DOM (transforms only, from the elements' live rects: ResizeObserver, scroll,
 * resize), so moving between stops never re-renders the page; prefers-reduced-motion turns the glide off.
 */

/** Matches design-v2.css: below this the links and the wallet are in the hamburger panel. */
const COMPACT = "(max-width: 1099.98px)";
const START_DELAY_MS = 1500;
/** Privy's modal (a portal outside the shell), the same ids the hamburger's outside-click handler knows. */
const PRIVY_MODAL = "#privy-dialog, #privy-dialog-backdrop, #privy-modal-content";
/** The cutout's padding around the element. */
const PAD = 6;
/** From the cutout's edge to the card. */
const GAP = 22;
/** The card keeps this far from the viewport's edges. */
const EDGE = 16;
/** Frames to wait for a stop's element (the hamburger panel's rows appear a frame or two after it opens). */
const LOCATE_FRAMES = 90;
const GLIDE_MS = 400;

type Session = { compact: boolean; steps: CoachStep[]; index: number };
type Badge = { text: string; live: boolean };
/** What the stop's element says about itself, read when the stop opens (keyed by stop, so nothing stale shows). */
type Target = { stepId: CoachStep["id"]; found: boolean; name: string; badge: Badge | null };
type HeistLite = { open: boolean; balance: string | null; tries: number | null };

function stepsFor(compact: boolean): CoachStep[] {
  return COACH_STEPS.filter((step) => compact || !step.compactOnly);
}

function isVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/** The stop's element: the visible one among those carrying its data-coach (desktop link or hamburger row). */
function findTarget(step: CoachStep): HTMLElement | null {
  if (!step.target) return null;
  for (const el of document.querySelectorAll<HTMLElement>(`[data-coach="${step.target}"]`)) {
    if (!isVisible(el)) continue;
    for (const selector of step.inner ?? []) {
      for (const inner of el.querySelectorAll<HTMLElement>(selector)) if (isVisible(inner)) return inner;
    }
    return el;
  }
  return null;
}

function privyModalOpen(): boolean {
  for (const el of document.querySelectorAll(PRIVY_MODAL)) if (isVisible(el)) return true;
  return false;
}

/** Roughly what a screen reader calls the element: aria-label, else its visible text and sr-only notes. */
function accessibleName(el: HTMLElement): string {
  const aria = el.getAttribute("aria-label")?.trim();
  if (aria) return aria;
  const parts: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.replace(/\s+/g, " ").trim();
      if (text) parts.push(text);
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.getAttribute("aria-hidden") === "true" || !isVisible(node)) return;
    const label = node.getAttribute("aria-label")?.trim();
    if (label) {
      parts.push(label);
      return;
    }
    node.childNodes.forEach(walk);
  };
  el.childNodes.forEach(walk);
  return parts.join(" ").replace(/\s+,/g, ",").trim();
}

/** The HUD badge on a tab (nav-hud.tsx): "14h 32m", "42:13", "15", and whether it's the live-Bell chip. */
function readBadge(el: HTMLElement): Badge | null {
  const badge = el.querySelector<HTMLElement>(".v2-nav-badge");
  if (!badge || !isVisible(badge)) return null;
  const main = Array.from(badge.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent ?? "")
    .join("")
    .trim();
  if (!main) return null;
  const extra = badge.querySelector<HTMLElement>(".v2-nav-badge-extra");
  const more = extra && isVisible(extra) ? extra.textContent?.trim() : "";
  return { text: more ? `${main} ${more}` : main, live: badge.dataset.tone === "live" };
}

type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number };

/** The element's rect, grown to include its HUD badge (a corner chip that sits partly outside a desktop tab). */
function withBadge(el: HTMLElement): Box {
  const rect = el.getBoundingClientRect();
  let { left, top, right, bottom } = rect;
  const badge = el.querySelector<HTMLElement>(".v2-nav-badge");
  if (badge && isVisible(badge)) {
    const chip = badge.getBoundingClientRect();
    left = Math.min(left, chip.left);
    top = Math.min(top, chip.top);
    right = Math.max(right, chip.right);
    bottom = Math.max(bottom, chip.bottom);
  }
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function radiusOf(el: HTMLElement): number {
  const raw = Number.parseFloat(getComputedStyle(el).borderTopLeftRadius);
  return Number.isFinite(raw) ? raw : 12;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high));
}

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The heist's live state, read once per run: whether the vault is open and what's in it. */
async function loadHeist(): Promise<HeistLite | null> {
  try {
    const res = await fetch("/api/heist", { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      house?: { phase?: unknown; chogBalance?: unknown };
      counters?: { attemptsToday?: unknown };
    };
    return {
      open: body.house?.phase === "open",
      balance: typeof body.house?.chogBalance === "string" ? body.house.chogBalance : null,
      tries: typeof body.counters?.attemptsToday === "number" ? body.counters.attemptsToday : null,
    };
  } catch {
    return null;
  }
}

function autoEligible(pathname: string | null, search: URLSearchParams): boolean {
  if (!pathname) return false;
  for (const prefix of ["/tour", "/docs"]) if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return false;
  return !search.has("tour");
}

function accountState(name: string | undefined): AccountState {
  if (!name) return "login";
  if (/^account\b/i.test(name)) return "in";
  if (/connect wallet/i.test(name)) return "wallet";
  return "login";
}

function accountTitle(state: AccountState): string {
  return state === "in" ? "Your account" : state === "wallet" ? "Connect wallet" : "Log in";
}

/** A small real fact for the stop, when one is cheap to read; null otherwise. */
function factFor(step: CoachStep, target: Target | null, heist: HeistLite | null, facts: CoachFacts): string | null {
  const house = facts.narrator !== null;
  switch (step.id) {
    case "bell": {
      const badge = target?.badge;
      if (!badge) return null;
      return badge.live ? `Rides close in ${badge.text}.` : `Next ring in ${badge.text}.`;
    }
    case "chogs": {
      const held = target?.badge ? Number(target.badge.text) : Number.NaN;
      return Number.isFinite(held) && held > 0 ? `You hold ${held}.` : null;
    }
    case "heist": {
      if (!heist?.open || heist.balance === null) return null;
      const amount = `${formatAmount(heist.balance, 2)} $CHOG`;
      const tries =
        heist.tries !== null && heist.tries > 0 ? ` ${heist.tries} ${heist.tries === 1 ? "try" : "tries"} today.` : "";
      return house ? `${amount} in my wallet, for real.${tries}` : `${amount} in the House Chog's wallet, for real.${tries}`;
    }
    case "guard":
      return facts.guardShort ? `AnimrTradeGuard ${facts.guardShort}, Monad mainnet.` : null;
    default:
      return null;
  }
}

/** Mount once in the app layout. Renders nothing until the guide runs. */
export function CoachMarks({ facts }: { facts: CoachFacts }) {
  return (
    // usePathname / useSearchParams suspend while prerendering (unknown params, static pages).
    <Suspense fallback={null}>
      <Coach facts={facts} />
    </Suspense>
  );
}

function Coach({ facts }: { facts: CoachFacts }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const [session, setSession] = useState<Session | null>(null);
  const [paused, setPaused] = useState(false);
  const [target, setTarget] = useState<Target | null>(null);
  const [heist, setHeist] = useState<HeistLite | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const holeRef = useRef<SVGRectElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const stemRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const maskId = useId();
  const titleId = useId();
  const descId = useId();

  const active = session !== null;
  const step = session ? session.steps[session.index] : null;

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const start = useCallback(() => {
    if (sessionRef.current) return;
    markCoachSeen();
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setHeist(null);
    void loadHeist().then((state) => sessionRef.current && setHeist(state));
    setSession({ compact: window.matchMedia(COMPACT).matches, steps: stepsFor(window.matchMedia(COMPACT).matches), index: 0 });
  }, []);

  const end = useCallback(() => {
    const current = sessionRef.current;
    if (!current) return;
    sessionRef.current = null;
    if (current.compact) setCoachMenu(false);
    setSession(null);
    setTarget(null);
    const back = opener.current;
    opener.current = null;
    if (back?.isConnected) back.focus({ preventScroll: true });
  }, []);

  const go = useCallback((delta: number) => {
    setSession((current) => {
      if (!current) return current;
      const index = clamp(current.index + delta, 0, current.steps.length - 1);
      return index === current.index ? current : { ...current, index };
    });
  }, []);

  // First visit: 1.5 s after hydration, unless the page is the judge tour (or opened from it) or Privy's modal is up.
  useEffect(() => {
    if (!autoEligible(pathname, search) || coachSeen()) return;
    let timer: ReturnType<typeof setTimeout>;
    const attempt = () => {
      if (sessionRef.current) return;
      if (privyModalOpen()) {
        timer = setTimeout(attempt, 500);
        return;
      }
      start();
    };
    timer = setTimeout(attempt, START_DELAY_MS);
    return () => clearTimeout(timer);
  }, [pathname, search, start]);

  useEffect(() => {
    window.addEventListener(COACH_REPLAY_EVENT, start);
    return () => window.removeEventListener(COACH_REPLAY_EVENT, start);
  }, [start]);

  // Crossing the hamburger breakpoint mid-run swaps the stop list, keeping the current stop where it exists.
  useEffect(() => {
    if (!active) return;
    const query = window.matchMedia(COMPACT);
    const onChange = () =>
      setSession((current) => {
        if (!current || current.compact === query.matches) return current;
        const steps = stepsFor(query.matches);
        const index = Math.max(0, steps.findIndex((item) => item.id === current.steps[current.index].id));
        return { compact: query.matches, steps, index };
      });
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [active]);

  // Never over Privy's modal: hide while it is open, come back when it closes.
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setPaused(privyModalOpen()), 400);
    return () => {
      clearInterval(timer);
      setPaused(false);
    };
  }, [active]);

  // Phones and tablets: the panel is open for the row stops, closed for the hamburger stop and the last card.
  useEffect(() => {
    if (!session || !session.compact) return;
    const id = session.steps[session.index].id;
    setCoachMenu(id !== "menu" && id !== "done");
  }, [session]);

  useEffect(() => {
    if (!active || paused) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        end();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        go(1);
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        go(-1);
        return;
      }
      if (event.key !== "Tab") return;
      // Focus stays in the card.
      const card = cardRef.current;
      if (!card) return;
      const items = Array.from(card.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")).filter(isVisible);
      if (items.length === 0) return;
      const at = items.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey ? at <= 0 : at === -1 || at === items.length - 1) {
        event.preventDefault();
        items[event.shiftKey ? items.length - 1 : 0].focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [active, paused, end, go]);

  // Geometry: find the stop's element, then keep the cutout, ring, stem and card on its live rect.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const card = cardRef.current;
    const hole = holeRef.current;
    const ring = ringRef.current;
    const stem = stemRef.current;
    if (!step || paused || !root || !card || !hole || !ring || !stem) return;
    let el: HTMLElement | null = null;
    let locateFrame = 0;
    let applyFrame = 0;
    let located = false;
    let attempts = 0;
    let ready = root.hasAttribute("data-ready");
    let stemTimer: ReturnType<typeof setTimeout> | undefined;

    const apply = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const cw = card.offsetWidth;
      const ch = card.offsetHeight;
      let spot: { x: number; y: number; w: number; h: number; r: number } | null = null;
      if (el?.isConnected && isVisible(el)) {
        const rect = withBadge(el);
        // A full-width hamburger row, or a pill flush with the edge, leaves no room for the padding at its sides:
        // shrink it (evenly, so the ring keeps the element's shape) to keep the ring on screen.
        const pad = Math.max(2, Math.min(PAD, rect.left - 1, vw - rect.right - 1));
        const h = rect.height + 2 * pad;
        spot = { x: rect.left - pad, y: rect.top - pad, w: rect.width + 2 * pad, h, r: Math.min(radiusOf(el) + pad, h / 2) };
      }
      let x: number;
      let y: number;
      let side: "below" | "above" | "center";
      if (!spot) {
        x = Math.max(EDGE, (vw - cw) / 2);
        y = Math.max(EDGE, (vh - ch) / 2);
        side = "center";
      } else {
        const below = spot.y + spot.h + GAP;
        const above = spot.y - GAP - ch;
        side = below + ch <= vh - EDGE || above < EDGE ? "below" : "above";
        x = clamp(spot.x + spot.w / 2 - cw / 2, EDGE, vw - EDGE - cw);
        y = clamp(side === "below" ? below : above, EDGE, vh - EDGE - ch);
      }
      card.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      if (spot) {
        hole.setAttribute("width", String(spot.w));
        hole.setAttribute("height", String(spot.h));
        hole.setAttribute("rx", String(spot.r));
        hole.style.transform = `translate(${spot.x}px, ${spot.y}px)`;
        ring.style.width = `${spot.w}px`;
        ring.style.height = `${spot.h}px`;
        ring.style.borderRadius = `${spot.r}px`;
        ring.style.transform = `translate(${spot.x}px, ${spot.y}px)`;
        // The stem joins the cutout to the card at the element's centre, kept inside the card's width.
        const stemX = clamp(spot.x + spot.w / 2, x + 28, x + cw - 28);
        const top = side === "below" ? spot.y + spot.h : y + ch;
        const length = side === "below" ? y - top : spot.y - top;
        stem.style.height = `${Math.max(0, length)}px`;
        stem.style.transform = `translate(${stemX}px, ${top}px)`;
        stem.dataset.side = side;
        root.dataset.spot = "";
      } else {
        hole.setAttribute("width", "0");
        hole.setAttribute("height", "0");
        delete root.dataset.spot;
      }
      if (!ready) {
        // Commit the first position before transitions are enabled, so nothing glides in from the corner.
        void card.offsetWidth;
        root.dataset.ready = "";
        ready = true;
      }
    };
    // Until the element is found the card stays where it was (the panel may still be opening).
    const schedule = () => {
      if (!located) return;
      cancelAnimationFrame(applyFrame);
      applyFrame = requestAnimationFrame(apply);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(card);
    observer.observe(document.documentElement);
    const locate = () => {
      el = findTarget(step);
      if (!el && step.target && attempts++ < LOCATE_FRAMES) {
        locateFrame = requestAnimationFrame(locate);
        return;
      }
      located = true;
      if (el) observer.observe(el);
      if (ready && el && !reducedMotion()) {
        // The stem can't glide (its length changes): it fades back in once the card has arrived.
        stem.style.opacity = "0";
        stemTimer = setTimeout(() => {
          stem.style.opacity = "";
        }, GLIDE_MS);
      }
      setTarget(
        el
          ? { stepId: step.id, found: true, name: accessibleName(el), badge: readBadge(el) }
          : { stepId: step.id, found: false, name: "", badge: null },
      );
      apply();
    };
    locateFrame = requestAnimationFrame(locate);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    return () => {
      cancelAnimationFrame(locateFrame);
      cancelAnimationFrame(applyFrame);
      clearTimeout(stemTimer);
      stem.style.opacity = "";
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, { capture: true });
    };
  }, [step, paused]);

  // Each stop reads its title to assistive tech: focus moves to the heading inside the dialog.
  useEffect(() => {
    if (!active || paused || !target) return;
    titleRef.current?.focus({ preventScroll: true });
  }, [active, paused, target]);

  if (!session || !step) return null;

  const { steps, index } = session;
  const narrator = facts.narrator;
  const last = step.id === "done";
  const read = target?.stepId === step.id ? target : null;
  const account = step.id === "account" ? accountState(read?.name) : "login";
  const title = step.id === "account" ? accountTitle(account) : step.title;
  const body = coachLines(step.id, narrator, account);
  const fact = factFor(step, read, heist, facts);

  return (
    <div ref={rootRef} className="coach" data-coach-root="" hidden={paused || undefined}>
      <svg className="coach-veil" aria-hidden="true" focusable="false">
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
            <rect width="100%" height="100%" fill="#fff" />
            <rect ref={holeRef} className="coach-hole" width="0" height="0" fill="#000" />
          </mask>
        </defs>
        <rect className="coach-veil-fill" width="100%" height="100%" mask={`url(#${maskId})`} />
      </svg>
      <div ref={ringRef} className="coach-ring" aria-hidden="true" />
      <div ref={stemRef} className="coach-stem" aria-hidden="true" />
      <section
        ref={cardRef}
        className="coach-card v2-glass--strong"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
      >
        <div className="coach-narrator">
          {narrator ? (
            <ChogImage
              src={narrator.image.src}
              fallbackSrc={narrator.image.fallbackSrc}
              alt=""
              size={68}
              fallbackLabel=""
              className="coach-avatar"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- a tiny static mark
            <img className="coach-avatar coach-avatar--mark" src="/brand/animr-mark.png" alt="" width={34} height={34} />
          )}
          <div className="coach-who">
            <span className="coach-name">{narrator ? narrator.name : "Animr"}</span>
            <span className="coach-role">{narrator ? `House Chog · ${narrator.label}` : "The guide"}</span>
          </div>
          <button type="button" className={`${pillClass("ghost", "sm")} coach-skip`} onClick={end}>
            Skip
          </button>
        </div>

        <p className="coach-kicker">
          <span className="v2-num">{index + 1}</span> of <span className="v2-num">{steps.length}</span>
          {!last && ` · ${step.kind}`}
        </p>
        <h2 id={titleId} ref={titleRef} tabIndex={-1} className="coach-title">
          {title}
        </h2>
        <p id={descId} className="coach-body">
          {body}
          {read?.found && read.name && <span className="v2-sr"> Highlighted: {read.name}.</span>}
        </p>
        {fact && <p className="coach-fact">{fact}</p>}

        <div className="coach-foot">
          <ol className="coach-dots" aria-hidden="true">
            {steps.map((item, i) => (
              <li key={item.id} className="coach-dot" data-state={i === index ? "current" : i < index ? "done" : undefined} />
            ))}
          </ol>
          {last ? (
            <>
              <Link href="/tour" className={pillClass("glass", "sm")} onClick={end}>
                Open the tour
              </Link>
              <button type="button" className={pillClass("primary", "sm")} onClick={end}>
                Explore
              </button>
            </>
          ) : (
            <>
              <button type="button" className={pillClass("ghost", "sm")} onClick={() => go(-1)} disabled={index === 0}>
                Previous
              </button>
              <button type="button" className={pillClass("primary", "sm")} onClick={() => go(1)}>
                Next
                <ArrowRightIcon className="coach-arrow" />
              </button>
            </>
          )}
        </div>
        <p className="coach-keys" aria-hidden="true">
          <kbd>←</kbd> <kbd>→</kbd> move · <kbd>Esc</kbd> skips
        </p>
      </section>
    </div>
  );
}
