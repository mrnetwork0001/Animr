import Link from "next/link";
import { ArrowRightIcon, RewindIcon } from "@/components/v2";
import { ChogImage } from "./chog-image";
import { ctas, links, minds, showcaseIds, styles as styleCopy } from "./content";
import { STYLE_TEXT, Section, StyleBadge } from "./primitives";
import { Rich } from "./rich";
import { type ShowcaseChog, showcaseChog, showcaseChogs } from "./showcase";

/**
 * Trading DNA: how a Chog's on-chain traits compile into its genome, with real examples. Every
 * Chog here is compiled at build time from its frozen on-chain traits by the app's own engine
 * (showcase.ts), so this section can never drift from what the Chog actually trades.
 */
export function Minds() {
  const example = showcaseChog(showcaseIds.dnaExample);
  const cards = showcaseChogs(showcaseIds.cards);
  return (
    <Section id={minds.id} title={minds.title} lede={minds.lede}>
      {example && <DnaStrip chog={example} />}
      <ul className="lp-grid-3 lp-personas">
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
    <div className="v2-card v2-card--roomy lp-dna lp-reveal">
      <div className="lp-dna-rules">
        <h3 className="lp-h3-lg">{dna.title}</h3>
        <ul className="lp-rules">
          {dna.rules.map((rule) => (
            <li key={rule}>
              <Rich text={rule} />
            </li>
          ))}
        </ul>
      </div>

      <div className="lp-dna-compile">
        <p className="lp-mono-label">
          {chog.name} · {chog.label} <span className="lp-faint">· {dna.traitsNote}</span>
        </p>
        <ul className="lp-traits">
          {chog.traits.map((trait) => (
            <li key={trait.type} className={`v2-chip ${trait.sets ? "is-active" : ""}`}>
              <span className="lp-trait-type">{trait.type}</span> {trait.value}
            </li>
          ))}
        </ul>
        <p className="lp-compiles">
          <span aria-hidden="true" className="lp-compiles-line" />
          {dna.arrow}
          <span aria-hidden="true" className="lp-compiles-line" />
        </p>
        <div className="lp-genome">
          <ChogImage
            src={chog.image.src}
            fallbackSrc={chog.image.fallbackSrc}
            alt={chog.label}
            size={160}
            fallbackLabel={`#${chog.tokenId}`}
            className="lp-avatar lp-avatar--lg"
          />
          <div className="lp-min0 lp-grow">
            <div className="lp-genome-head">
              <p className="lp-archetype">{chog.archetype}</p>
              <StyleBadge style={chog.style} />
            </div>
            <ul className="lp-genes">
              {chog.genes.map((gene) => (
                <li key={gene.key}>
                  <span className="lp-gene-trait">
                    {gene.trait.type}: {gene.trait.value}
                  </span>
                  <span aria-hidden="true" className="lp-gene-arrow">
                    →
                  </span>
                  <span className="v2-sr">sets</span>{" "}
                  <span className={`lp-gene-value ${STYLE_TEXT[chog.style]}`}>
                    {gene.label}: {gene.display}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="lp-dna-foot">
          <span>{minds.genomeNote}</span>
          <Link href={links.replay(chog.tokenId)} className="lp-go lp-go--inline">
            {ctas.watchIt}
            <span className="v2-sr">: {chog.name}</span>
            <ArrowRightIcon className="lp-go-arrow" />
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
    // Phones: thumbnail beside the name. From 1024px: a full-width portrait on top.
    <li className="v2-card v2-card--flush lp-persona lp-reveal">
      <ChogImage
        src={chog.image.src}
        fallbackSrc={chog.image.fallbackSrc}
        alt={`${chog.label}, ${chog.name}`}
        size={600}
        fallbackLabel={chog.label}
        className="lp-persona-art"
      />
      <div className="lp-persona-id">
        <h3 className="lp-card-h3">{chog.archetype}</h3>
        {/* In a list the style is plain muted text, not a badge. */}
        <p className="lp-persona-who v2-muted">
          {chog.name} · {chog.label} · {styleCopy[chog.style].label}
        </p>
      </div>

      <div className="lp-persona-body">
        <p className="lp-card-p">{chog.signal}</p>
        {chog.setters.length > 0 && (
          <p className="lp-set-by">
            {minds.setBy} {chog.setters.map((trait) => `${trait.type}: ${trait.value}`).join(" · ")}
          </p>
        )}
        <dl className="lp-mini-stats">
          {stats.map((stat) => (
            <div key={stat.label}>
              <dt>{stat.label}</dt>
              <dd>{stat.value}</dd>
            </div>
          ))}
        </dl>
        <Link href={links.replay(chog.tokenId)} className="lp-go">
          <span className="lp-go-lead">
            <RewindIcon className="lp-go-glyph" />
            {ctas.watchIt}
            <span className="v2-sr">: {chog.name}</span>
          </span>
          <ArrowRightIcon className="lp-go-arrow" />
        </Link>
      </div>
    </li>
  );
}
