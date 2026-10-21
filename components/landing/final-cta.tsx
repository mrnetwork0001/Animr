import { ArrowRightIcon, PillLink, pillClass } from "@/components/v2";
import { heroMedia } from "@/components/hero/content";
import { ChogImage } from "./chog-image";
import { ctas, finalCta, links, showcaseIds } from "./content";
import { Icon } from "./icons";
import { Shell } from "./primitives";
import { RandomChog } from "./random-chog-button";
import { showcaseChogs } from "./showcase";

/** The closing call: the lineup, one line, Random Chog and the app, over the hero's slab artwork. */
export function FinalCta() {
  const lineup = showcaseChogs(showcaseIds.lineup);
  const middle = Math.floor(lineup.length / 2);
  return (
    <section aria-labelledby="final-cta-title" className="lp-section lp-cta-section">
      <Shell>
        <div className="lp-cta lp-reveal">
          {/* Decorative: the hero's still, lightened into the panel (the same file the hero already loaded). */}
          <div aria-hidden="true" className="lp-cta-art">
            {/* eslint-disable-next-line @next/next/no-img-element -- the hero's own still: one URL, already cached */}
            <img src={heroMedia.still} width={heroMedia.stillSize} height={heroMedia.stillSize} alt="" loading="lazy" decoding="async" />
          </div>

          <div className="lp-cta-copy">
            <ul aria-hidden="true" className="lp-lineup">
              {lineup.map((chog, index) => (
                <li key={chog.tokenId} className={index === middle ? "is-raised" : undefined}>
                  <ChogImage
                    src={chog.image.src}
                    fallbackSrc={chog.image.fallbackSrc}
                    alt=""
                    size={112}
                    fallbackLabel={`#${chog.tokenId}`}
                    className="lp-lineup-art"
                  />
                </li>
              ))}
            </ul>
            <p className="v2-kicker v2-kicker--dot">{finalCta.eyebrow}</p>
            <h2 id="final-cta-title" className="lp-cta-title">
              {finalCta.title}
            </h2>
            <p className="lp-lead">{finalCta.lede}</p>
            <div className="lp-cta-actions">
              <RandomChog className={pillClass("primary", "lg")}>
                <Icon name="dice" className="v2-btn-icon" strokeWidth={1.6} />
                {ctas.random}
              </RandomChog>
              <PillLink href={links.app} variant="glass" size="lg">
                {ctas.launch}
                <ArrowRightIcon className="v2-btn-icon" />
              </PillLink>
            </div>
            <p className="v2-note">{finalCta.footnote}</p>
          </div>
        </div>
      </Shell>
    </section>
  );
}
