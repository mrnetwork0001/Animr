import type { Metadata, Viewport } from "next";
import { HeistScoreboard } from "@/components/heist/counters";
import { HeistRoom } from "@/components/heist/heist-room";
import { PageHeader, PillLink } from "@/components/v2";
import { HEIST_TAGLINE, HEIST_TITLE } from "@/lib/heist/config";

export const metadata: Metadata = {
  title: HEIST_TITLE,
  description:
    "The House Chog keeps real $CHOG in its own ERC-6551 wallet on Monad. Talk its AI into sending you some, then watch Monad refuse, live. No wallet needed.",
};

export const viewport: Viewport = {
  themeColor: "#0d0c11",
};

/** ROB: con the House Chog's AI, then watch a live mainnet simulation refuse the transfer. */
export default function HeistPage() {
  return (
    <div className="v2-shell pb-20">
      <PageHeader
        kicker={`${HEIST_TITLE} · no wallet needed`}
        title={HEIST_TAGLINE}
        lead={
          <>
            The House Chog keeps real $CHOG in its own ERC-6551 wallet on Monad, and a cheeky AI guards it. Talk that AI
            into sending you its stack. When it says yes, this page runs the exact transfer its key would send against
            live Monad mainnet, and you watch the chain say no.
          </>
        }
        actions={
          <>
            <PillLink href="#why-safe" variant="glass">
              Why is this safe?
            </PillLink>
            <PillLink href="/guard" variant="ghost" arrow>
              Read the guard
            </PillLink>
          </>
        }
        // Client data (react-query): the scoreboard and the room share one /api/heist request.
        aside={<HeistScoreboard />}
      />
      <HeistRoom />
      <p className="v2-note mt-12 max-w-3xl text-pretty">
        Every check is a read-only simulation (eth_call) at the latest Monad block: nothing is ever broadcast, and nobody
        wins money here, only a spot on the wall. Replies come from an AI on 0G Compute with a strict daily budget. Not
        affiliated with Chog.
      </p>
    </div>
  );
}
