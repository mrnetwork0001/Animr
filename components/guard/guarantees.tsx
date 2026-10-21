import type { ReactNode } from "react";
import { ChartIcon, FeatureCard, GlassCard, GuardIcon, SectionTitle, SparkIcon, WalletIcon } from "@/components/v2";
import { GUARD_LIMIT_CEILINGS } from "@/lib/contracts/animr-trade-guard";
import "./guard.css";

// /guard's static story (no hooks, server-rendered): the guarantees, what the AI can and can never do, and how a trade
// flows. Live facts come from guard-status.tsx; nothing here claims a reading of the chain.

const pct = (bps: number) => `${bps / 100}%`;

const CAN = ["Swap CHOG ⇄ WMON, both ways, inside this Chog's own wallet, on one pool, within the holder's limits."] as const;

const CANNOT = [
  "Withdraw or transfer tokens out of the wallet",
  "Choose the recipient, token, router or calldata",
  "Move or sell the NFT",
  "Exceed the per-trade cap, daily budget or pace the holder set",
] as const;

/** The four guarantees as hero-style cards. */
export function GuardGuarantees() {
  const { maxTradeBps, maxDailyBps, maxSlippageBps } = GUARD_LIMIT_CEILINGS;
  return (
    <section aria-labelledby="guard-guarantees" className="v2-section">
      <SectionTitle
        id="guard-guarantees"
        kicker="What it guarantees"
        title="One narrow door, and it opens inward"
        description="The AI never holds the keys to a Chog's wallet. The holder grants one contract, AnimrTradeGuard, and that contract can only make bounded swaps whose output lands back in the same wallet."
      />
      <div className="v2-grid v2-grid--2">
        <FeatureCard
          icon={<GuardIcon />}
          kicker="Trades, never withdraws"
          title="No recipient, no token, no calldata"
          body="trade() takes none of them: every swap is CHOG ⇄ WMON on one fixed pool, and the output lands back in the same Chog wallet."
        />
        <FeatureCard
          icon={<ChartIcon />}
          kicker="Bounded"
          title="The holder's limits, under hard ceilings"
          body={`Each holder sets a per-trade cap, a daily budget and a pace. The contract caps them at ${pct(maxTradeBps)} of a balance per trade, ${pct(maxDailyBps)} of the vault per day and ${pct(maxSlippageBps)} slippage. Trading runs both ways; buy-only is an optional holder switch, off by default.`}
        />
        <FeatureCard
          icon={<SparkIcon />}
          tone="violet"
          kicker="Sandwich-resistant"
          title="Every fill clears a TWAP floor"
          body="Each swap must clear a minimum output from the pool's 30-minute TWAP, so a sandwich can't drain a trade."
        />
        <FeatureCard
          icon={<WalletIcon />}
          kicker="The holder stays in charge"
          title="Off in one transaction, dormant on sale"
          body="The holder can disable the AI or revoke the guard at any time. Sell the Chog and the permission goes dormant: the buyer opts in under their own limits."
        />
      </div>

      <GlassCard className="mt-4">
        <div className="guard-lists">
          <div>
            <h3 className="v2-overline text-[var(--v2-teal)]">The AI can</h3>
            <ul className="guard-list">
              {CAN.map((item) => (
                <li key={item}>
                  <Mark ok />
                  <span className="text-[var(--v2-ink)]">{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="v2-overline text-[var(--v2-danger)]">The AI can never</h3>
            <ul className="guard-list">
              {CANNOT.map((item) => (
                <li key={item}>
                  <Mark ok={false} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="v2-note mt-5 border-t border-[var(--v2-line-soft)] pt-4">
          Limits bound what the AI can do, not whether it profits: trading can lose value.
        </p>
      </GlassCard>
    </section>
  );
}

export function Mark({ ok }: { ok: boolean }) {
  return (
    <span aria-hidden className={`guard-mark ${ok ? "" : "guard-mark--no"}`}>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
        {ok ? <path d="m3.5 8.5 3 3 6-7" strokeLinejoin="round" /> : <path d="m4.5 4.5 7 7m0-7-7 7" />}
      </svg>
    </span>
  );
}

const FLOW: { title: string; body: ReactNode }[] = [
  {
    title: "The holder grants the guard, never the AI",
    body: "One Tokenbound setPermissions([guard], [true]) from the Chog's holder lets this contract execute for the wallet. The AI's key gets nothing on the wallet itself.",
  },
  {
    title: "The holder sets the limits",
    body: "A per-trade cap, a daily budget, a minimum gap between trades and a slippage limit, all under the contract's ceilings. Buy-only is an optional extra switch.",
  },
  {
    title: "The AI decides, then calls trade()",
    body: "The Chog's AI decides on 0G Compute. Its operator key can call one trading function, trade(): which Chog wallet, buy or sell, how much, a minimum out and a deadline. Nothing else.",
  },
  {
    title: "The guard checks everything first",
    body: "The pause flag, the holder's grant and limits, the daily budget, the pace and the TWAP floor. Any miss reverts with a readable reason, such as TradeRejected(\"exceeds daily cap\").",
  },
  {
    title: "The swap lands back in the same wallet",
    body: "CHOG ⇄ WMON on the one pool fixed at deployment. Nothing can be sent anywhere else.",
  },
];

/** How a trade flows, as numbered glass steps on a hairline rail. */
export function GuardFlow() {
  return (
    <section aria-labelledby="guard-flow" className="v2-section">
      <SectionTitle id="guard-flow" kicker="How it works" title="From a decision to a swap" />
      <ol className="guard-flow">
        {FLOW.map((step, i) => (
          <li key={step.title}>
            <span aria-hidden className="guard-flow-n v2-num">
              {i + 1}
            </span>
            <div className="v2-card v2-card--tight">
              <h3 className="guard-flow-title">{step.title}</h3>
              <p className="guard-flow-body text-pretty">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
