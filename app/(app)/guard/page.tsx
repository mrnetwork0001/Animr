import type { Metadata, Viewport } from "next";
import { GuardFlow, GuardGuarantees } from "@/components/guard/guarantees";
import { GuardStatus } from "@/components/guard/guard-status";
import { Badge, GlassCard, PageHeader, StatRow } from "@/components/v2";
import { personaName, sanitizeTraits } from "@/lib/agent/persona";
import { GUARD_LIMIT_CEILINGS, animrTradeGuardAddress } from "@/lib/contracts/animr-trade-guard";
import { getChog } from "@/lib/dna/chogs";
import { houseChogTokenId } from "@/lib/heist/config";

export const metadata: Metadata = {
  title: "Guard",
  description:
    "AnimrTradeGuard on Monad: the AI can trade a Chog's own wallet within its holder's limits but can never withdraw. Live roles, kill switch, the House Chog's vault and the verified source.",
};

export const viewport: Viewport = {
  themeColor: "#0d0c11",
};


/** "Laser Pounce · CHOG #891": the persona name, then the marketplace name (never the token id). */
function houseName(tokenId: number): string | null {
  const chog = getChog(tokenId);
  if (!chog) return null;
  return [personaName(String(tokenId), sanitizeTraits(chog.traits)), chog.name].filter(Boolean).join(" · ");
}

/** AnimrTradeGuard, live: what it guarantees, roles and kill switch, the House Chog's vault, how it works, fixed wiring. */
export default function GuardPage() {
  const house = houseChogTokenId();
  return (
    <div className="v2-shell v2-shell--narrow pb-20">
      <PageHeader
        title="The AI can trade. It can never withdraw."
        lead="Every Chog owns an ERC-6551 wallet only its holder controls. To let the AI trade it, the holder grants one contract, AnimrTradeGuard, never the AI's key. This page reads that contract live from Monad."
      />
      <GlassCard className="guard-strip mt-8">
        <StatRow
          size="sm"
          inline
          stats={[
            { key: "tests", label: "fork tests failed", value: "0/37", spoken: "None of 37" },
            { key: "trade", label: "Hard cap per trade", value: `${GUARD_LIMIT_CEILINGS.maxTradeBps / 100}%` },
            { key: "out", label: "Withdrawal functions", value: "0", spoken: "none" },
          ]}
        />
        <div className="guard-strip-end">
          {animrTradeGuardAddress ? <Badge tone="success">Deployed on Monad</Badge> : <Badge tone="warning">Launching</Badge>}
        </div>
      </GlassCard>
      <GuardGuarantees />
      {/* The House Chog is set by HOUSE_CHOG_TOKEN_ID; until then its card says it is moving in. */}
      <GuardStatus houseTokenId={house} houseLabel={house === null ? null : houseName(house)} />
      <GuardFlow />
      <p className="v2-note mt-12 text-pretty">
        Tested against forked Monad mainnet: 37 AnimrTradeGuard fork tests, 36 pass, 1 skipped by design (0 failures),
        Oct 21 2026. The skipped test needs an ungrown oracle; the live pool&apos;s is already grown.
      </p>
    </div>
  );
}
