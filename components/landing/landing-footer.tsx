import { V2Brand } from "@/components/v2";
import { footer } from "./content";
import { AnyLink, Shell } from "./primitives";

/** The landing footer: brand and blurb, the two link columns, then the disclaimer and honesty notes. */
export function LandingFooter() {
  return (
    <footer className="lp-footer">
      <Shell>
        <div className="lp-footer-top">
          <div className="lp-footer-brand">
            <V2Brand />
            <p className="lp-footer-blurb">{footer.blurb}</p>
          </div>
          <nav aria-label={footer.navLabel} className="lp-footer-nav">
            {footer.columns.map((column) => (
              <div key={column.title}>
                <p className="v2-overline">{column.title}</p>
                <ul className="lp-footer-links">
                  {column.links.map((item) => (
                    <li key={item.href}>
                      <AnyLink href={item.href} className="v2-footer-link">
                        {item.label}
                      </AnyLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <div className="lp-footer-bottom">
          <p className="lp-footer-disclaimer">{footer.disclaimer}</p>
          <ul className="lp-footer-notes">
            {footer.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      </Shell>
    </footer>
  );
}
