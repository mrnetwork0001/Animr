import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRightIcon, BellIcon, ChartIcon, IconTile, LeagueIcon, MaskIcon, RewindIcon } from "@/components/v2";
import { type Verb, links, showcaseIds, verbs, verbsSection } from "./content";
import { RobNote } from "./house-status";
import { Icon } from "./icons";
import { Section } from "./primitives";
import { houseChog, showcaseChog } from "./showcase";

const VERB_ICONS: Record<Verb["key"], ReactNode> = {
  meet: <LeagueIcon />,
  rewind: <RewindIcon />,
  ride: <BellIcon />,
  rob: <MaskIcon />,
};

/** Meet, Rewind, Ride, Rob: what each one is, what you do in under a minute, and the way in. */
export function Verbs({ index }: { index?: number }) {
  const house = houseChog();
  const replayChog = showcaseChog(showcaseIds.hero);
  return (
    <Section
      id={verbsSection.id}
      index={index}
      kicker={verbsSection.eyebrow}
      title={verbsSection.title}
      lede={verbsSection.lede}
    >
      <ol className="lp-verbs">
        {verbs.map((verb, i) => {
          // Rewind's one-Chog sub-flow: the Time Machine on the hero's Chog.
          const secondary =
            verb.key === "rewind" && replayChog
              ? { label: `Time Machine: ${replayChog.name}`, href: links.replay(replayChog.tokenId) }
              : verb.secondary;
          // Rob's note says "moving in" until the House Chog's vault is live (read in the browser: house-status.tsx).
          const note =
            verb.key === "rob" ? <RobNote house={house && { label: house.label, name: house.archetype }} /> : undefined;
          return <VerbCard key={verb.key} verb={verb} step={i + 1} secondary={secondary} note={note} />;
        })}
      </ol>

      <div className="v2-card lp-score lp-reveal">
        <div className="lp-score-head">
          <IconTile size="sm">
            <ChartIcon />
          </IconTile>
          <p className="v2-overline">{verbsSection.score.title}</p>
        </div>
        <p className="lp-formula">{verbsSection.score.formula}</p>
        <p className="lp-score-body">{verbsSection.score.body}</p>
      </div>
    </Section>
  );
}

function VerbCard({
  verb,
  step,
  secondary,
  note,
}: {
  verb: Verb;
  step: number;
  secondary?: { label: string; href: string };
  note?: ReactNode;
}) {
  return (
    <li className="v2-card lp-verb lp-reveal">
      <div className="lp-verb-top">
        <IconTile size="lg" tone={verb.key === "rob" ? "violet" : "teal"}>
          {VERB_ICONS[verb.key]}
        </IconTile>
        <span className="lp-verb-step" aria-hidden="true">
          {String(step).padStart(2, "0")}
        </span>
      </div>
      <div className="lp-verb-meta">
        <span className="v2-kicker">{verb.verb}</span>
        <span className="v2-chip lp-time">
          <Icon name="clock" className="lp-time-icon" />
          <span className="v2-sr">A first try takes about</span>
          {verb.time}
        </span>
      </div>
      <h3 className="lp-verb-title">{verb.title}</h3>
      <p className="lp-verb-body">{verb.body}</p>
      {note}
      {secondary && (
        <Link href={secondary.href} className="lp-sub-link">
          {secondary.label}
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
