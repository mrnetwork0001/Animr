import { faq } from "./content";
import { SectionHead, Shell } from "./primitives";
import { Rich } from "./rich";

/**
 * Native <details> disclosures: keyboard and screen-reader friendly with no JavaScript. They share one
 * `name`, so the browser keeps one answer open at a time (opening a question closes the previous one).
 */
export function Faq() {
  return (
    <section id={faq.id} aria-labelledby={`${faq.id}-title`} className="lp-section">
      <Shell className="lp-faq">
        <SectionHead id={faq.id} title={faq.title} className="lp-faq-head" />
        <div className="lp-faq-list">
          {faq.items.map((item) => (
            <details key={item.q} name="faq" className="lp-faq-item lp-reveal">
              <summary className="lp-faq-q">
                <span>{item.q}</span>
                <span aria-hidden="true" className="lp-faq-toggle" />
              </summary>
              <p className="lp-faq-a">
                <Rich text={item.a} />
              </p>
            </details>
          ))}
        </div>
      </Shell>
    </section>
  );
}
