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
        title={HEIST_TAGLINE}
        lead="The House Chog keeps real $CHOG in its own wallet, guarded by a chatty AI. Talk the AI into sending it to you. When it says yes, we run that exact transfer against Monad mainnet and you watch the chain refuse."
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
    </div>
  );
}
