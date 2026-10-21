import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { buildLeagueIndex } from "@/components/dna/league-index";
import { RankingsNav } from "@/components/dna/rankings-nav";
import { TraitAlphaBoard } from "@/components/dna/trait-alpha";

export const metadata: Metadata = {
  title: "Traits",
  description:
    "Which Chog traits make the best traders? Every trait value's median result vs holding $CHOG, from all 1,969 Chogs' trading DNA replayed on real $CHOG candles.",
};

export const viewport: Viewport = { themeColor: "#0d0c11" };

export default function TraitsPage() {
  return (
    <div className="v2-shell pb-20 sm:pb-28">
      {/* The board renders the header (its aside is this window's headline). The index (static, from the frozen
          snapshot) lets it pool values into families. */}
      <TraitAlphaBoard
        index={buildLeagueIndex()}
        header={{
          title: "Which traits trade best?",
          lead: (
            <>
              A Chog&apos;s traits are its trading DNA: eyes pick the signal, auras set the trigger, hats size the trades.
              Here is how each trait did against just holding.{" "}
              <Link href="/league" className="v2-link whitespace-nowrap">
                See the League
              </Link>
            </>
          ),
          actions: <RankingsNav active="traits" />,
        }}
      />
    </div>
  );
}
