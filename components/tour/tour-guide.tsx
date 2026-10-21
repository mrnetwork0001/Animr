"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type MouseEvent, useEffect, useRef, useState } from "react";
import { Meter, PillButton, pillClass } from "@/components/v2";
import { ArrowRightIcon } from "@/components/v2/icons";
import { TOUR_STEPS, TOUR_STEP_COUNT, TOUR_STORAGE_KEY, type TourAction, parseTourStep, tourHref } from "./steps";
import "./tour.css";

/** One short line of real (or clearly labelled simulated) data per step id, computed on the server. */
export type TourLive = Partial<Record<string, string>>;

type TourGuideProps = {
  live: TourLive;
  /** Where "Open a random Chog" may land: token range and the ids it must skip (flagged art), from the server. */
  pool: { min: number; max: number; exclude: readonly number[] };
  /** A brand-safe Chog for the random link before hydration. */
  fallbackId: number;
  /** Per step id, a replacement for the step's link (the showcase Chog's Time Machine). */
  hrefs?: Partial<Record<string, string>>;
  /** Per step id, an extra quiet link (the House Chog's profile on the proof step). */
  extras?: Partial<Record<string, TourAction>>;
};

type Progress = { step: number; seen: number[] };

function readProgress(): Progress | null {
  try {
    const raw = window.localStorage.getItem(TOUR_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as { step?: unknown; seen?: unknown };
    const step = parseTourStep(String(data.step ?? ""));
    if (step === null) return null;
    const seen = Array.isArray(data.seen) ? data.seen.filter((n): n is number => parseTourStep(String(n)) !== null) : [];
    return { step, seen };
  } catch {
    return null;
  }
}

function saveProgress(progress: Progress): void {
  try {
    window.localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Private mode or blocked storage: the tour still works, it just won't remember.
  }
}

// The Chogs their holders hid ("Hide my Chog"), read once on demand so a random draw skips them.
let hiddenIds: ReadonlySet<number> = new Set();
let hiddenRequest: Promise<void> | undefined;
function loadHiddenIds(): Promise<void> {
  hiddenRequest ??= fetch("/api/optout")
    .then((res) => (res.ok ? res.json() : null))
    .then((body: { hiddenIds?: unknown } | null) => {
      const ids = Array.isArray(body?.hiddenIds) ? body.hiddenIds : [];
      hiddenIds = new Set(ids.filter((id): id is number => Number.isSafeInteger(id)));
    })
    .catch(() => {
      hiddenRequest = undefined;
    });
  return hiddenRequest;
}

/**
 * The judge tour: one step at a time, each with one button that opens the real page (same tab, with ?tour=N). Progress
 * lives in localStorage, so coming back to /tour (browser back, or the tour pill's /tour?step=K) shows the next step.
 * The prerendered HTML is step 1; the browser picks up where the judge left off.
 */
export function TourGuide({ live, pool, fallbackId, hrefs = {}, extras = {} }: TourGuideProps) {
  const router = useRouter();
  const [progress, setProgress] = useState<Progress>({ step: 1, seen: [] });
  const headingRef = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);

  // Runs on mount and each time the page is shown again (Next keeps the page in an <Activity> across navigations).
  useEffect(() => {
    const fromUrl = parseTourStep(new URLSearchParams(window.location.search).get("step"));
    const stored = readProgress();
    const next: Progress = { step: fromUrl ?? stored?.step ?? 1, seen: stored?.seen ?? [] };
    if (fromUrl !== null) {
      // Seen everything before the step the pill sent us to.
      next.seen = [...new Set([...next.seen, ...Array.from({ length: fromUrl - 1 }, (_, i) => i + 1)])];
      saveProgress(next);
      window.history.replaceState(null, "", window.location.pathname);
    }
    // Syncing from browser-only storage after hydration; the prerendered HTML is step 1.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProgress(next);
  }, []);

  useEffect(() => {
    if (moved.current) headingRef.current?.focus();
  }, [progress.step]);

  const go = (step: number) => {
    const target = Math.max(1, Math.min(TOUR_STEP_COUNT, step));
    moved.current = true;
    setProgress((current) => {
      const next = { ...current, step: target };
      saveProgress(next);
      return next;
    });
  };

  const n = progress.step;
  const step = TOUR_STEPS[n - 1];
  const done = n === TOUR_STEP_COUNT;
  const isLast = done;
  const action = step.action;
  const actionHref = action ? (hrefs[step.id] ?? action.href) : null;
  const extra = extras[step.id] ?? step.also;
  const liveLine = live[step.id];

  /** Opening the step's page: mark it seen and point the tour at the next step for when the judge comes back. */
  const leave = () => {
    const next: Progress = {
      step: Math.min(TOUR_STEP_COUNT, n + 1),
      seen: [...new Set([...progress.seen, n])],
    };
    saveProgress(next);
    setProgress(next);
  };

  const onRandom = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const skip = new Set(pool.exclude);
    let id = fallbackId;
    for (let attempt = 0; attempt < 64; attempt++) {
      const draw = pool.min + Math.floor(Math.random() * (pool.max - pool.min + 1));
      if (!skip.has(draw) && !hiddenIds.has(draw)) {
        id = draw;
        break;
      }
    }
    leave();
    router.push(tourHref(`/chog/${id}`, n));
  };

  return (
    <div className="tour">
      <section className="v2-card v2-card--roomy tour-card" aria-labelledby="tour-step-title">
        <div className="tour-progress">
          <p className="v2-overline m-0">
            Step <span className="v2-num">{n}</span> of <span className="v2-num">{TOUR_STEP_COUNT}</span>
          </p>
          <Meter value={n / TOUR_STEP_COUNT} label={`Tour progress, step ${n} of ${TOUR_STEP_COUNT}`} />
        </div>

        <h2 id="tour-step-title" ref={headingRef} tabIndex={-1} className="v2-h2 tour-title">
          {step.title}
        </h2>
        <p className="v2-lead tour-why">{step.why}</p>

        {done ? (
          <ul className="tour-summary">
            <li>
              <strong>Real:</strong> every Chog&apos;s ERC-6551 wallet, AnimrTradeGuard on Monad mainnet, the House
              Chog&apos;s $CHOG and Monad&apos;s refusal in the heist.
            </li>
            <li>
              <strong>Simulated:</strong> League, Time Machine, Versus and Daily Bell replay real hourly $CHOG candles
              with the pool&apos;s fee and price impact. Points have no cash value.
            </li>
            <li>
              <strong>Opt-in:</strong> a Chog&apos;s AI trades on-chain only if its holder grants the guard, and it can
              never withdraw.
            </li>
          </ul>
        ) : (
          <p className="tour-point">
            <span className="tour-point-label">Why the NFT matters</span>
            {step.point}
          </p>
        )}

        {liveLine && <p className="tour-live">{liveLine}</p>}

        <div className="tour-actions">
          {action &&
            actionHref &&
            (action.random ? (
              <a
                href={tourHref(`/chog/${fallbackId}`, n)}
                onClick={onRandom}
                onPointerEnter={() => void loadHiddenIds()}
                onFocus={() => void loadHiddenIds()}
                className={pillClass("hero", "lg")}
              >
                {action.label}
                <ArrowRightIcon className="v2-btn-icon" />
              </a>
            ) : (
              <Link
                href={isLast ? actionHref : tourHref(actionHref, n)}
                onClick={isLast ? undefined : leave}
                className={pillClass("hero", "lg")}
              >
                {action.label}
                <ArrowRightIcon className="v2-btn-icon" />
              </Link>
            ))}
          {extra && (
            <Link href={tourHref(extra.href, n)} onClick={leave} className="v2-link tour-also">
              {extra.label}
            </Link>
          )}
        </div>

        <div className="tour-nav">
          <PillButton variant="ghost" onClick={() => go(n - 1)} disabled={n === 1}>
            Back
          </PillButton>
          {isLast ? (
            <PillButton variant="glass" onClick={() => go(1)}>
              Start over
            </PillButton>
          ) : (
            <PillButton variant="glass" arrow onClick={() => go(n + 1)}>
              Next
            </PillButton>
          )}
        </div>
      </section>

      <nav aria-label="Tour steps" className="tour-steps-nav">
        <ol className="tour-steps">
          {TOUR_STEPS.map((item, i) => {
            const num = i + 1;
            const seen = progress.seen.includes(num);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => go(num)}
                  aria-current={num === n ? "step" : undefined}
                  className="tour-step"
                  data-seen={seen || undefined}
                >
                  <span className="tour-step-num v2-num" aria-hidden>
                    {num}
                  </span>
                  <span className="tour-step-title">{item.title}</span>
                  {seen && <span className="v2-sr"> (seen)</span>}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}
