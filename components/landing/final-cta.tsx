import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowRightIcon, PillLink, pillClass } from "@/components/v2";
import { ChogImage } from "./chog-image";
import { ctas, finalCta, links, showcaseIds } from "./content";
import { Icon } from "./icons";
import { MaskedWords, Shell } from "./primitives";
import { RandomChog } from "./random-chog-button";
import { showcaseChogs } from "./showcase";

/** The closing call: the lineup, one line, Random Chog and the app. */
export function FinalCta() {
  const lineup = showcaseChogs(showcaseIds.lineup);
  const middle = Math.floor(lineup.length / 2);
  return (
    <section aria-labelledby="final-cta-title" className="lp-section lp-cta-section">
      <Shell>
        {/* data-lp-loop: the lineup's slow float runs only while the panel is on screen (landing-motion.tsx). */}
        <div className="lp-cta lp-reveal" data-lp-loop="">
          <div className="lp-cta-copy">
            <ul aria-hidden="true" className="lp-lineup">
              {lineup.map((chog, index) => (
                <li
                  key={chog.tokenId}
                  className={index === middle ? "is-raised" : undefined}
                  style={{ "--n": index, "--from-mid": Math.abs(index - middle) } as CSSProperties}
                >
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
            <h2 id="final-cta-title" className="lp-cta-title">
              <MaskedWords text={finalCta.title} />
            </h2>
            <p className="lp-lead">{finalCta.lede}</p>
            <div className="lp-cta-actions">
              <RandomChog className={pillClass("hero", "lg")}>
                <Icon name="dice" className="v2-btn-icon" strokeWidth={1.6} />
                {ctas.random}
              </RandomChog>
              <PillLink href={links.app} variant="glass" size="lg">
                {ctas.launch}
                <ArrowRightIcon className="v2-btn-icon" />
              </PillLink>
            </div>
            <p className="v2-note">
              {finalCta.footnote}{" "}
              <Link href="/tour" className="v2-link">
                Judging? Take the 2-minute tour
              </Link>
            </p>
          </div>
        </div>
      </Shell>
    </section>
  );
}
