"use client";

import { useEffect, useState } from "react";
import { HEIST_TITLE } from "@/lib/heist/config";
import Link from "next/link";
import { links, safety, verbsSection } from "./content";
import { Icon } from "./icons";
import { StatusBadge } from "./primitives";
import { Rich } from "./rich";

// The House Chog's live state on the static landing page. The page is prerendered, so HOUSE_CHOG_TOKEN_ID only says
// which Chog the team picked, never that its vault is live: that is read in the browser from GET /api/heist (the same
// read /heist and its "Act as the AI" check use) once the page is idle. Until it answers "open" (its wallet is
// deployed, initialized and holds $CHOG), every House surface here says "moving in".

/** The picked House Chog, from the server: its dual label and persona name. */
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
    <div
      className={`landing-reveal flex flex-col gap-3 rounded-2xl border p-5 sm:p-6 ${
        live ? "border-line bg-surface/60" : "border-warning/25 bg-warning/5"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        {live ? (
          <StatusBadge status="live" label={copy.label} />
        ) : (
          <StatusBadge status="moving" label={copy.movingIn} />
        )}
        <span className="font-mono text-xs text-muted">{house ? copy.movedIn(house.label, house.name) : copy.label}</span>
      </div>
      <h3 className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
        <Icon name="lock" className="size-5 text-accent-strong" />
        {copy.title}
      </h3>
      <p className="text-sm leading-relaxed text-pretty text-muted">{copy.text}</p>
      {!live && (
        <p className="text-sm leading-relaxed text-pretty text-foreground">{house ? copy.pickedText : copy.movingInText}</p>
      )}
      <Link
        href={links.heist}
        className="mt-auto inline-flex items-center gap-1.5 self-start pt-1 text-sm font-semibold text-accent-strong hover:underline"
      >
        {HEIST_TITLE}
        <Icon name="arrowRight" className="size-4" strokeWidth={2} />
      </Link>
    </div>
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
    <p
      className={`mt-4 rounded-xl border px-3 py-2 text-xs leading-relaxed text-pretty ${
        live ? "border-line bg-surface-2/60 text-muted" : "border-warning/30 bg-warning/5 text-muted"
      }`}
    >
      <Rich text={note} />
    </p>
  );
}
