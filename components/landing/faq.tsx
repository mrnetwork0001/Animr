import { faq } from "./content";
import { Icon } from "./icons";
import { Container } from "./primitives";
import { Rich } from "./rich";

/** Native <details> disclosures: keyboard and screen-reader friendly with no JavaScript. */
export function Faq() {
  const headingId = `${faq.id}-title`;
  return (
    <section id={faq.id} aria-labelledby={headingId} className="py-14 sm:py-20">
      <Container className="grid gap-10 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] lg:gap-16">
        <header className="landing-reveal lg:sticky lg:top-28 lg:self-start">
          <p className="eyebrow">{faq.eyebrow}</p>
          <h2 id={headingId} className="mt-3 text-3xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-4xl">
            {faq.title}
          </h2>
        </header>
        <div className="divide-y divide-line border-y border-line">
          {faq.items.map((item) => (
            <details key={item.q} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 rounded-lg py-5 text-left font-semibold tracking-tight transition-colors hover:text-accent-strong [&::-webkit-details-marker]:hidden">
                <span>{item.q}</span>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-line text-muted transition-transform duration-200 group-open:rotate-180">
                  <Icon name="chevronDown" className="size-4" strokeWidth={2} />
                </span>
              </summary>
              <p className="max-w-2xl pr-12 pb-6 text-[0.95rem] leading-relaxed text-pretty text-muted">
                <Rich text={item.a} />
              </p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}
