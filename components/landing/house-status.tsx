"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRightIcon, MaskIcon } from "@/components/v2/icons";
import { IconTile, StatRow } from "@/components/v2/primitives";
import { HEIST_TITLE } from "@/lib/heist/config";
import { links, safety, verbsSection } from "./content";
import { StatusBadge } from "./primitives";
import { Rich } from "./rich";

// The House Chog's live state on the static landing page. The page is prerendered, so HOUSE_CHOG_TOKEN_ID only says
// which Chog the team picked, never that its vault is live: that is read in the browser from GET /api/heist (the same
// read /heist and its "Act as the AI" check use) once the page is idle. Until it answers "open" (its wallet is
// deployed, initialized and holds $CHOG), every House surface here says "moving in".

/** The picked House Chog, from the server: its dual label and the name to show (its genome's archetype). */
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

/** The Safety section's House Chog card: "moving in" until the vault is live on Monad. */
export function HouseChogCard({ house }: { house: HouseProps }) {
  const copy = safety.house;
  const open = useHouseOpen(house !== null);
  const live = open && house !== null;
  return (
    <article className="v2-card lp-house lp-reveal" aria-labelledby="house-title">
      <div className="lp-card-status">
        {live ? <StatusBadge status="live" label={copy.label} /> : <StatusBadge status="moving" label={copy.movingIn} />}
        <span className="lp-card-status-note">{house ? house.label : copy.kicker}</span>
      </div>
      <div className="lp-card-titlerow">
        <IconTile size="lg" tone="violet">
          <MaskIcon />
        </IconTile>
        <div>
          <p className="v2-kicker">{house ? `${copy.kicker} · ${house.name}` : copy.kicker}</p>
          <h3 id="house-title" className="lp-card-h3">
            {copy.title}
          </h3>
        </div>
      </div>
      <p className="lp-card-p">{copy.text}</p>
      <StatRow
        size="sm"
        inline
        className="lp-house-limits"
        stats={copy.limits.map((limit) => ({ key: limit.key, value: limit.value, label: limit.label }))}
      />
      <p className="lp-card-note">{copy.limitsNote}</p>
      {!live && <p className="lp-card-p lp-card-p--ink">{house ? copy.pickedText : copy.movingInText}</p>}
      <Link href={links.heist} className="lp-go lp-go--end">
        {HEIST_TITLE}
        <ArrowRightIcon className="lp-go-arrow" />
      </Link>
    </article>
  );
}

/** The Rob card's note: who the House Chog is, and "moving in" until its vault is live on Monad. */
export function RobNote({ house }: { house: HouseProps }) {
  const open = useHouseOpen(house !== null);
  const live = open && house !== null;
  const note = !house
    ? verbsSection.houseMovingIn
    : live
      ? verbsSection.houseMovedIn(house.label, house.name)
      : verbsSection.houseMovingInPicked(house.label, house.name);
  return (
    <p className={`lp-note ${live ? "" : "lp-note--warning"}`}>
      <Rich text={note} />
    </p>
  );
}
