import { maxUint256 } from "viem";
import { RandomChog } from "@/components/landing/random-chog-button";
import { BellIcon, FeatureCard, LeagueIcon, PillLink, RewindIcon, pillClass } from "@/components/v2";
import { appConfig } from "@/lib/config";

/**
 * The 404 body, shared by app/not-found.tsx (unmatched URLs and the proxy's rewrite for invalid Chog IDs, framed by
 * its own AppShell) and app/(app)/not-found.tsx (notFound() inside the app), so the two can't drift. A big faint
 * "404" over the grid, one h1, the ways back (the Chog lookup, a random Chog) and three shortcuts. Server
 * markup only: the root 404 ships with every page, so nothing here may pull in wallet code.
 */
export function NotFoundContent() {
  const { min, max } = appConfig.tokenIdRange;
  return (
    <div className="v2-shell v2-shell--narrow">
      <div className="flex flex-col items-center pt-[clamp(40px,7vw,96px)] text-center">
        <p aria-hidden className="v2-num m-0 text-[clamp(88px,12vw,120px)] leading-none tracking-[-0.04em] text-[var(--v2-faint)]">
          404
        </p>
        <h1 className="v2-h1 v2-h1--fade mt-6">This page isn&apos;t on the chart</h1>
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
          kicker="League"
          title="1,969 traders, ranked"
          body="Every Chog's traits compile into trading DNA, ranked against just holding $CHOG."
        />
        <FeatureCard
          href="/versus"
          icon={<RewindIcon />}
          kicker="Versus"
          title="Race two Chogs on the real chart"
          body="Same hidden 48 hours of real $CHOG. Pick the winner, then see the dates."
        />
        <FeatureCard
          href="/bell"
          icon={<BellIcon />}
          kicker="Daily Bell"
          title="Every Chog calls the next 24 hours"
          body="Ride the one you trust. The market settles it a day later. Points only."
        />
      </nav>
    </div>
  );
}
