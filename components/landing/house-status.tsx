"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRightIcon } from "@/components/v2/icons";
import { HEIST_TITLE } from "@/lib/heist/config";
import { links, safety } from "./content";
import { StatusBadge } from "./primitives";

// The House Chog's live state on the static landing page. The page is prerendered, so HOUSE_CHOG_TOKEN_ID only says
// which Chog the team picked, never that its vault is live: that is read in the browser once the page is idle, from
// GET /api/heist (the same read /heist and its "Act as the AI" check use) and GET /api/agents/<id>. Until the heist
// answers "open" (its wallet is deployed, initialized and holds $CHOG), the landing shows no House Chog card at all;
// it says the House Chog trades only while its agent is awake in on-chain mode (trading through AnimrTradeGuard).

/** The picked House Chog, from the server: its token id, marketplace name ("CHOG #1312") and persona name. */
export type HouseProps = { tokenId: number; label: string; name: string } | null;

type HouseLive = { open: boolean; trading: boolean };
const CLOSED: HouseLive = { open: false, trading: false };

let liveRequest: Promise<HouseLive> | undefined;

async function json(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: "no-store" });
  return res.ok ? res.json() : null;
}

function loadHouseLive(tokenId: number): Promise<HouseLive> {
  liveRequest ??= Promise.all([json("/api/heist"), json(`/api/agents/${tokenId}`)])
    .then(([heist, detail]) => {
      const open = (heist as { house?: { phase?: unknown } } | null)?.house?.phase === "open";
      const agent = (detail as { agent?: { active?: unknown; mode?: unknown } | null } | null)?.agent;
      return { open, trading: open && agent?.active === true && agent.mode === "onchain" };
    })
    .catch(() => {
      // Try again on the next page view.
      liveRequest = undefined;
      return CLOSED;
    });
  return liveRequest;
}

/** The House Chog's live state; closed before the reads answer, and whenever they can't tell. */
function useHouseLive(tokenId: number | null): HouseLive {
  const [live, setLive] = useState(CLOSED);
  useEffect(() => {
    if (tokenId === null) return;
    let active = true;
    const load = () => void loadHouseLive(tokenId).then((value) => active && setLive(value));
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
  }, [tokenId]);
  return live;
}

/**
 * The Safety section's House Chog card, rendered only once its vault is open on Monad. Until then it renders nothing
 * and the guard card spans the row (landing.css `.lp-safety-cards`). Its limits live on /guard, read from the contract.
 */
export function HouseChogCard({ house }: { house: HouseProps }) {
  const live = useHouseLive(house?.tokenId ?? null);
  if (!live.open || house === null) return null;
  const copy = live.trading ? safety.house.trading : safety.house.funded;
  return (
    <article className="v2-card lp-house lp-reveal" aria-labelledby="house-title">
      <div className="lp-card-status">
        <StatusBadge status="live" label={safety.house.label} />
        <span className="lp-card-status-note">
          {house.name} · {house.label}
        </span>
      </div>
      <h3 id="house-title" className="lp-card-h3 lp-card-title">
        {copy.title}
      </h3>
      <p className="lp-card-p">{copy.text}</p>
      <Link href={links.heist} className="lp-go lp-go--end">
        {HEIST_TITLE}
        <ArrowRightIcon className="lp-go-arrow" />
      </Link>
    </article>
  );
}
