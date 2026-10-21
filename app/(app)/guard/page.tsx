import type { Metadata } from "next";
import { GuardStatus } from "@/components/guard/guard-status";
import { GuardGuarantees } from "@/components/onchain/guard-guarantees";
import { houseChogTokenId } from "@/lib/heist/config";

export const metadata: Metadata = {
  title: "Trade guard",
  description:
    "AnimrTradeGuard on Monad: the AI can trade a Chog's own wallet within its holder's limits but can never withdraw. Live roles, kill switch, the House Chog's buy-only vault and the verified source.",
};

/** AnimrTradeGuard, live: roles, kill switch, the House Chog's buy-only vault, fixed wiring and what it guarantees. */
export default function GuardPage() {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 pt-10 pb-20 sm:px-6 sm:pt-14">
      <header className="mb-8">
        <p className="eyebrow">AnimrTradeGuard · read live from Monad</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          The AI can trade. It can never withdraw.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-pretty text-muted">
          Every Chog owns an ERC-6551 wallet that only its holder controls. To let the AI trade it, the holder grants one
          contract, never the AI&apos;s key: AnimrTradeGuard. This page reads that contract straight from the chain: who
          holds which role, whether trading is paused, how the House Chog&apos;s buy-only vault is set, and what no key
          can ever change.
        </p>
      </header>
      {/* The House Chog is set by HOUSE_CHOG_TOKEN_ID; until then its card says it is moving in. */}
      <GuardStatus houseTokenId={houseChogTokenId()} />
      <GuardGuarantees className="mt-6" />
      <p className="mt-10 text-xs text-pretty text-subtle">
        Limits bound what the AI can do, not whether it profits: trading can lose value. Source: contracts/src in the
        Animr repo, Foundry-tested against live Monad state. Not affiliated with Chog.
      </p>
    </div>
  );
}
