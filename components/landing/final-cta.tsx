import Link from "next/link";
import { ChogImage } from "./chog-image";
import { ctas, finalCta, links, showcaseIds } from "./content";
import { Icon } from "./icons";
import { Container } from "./primitives";
import { RandomChog } from "./random-chog-button";
import { showcaseChogs } from "./showcase";

export function FinalCta() {
  const lineup = showcaseChogs(showcaseIds.lineup);
  const middle = Math.floor(lineup.length / 2);
  return (
    <section aria-labelledby="final-cta-title" className="pt-8 pb-24 sm:pb-32">
      <Container>
        <div className="landing-reveal relative overflow-hidden rounded-[2rem] border border-line-strong bg-surface px-6 py-14 text-center sm:px-12 sm:py-20">
          <div aria-hidden className="landing-glow pointer-events-none absolute inset-0" />
          <div aria-hidden className="landing-grid pointer-events-none absolute inset-0 opacity-60" />

          <div className="relative">
            <ul aria-hidden className="flex justify-center">
              {lineup.map((chog, index) => (
                <li key={chog.tokenId} className={`-ml-3 first:ml-0 ${index === middle ? "z-10 -translate-y-1.5" : ""}`}>
                  <ChogImage
                    src={chog.image.src}
                    fallbackSrc={chog.image.fallbackSrc}
                    alt=""
                    size={112}
                    fallbackLabel={`#${chog.tokenId}`}
                    className={`rounded-2xl ring-4 ring-surface ${index === middle ? "size-16 sm:size-20" : "size-12 sm:size-16"}`}
                  />
                </li>
              ))}
            </ul>
            <p className="eyebrow mt-8">{finalCta.eyebrow}</p>
            <h2 id="final-cta-title" className="mt-3 text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
              {finalCta.title}
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-pretty text-muted">{finalCta.lede}</p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <RandomChog className="btn btn-primary px-6 py-3 text-base">
                <Icon name="dice" className="size-[1.15rem]" />
                {ctas.random}
              </RandomChog>
              <Link href={links.app} className="btn btn-secondary px-6 py-3 text-base">
                {ctas.launch}
                <Icon name="arrowRight" className="size-[1.1rem]" strokeWidth={2} />
              </Link>
            </div>
            <p className="mt-5 text-sm text-subtle">{finalCta.footnote}</p>
          </div>
        </div>
      </Container>
    </section>
  );
}
