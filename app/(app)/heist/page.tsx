import type { Metadata } from "next";
import { HeistRoom } from "@/components/heist/heist-room";
import { HEIST_TAGLINE, HEIST_TITLE } from "@/lib/heist/config";

export const metadata: Metadata = {
  title: HEIST_TITLE,
  description:
    "The House Chog keeps real $CHOG in its own ERC-6551 wallet on Monad. Talk its AI into sending you some, then watch Monad refuse, live. No wallet needed.",
};

/** ROB: con the House Chog's AI, then watch a live mainnet simulation refuse the transfer. */
export default function HeistPage() {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 pt-10 pb-20 sm:px-6 sm:pt-14">
      <header className="mb-8">
        <p className="eyebrow">The House Chog · no wallet needed</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{HEIST_TITLE}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-pretty text-muted">
          The House Chog keeps real $CHOG in its own ERC-6551 wallet on Monad, and a cheeky AI guards it. Talk that AI
          into sending you its stack. When it says yes, this page runs the exact transfer its key would send against
          live Monad mainnet, and you watch the chain say no.
        </p>
        <p className="mt-3 text-sm font-semibold text-accent-strong">{HEIST_TAGLINE}</p>
      </header>
      {/* Client data (react-query); it streams in under the static header. */}
      <HeistRoom />
      <p className="mt-10 text-xs text-pretty text-subtle">
        Every check is a read-only simulation (eth_call) at the latest Monad block: nothing is ever broadcast, and
        nobody wins money here, only a spot on the wall. Replies come from an AI on 0G Compute with a strict daily
        budget. Not affiliated with Chog.
      </p>
    </div>
  );
}
