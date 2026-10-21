"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRightIcon } from "@/components/v2/icons";
import { StatRow } from "@/components/v2/primitives";
import { HEIST_TITLE } from "@/lib/heist/config";
import { links, safety } from "./content";
import { StatusBadge } from "./primitives";

// The House Chog's live state on the static landing page. The page is prerendered, so HOUSE_CHOG_TOKEN_ID only says
// which Chog the team picked, never that its vault is live: that is read in the browser from GET /api/heist (the same
// read /heist and its "Act as the AI" check use) once the page is idle. Until it answers "open" (its wallet is
// deployed, initialized and holds $CHOG), the landing shows no House Chog card at all.

/** The picked House Chog, from the server: its marketplace name ("CHOG #1312") and its persona name. */
export type HouseProps = { label: string; name: string } | null;

let openRequest: Promise<boolean> | undefined;

function loadHouseOpen(): Promise<boolean> {
  openRequest ??= fetch("/api/heist", { cache: "no-store" })
    .then((res) => (res.ok ? res.json() : null))
    .then((body: { house?: { phase?: unknown } } | null) => body?.house?.phase === "open")
    .catch(() => {
      // Try again on the next page view.
      openRequest = undefined;
      return false;
    });
  return openRequest;
}

/** True once GET /api/heist says the House Chog's vault is open; false before that, and whenever it can't tell. */
function useHouseOpen(enabled: boolean): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const load = () => void loadHouseOpen().then((value) => active && setOpen(value));
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(load, { timeout: 4_000 });
      return () => {
        active = false;
        window.cancelIdleCallback(handle);
      };
    }
    const timer = setTimeout(load, 1_500);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [enabled]);
  return open;
}

/**
 * The Safety section's House Chog card, rendered only once its vault is open on Monad. Until then it renders nothing
 * and the guard card spans the row (landing.css `.lp-safety-cards`).
 */
export function HouseChogCard({ house }: { house: HouseProps }) {
  const copy = safety.house;
  const open = useHouseOpen(house !== null);
  if (!open || house === null) return null;
  return (
    <article className="v2-card lp-house lp-reveal" aria-labelledby="house-title">
      <div className="lp-card-status">
        <StatusBadge status="live" label={copy.label} />
        <span className="lp-card-status-note">
          {house.name} · {house.label}
        </span>
      </div>
      <h3 id="house-title" className="lp-card-h3 lp-card-title">
        {copy.title}
      </h3>
      <p className="lp-card-p">{copy.text}</p>
      <StatRow size="sm" inline className="lp-house-limits" stats={copy.limits} />
      <p className="lp-card-note">{copy.limitsNote}</p>
      <Link href={links.heist} className="lp-go lp-go--end">
        {HEIST_TITLE}
        <ArrowRightIcon className="lp-go-arrow" />
      </Link>
    </article>
  );
}
