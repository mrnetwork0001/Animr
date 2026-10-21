import Link from "next/link";
import { ChogImage } from "./chog-image";
import { ctas, labels, links, minds, showcaseIds } from "./content";
import { Icon } from "./icons";
import { STYLE_HIGHLIGHT, STYLE_TEXT, Section, StyleBadge } from "./primitives";
import { Rich } from "./rich";
import { type ShowcaseChog, showcaseChog, showcaseChogs } from "./showcase";

/**
 * Trait DNA: how a Chog's on-chain traits compile into its trading genome, with real examples. Every
 * Chog here is compiled at build time from its frozen on-chain traits by the app's own engine
 * (showcase.ts), so this section can never drift from what the Chog actually trades.
 */
export function Minds() {
  const example = showcaseChog(showcaseIds.dnaExample);
  const cards = showcaseChogs(showcaseIds.cards);
  return (
    <Section id={minds.id} eyebrow={minds.eyebrow} title={minds.title} lede={minds.lede}>
      {example && <DnaStrip chog={example} />}
      <ul className="mt-6 grid gap-4 lg:grid-cols-3">
        {cards.map((chog) => (
          <PersonaCard key={chog.tokenId} chog={chog} />
        ))}
      </ul>
    </Section>
  );
}

/** One Chog's traits, the ones that set a gene highlighted, compiling into its archetype and genes. */
function DnaStrip({ chog }: { chog: ShowcaseChog }) {
  const { dna } = minds;
  return (
    <div className="landing-reveal card mt-12 grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] lg:gap-12">
      <div>
        <h3 className="text-xl font-semibold tracking-tight">{dna.title}</h3>
        <ul className="mt-4 space-y-3 text-sm leading-relaxed text-muted">
          {dna.rules.map((rule) => (
            <li key={rule} className="flex gap-3">
              <Icon name="dna" className="mt-0.5 size-4 text-accent-strong" />
              <span>
                <Rich text={rule} />
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="min-w-0">
        <p className="font-mono text-xs text-subtle">
          {labels.chog(chog.tokenId)} · {chog.name} · {dna.traitsNote}
        </p>
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {chog.traits.map((trait) => (
            <li
              key={trait.type}
              className={`rounded-lg px-2.5 py-1 text-xs ring-1 ring-inset ${
                trait.sets ? `font-semibold ${STYLE_HIGHLIGHT[chog.style]}` : "bg-surface-2 text-muted ring-line"
              }`}
            >
              <span className={trait.sets ? "opacity-80" : "text-subtle"}>{trait.type}:</span> {trait.value}
            </li>
          ))}
        </ul>
        <p className="mt-5 flex items-center gap-2 font-mono text-[11px] text-subtle">
          <Icon name="arrowDown" className="size-4" />
          {dna.arrow}
        </p>
        <div className="mt-3 flex items-start gap-3 rounded-2xl border border-line-strong bg-surface-2/70 p-3 pr-4 shadow-[0_20px_50px_-30px_rgb(131_110_249/0.8)]">
          <ChogImage
            src={chog.image.src}
            fallbackSrc={chog.image.fallbackSrc}
            alt={labels.chog(chog.tokenId)}
            size={112}
            fallbackLabel={`#${chog.tokenId}`}
            className="size-14 shrink-0 rounded-xl"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <p className="font-semibold tracking-tight">{chog.archetype}</p>
              <StyleBadge style={chog.style} />
            </div>
            <ul className="mt-2 space-y-1 text-xs text-muted">
              {chog.genes.map((gene) => (
                <li key={gene.key}>
                  <span className="text-subtle">{gene.trait.type}:</span> {gene.trait.value}{" "}
                  <span aria-hidden className="text-subtle">
                    →
                  </span>
                  <span className="sr-only">sets</span>{" "}
                  <span className={`font-medium ${STYLE_TEXT[chog.style]}`}>
                    {gene.label}: {gene.display}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 font-mono text-[11px] text-subtle">
          <span>{minds.genomeNote(chog.genomeVersion)}</span>
          <Link href={links.replay(chog.tokenId)} className="font-sans text-xs font-semibold text-accent-strong hover:underline">
            {ctas.rewindIt}
            <span className="sr-only">: {chog.name}</span> <span aria-hidden>→</span>
          </Link>
        </p>
      </div>
    </div>
  );
}

function PersonaCard({ chog }: { chog: ShowcaseChog }) {
  const stats = [
    { label: minds.statLabels.signal, value: chog.stats.signal },
    { label: minds.statLabels.trigger, value: chog.stats.trigger },
    { label: minds.statLabels.size, value: chog.stats.size },
    { label: minds.statLabels.tempo, value: chog.stats.tempo },
  ];

  return (
    // Phones and tablets: thumbnail beside the name. Desktop: a full-width portrait on top.
    <li className="landing-reveal card grid grid-cols-[5rem_minmax(0,1fr)] gap-x-4 gap-y-4 p-4 transition-colors hover:border-line-strong lg:grid-cols-1 lg:grid-rows-[auto_auto_1fr] lg:gap-y-0 lg:p-2.5">
      <ChogImage
        src={chog.image.src}
        fallbackSrc={chog.image.fallbackSrc}
        alt={`${labels.chog(chog.tokenId)}, ${chog.name}`}
        size={600}
        fallbackLabel={labels.chog(chog.tokenId)}
        className="rounded-xl lg:rounded-[0.8rem]"
      />
      <div className="self-center lg:px-3 lg:pt-4">
        <p className="font-mono text-xs text-subtle">
          {labels.chog(chog.tokenId)} · {chog.name}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold tracking-tight">{chog.archetype}</h3>
          <StyleBadge style={chog.style} />
        </div>
      </div>

      <div className="col-span-2 flex flex-1 flex-col lg:col-span-1 lg:px-3 lg:pb-3">
        <p className="flex-1 text-sm leading-relaxed text-pretty text-muted lg:mt-2">{chog.signal}</p>
        {chog.setters.length > 0 && (
          <p className="mt-3 text-xs text-subtle">
            {minds.setBy}{" "}
            <span className={`font-medium ${STYLE_TEXT[chog.style]}`}>
              {chog.setters.map((trait) => `${trait.type}: ${trait.value}`).join(" · ")}
            </span>
          </p>
        )}
        <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-line/70 text-sm sm:grid-cols-4 lg:grid-cols-2">
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col-reverse gap-0.5 bg-surface-2 px-3 py-2.5">
              <dt className="text-xs text-subtle">{stat.label}</dt>
              <dd className="font-medium text-foreground">{stat.value}</dd>
            </div>
          ))}
        </dl>
        <Link
          href={links.replay(chog.tokenId)}
          className="mt-4 inline-flex items-center gap-1.5 self-start rounded text-sm font-semibold text-accent-strong hover:underline"
        >
          <Icon name="rewind" className="size-4" />
          {ctas.rewindIt}
          <span className="sr-only">: {chog.name}</span>
          <Icon name="arrowRight" className="size-4" strokeWidth={2} />
        </Link>
      </div>
    </li>
  );
}
