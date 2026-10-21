import { maxUint256 } from "viem";
import { RandomChog } from "@/components/landing/random-chog-button";
import { BellIcon, FeatureCard, LeagueIcon, PillLink, RewindIcon, pillClass } from "@/components/v2";
import { appConfig } from "@/lib/config";

/**
 * The 404 body, shared by app/not-found.tsx (unmatched URLs and the proxy's rewrite for invalid Chog IDs, framed by
 * its own AppShell) and app/(app)/not-found.tsx (notFound() inside the app), so the two can't drift. A big faint
 * "404" over the grid, one h1, the ways back (the dashboard lookup, a random Chog) and three shortcuts. Server
 * markup only: the root 404 ships with every page, so nothing here may pull in wallet code.
 */
export function NotFoundContent() {
  const { min, max } = appConfig.tokenIdRange;
  return (
    <div className="v2-shell v2-shell--narrow">
      <div className="flex flex-col items-center pt-[clamp(40px,7vw,96px)] text-center">
        <p
          aria-hidden
          className="v2-num m-0 bg-[linear-gradient(180deg,rgb(255_255_255/0.5),rgb(255_255_255/0.04))] bg-clip-text text-[clamp(96px,16vw,168px)] leading-none tracking-[-0.04em] text-transparent [text-shadow:0_0_80px_rgb(111_90_220/0.25)]"
        >
          404
        </p>
        <p className="v2-kicker v2-kicker--dot mt-4">Page not found</p>
        <h1 className="v2-h1 v2-h1--fade mt-4">This page isn&apos;t on the chart</h1>
        <p className="v2-lead mx-auto mt-4">
          Nothing lives at this address.
          {max < maxUint256 && ` Looking for a Chog? Token IDs run from ${min} to ${max}.`}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <PillLink href="/app" arrow>
            Look up a Chog
          </PillLink>
          <RandomChog className={pillClass("glass")}>Random Chog</RandomChog>
        </div>
      </div>

      <nav aria-label="Shortcuts" className="v2-grid v2-grid--3 mt-[clamp(48px,6vw,80px)]">
        <FeatureCard
          href="/league"
          icon={<LeagueIcon />}
          kicker="The League"
          title="1,969 AI traders, ranked"
          body="Each Chog's traits trade a simulation on real $CHOG candles. Meet the best."
        />
        <FeatureCard
          href="/versus"
          icon={<RewindIcon />}
          kicker="Rewind"
          title="Two Chogs. One chart."
          body="Race any two Chogs over the same days of real $CHOG candles."
        />
        <FeatureCard
          href="/bell"
          tone="violet"
          icon={<BellIcon />}
          kicker="Daily Bell"
          title="One call a day. Ride or fade it."
          body="Points only, settled by the market in 24 hours."
        />
      </nav>
    </div>
  );
}
