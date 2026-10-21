import type { Metadata } from "next";
import Link from "next/link";
import { buildLeagueIndex } from "@/components/dna/league-index";
import { TraitAlphaBoard } from "@/components/dna/trait-alpha";

export const metadata: Metadata = {
  title: "Trait Alpha",
  description:
    "Which Chog traits make the best traders? Every trait value's median edge over holding $CHOG, from all 1,969 trading genomes replayed on real $CHOG candles.",
};

export default function TraitsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 pt-12 pb-20 sm:px-6 sm:pt-16">
      <header className="mb-8">
        <p className="eyebrow">Trait Alpha index</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Which traits trade best?</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-pretty text-muted">
          A Chog&apos;s traits are its trading DNA: eyes pick the signal, auras set the trigger, hats size the trades. Here is
          how every trait value did across all 1,969 Chogs on the same real $CHOG chart, measured against just holding.{" "}
          <Link href="/league" className="font-medium whitespace-nowrap text-accent-strong hover:underline">
            See the league →
          </Link>
        </p>
      </header>
      {/* The index (static, from the frozen snapshot) lets the board pool values into families. */}
      <TraitAlphaBoard index={buildLeagueIndex()} />
    </div>
  );
}
