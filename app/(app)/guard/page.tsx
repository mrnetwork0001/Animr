import type { Metadata, Viewport } from "next";
import { GuardFlow, GuardGuarantees } from "@/components/guard/guarantees";
import { GuardStatus } from "@/components/guard/guard-status";
import { Badge, GlassCard, GuardIcon, IconTile, PageHeader, StatRow } from "@/components/v2";
import { chogLabel } from "@/lib/chog-id";
import { GUARD_LIMIT_CEILINGS, animrTradeGuardAddress } from "@/lib/contracts/animr-trade-guard";
import { getChog } from "@/lib/dna/chogs";
import { houseChogTokenId } from "@/lib/heist/config";

export const metadata: Metadata = {
  title: "Trade guard",
  description:
    "AnimrTradeGuard on Monad: the AI can trade a Chog's own wallet within its holder's limits but can never withdraw. Live roles, kill switch, the House Chog's vault and the verified source.",
};

export const viewport: Viewport = {
  themeColor: "#0d0c11",
};

/** AnimrTradeGuard, live: what it guarantees, roles and kill switch, the House Chog's vault, how it works, fixed wiring. */
export default function GuardPage() {
  const house = houseChogTokenId();
  return (
    <div className="v2-shell v2-shell--narrow pb-20">
      <PageHeader
        kicker="AnimrTradeGuard · read live from Monad"
        title="The AI can trade. It can never withdraw."
        lead={
          <>
            Every Chog owns an ERC-6551 wallet that only its holder controls. To let the AI trade it, the holder grants one
            contract, never the AI&apos;s key: AnimrTradeGuard. This page reads that contract straight from the chain: who
            holds which role, whether trading is paused, how the House Chog&apos;s vault is set, and what no key can ever
            change.
          </>
        }
      />
      <GlassCard className="guard-strip mt-8">
        <IconTile size="lg">
          <GuardIcon />
        </IconTile>
        <StatRow
          size="sm"
          inline
          stats={[
            { key: "tests", label: "Fork tests pass", value: "37/37", spoken: "37 of 37" },
            { key: "trade", label: "Max per trade", value: `${GUARD_LIMIT_CEILINGS.maxTradeBps / 100}%` },
            { key: "out", label: "Ways out", value: "0", spoken: "none" },
          ]}
        />
        <div className="guard-strip-end">
          {animrTradeGuardAddress ? (
            <Badge tone="success" dot>
              Deployed on Monad
            </Badge>
          ) : (
            <Badge tone="warning" dot>
              Launching
            </Badge>
          )}
          <p className="v2-note">Foundry tests run against live Monad mainnet state.</p>
        </div>
      </GlassCard>
      <GuardGuarantees />
      {/* The House Chog is set by HOUSE_CHOG_TOKEN_ID; until then its card says it is moving in. */}
      <GuardStatus houseTokenId={house} houseLabel={house === null ? null : chogLabel(house, { metadataName: getChog(house)?.name })} />
      <GuardFlow />
      <p className="v2-note mt-12 text-pretty">
        Limits bound what the AI can do, not whether it profits: trading can lose value. Source: contracts/src in the
        Animr repo, Foundry-tested against live Monad state. Not affiliated with Chog.
      </p>
    </div>
  );
}
