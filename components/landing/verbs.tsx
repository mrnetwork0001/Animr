import Link from "next/link";
import { type Verb, links, showcaseIds, verbs, verbsSection } from "./content";
import { Icon } from "./icons";
import { Section } from "./primitives";
import { Rich } from "./rich";
import { houseChog, showcaseChog } from "./showcase";

/** Meet, Rewind, Ride, Rob: what each one is, what you do in under a minute, and the way in. */
export function Verbs() {
  const house = houseChog();
  const replayChog = showcaseChog(showcaseIds.hero);
  return (
    <Section id={verbsSection.id} eyebrow={verbsSection.eyebrow} title={verbsSection.title} lede={verbsSection.lede}>
      <ol className="mt-12 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {verbs.map((verb) => {
          // Rewind's one-Chog sub-flow: the Time Machine on the hero's Chog.
          const secondary =
            verb.key === "rewind" && replayChog
              ? { label: `Time Machine: ${replayChog.name}`, href: links.replay(replayChog.tokenId) }
              : verb.secondary;
          const note =
            verb.key === "rob"
              ? house
                ? verbsSection.houseMovedIn(house.tokenId, house.name)
                : verbsSection.houseMovingIn
              : undefined;
          return <VerbCard key={verb.key} verb={verb} secondary={secondary} note={note} movingIn={verb.key === "rob" && !house} />;
        })}
      </ol>

      <div className="landing-reveal mt-6 grid gap-4 rounded-2xl border border-line bg-surface/60 p-5 sm:p-6 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center lg:gap-8">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <Icon name="trophy" className="size-4 text-accent-strong" />
            {verbsSection.score.title}
          </p>
          <p className="mt-2 rounded-xl border border-line bg-background/60 px-4 py-2.5 font-mono text-xs text-foreground sm:text-sm">
            {verbsSection.score.formula}
          </p>
        </div>
        <p className="text-sm leading-relaxed text-pretty text-muted">{verbsSection.score.body}</p>
      </div>
    </Section>
  );
}

function VerbCard({
  verb,
  secondary,
  note,
  movingIn,
}: {
  verb: Verb;
  secondary?: { label: string; href: string };
  note?: string;
  movingIn: boolean;
}) {
  return (
    <li className="landing-reveal card relative flex flex-col p-5 transition-colors hover:border-line-strong sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent-strong ring-1 ring-accent/25 ring-inset">
            <Icon name={verb.icon} className="size-5" />
          </span>
          <span className="eyebrow">{verb.verb}</span>
        </span>
        <span className="chip font-mono tabular-nums">
          <Icon name="clock" className="size-3.5" />
          <span className="sr-only">A first try takes about</span>
          {verb.time}
        </span>
      </div>
      <h3 className="mt-4 text-lg font-semibold tracking-tight">{verb.title}</h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-pretty text-muted">{verb.body}</p>
      {note && (
        <p
          className={`mt-4 rounded-xl border px-3 py-2 text-xs leading-relaxed text-pretty ${
            movingIn ? "border-warning/30 bg-warning/5 text-muted" : "border-line bg-surface-2/60 text-muted"
          }`}
        >
          <Rich text={note} />
        </p>
      )}
      {secondary && (
        <Link
          href={secondary.href}
          className="mt-3 self-start text-sm text-muted underline decoration-line-strong underline-offset-4 transition-colors hover:text-foreground"
        >
          {secondary.label}
        </Link>
      )}
      {/* Last in the card, so the four primary links line up across the row. */}
      <Link
        href={verb.cta.href}
        className="mt-5 inline-flex items-center gap-1.5 self-start rounded text-sm font-semibold text-accent-strong hover:underline"
      >
        {verb.cta.label}
        <Icon name="arrowRight" className="size-4" strokeWidth={2} />
      </Link>
    </li>
  );
}
