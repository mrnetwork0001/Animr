import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRightIcon, BellIcon, IconTile, LeagueIcon, MaskIcon, RewindIcon } from "@/components/v2";
import { type Verb, verbs, verbsSection } from "./content";
import { Section } from "./primitives";

const VERB_ICONS: Record<Verb["key"], ReactNode> = {
  league: <LeagueIcon />,
  versus: <RewindIcon />,
  bell: <BellIcon />,
  heist: <MaskIcon />,
};

/** League, Versus, Daily Bell, Rob this Chog: what each one is, and the way in. */
export function Verbs() {
  return (
    <Section id={verbsSection.id} title={verbsSection.title} lede={verbsSection.lede}>
      <ul className="lp-verbs">
        {verbs.map((verb) => (
          <VerbCard key={verb.key} verb={verb} />
        ))}
      </ul>
    </Section>
  );
}

function VerbCard({ verb }: { verb: Verb }) {
  return (
    <li className="v2-card lp-verb lp-reveal" data-verb={verb.key}>
      <IconTile size="lg" tone={verb.key === "heist" ? "violet" : "teal"}>
        {VERB_ICONS[verb.key]}
      </IconTile>
      <p className="lp-verb-name">{verb.name}</p>
      {/* A number in the title ("Meet all 1,969 traders") counts up to it once (landing-motion.tsx). */}
      <h3 className="lp-verb-title" data-lp-count="">
        {verb.title}
      </h3>
      <p className="lp-verb-body">{verb.body}</p>
      {verb.secondary && (
        <Link href={verb.secondary.href} className="lp-sub-link">
          {verb.secondary.label}
        </Link>
      )}
      {/* Last in the card, so the four primary links line up across the row. */}
      <Link href={verb.cta.href} className="lp-go">
        {verb.cta.label}
        <ArrowRightIcon className="lp-go-arrow" />
      </Link>
    </li>
  );
}
