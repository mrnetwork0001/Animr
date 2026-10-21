import Link from "next/link";
import type { ReactNode } from "react";
import { V2Brand } from "@/components/v2/app-shell";
import {
  type FooterLink,
  footerColumns,
  footerCopy,
  footerSocials,
} from "./footer-links";
import "@/app/design-v2.css";
import "./site-footer.css";

type SiteFooterProps = {
  /** Unused since the bottom bar was removed; kept so existing callers still type-check. */
  note?: ReactNode;
  /** Extra content under the link columns (rarely needed). */
  extra?: ReactNode;
  /** The column wrapper: "v2-shell" in the app; the landing page passes "lp-shell" to line up with its sections. */
  shellClassName?: string;
};

/**
 * The one site footer, for the landing page (components/landing/landing-footer.tsx) and every app page (AppShell):
 * brand lockup, description and icon links on the left; Product, Ecosystem and Resources columns on the right.
 * Server markup, no client code.
 * Data: ./footer-links.ts.
 */
export function SiteFooter({
  extra,
  shellClassName = "v2-shell",
}: SiteFooterProps) {
  return (
    <footer className="sf">
      <div className={shellClassName}>
        <div className="sf-top">
          <div className="sf-brand">
            <V2Brand />
            <p className="sf-description">{footerCopy.description}</p>
            {footerSocials.length > 0 && (
              <ul className="sf-socials" aria-label="Animr elsewhere">
                {footerSocials.map((social) => (
                  <li key={social.href}>
                    <a
                      href={social.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="sf-social"
                      aria-label={`${social.label} (opens in a new tab)`}
                      title={social.label}
                    >
                      <GitHubIcon />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="sf-cols">
            {footerColumns.map((column) => {
              const headingId = `sf-col-${column.title.toLowerCase()}`;
              return (
                <nav
                  key={column.title}
                  className="sf-col"
                  aria-labelledby={headingId}
                >
                  <h2 id={headingId} className="sf-heading">
                    {column.title}
                  </h2>
                  <ul className="sf-links">
                    {column.links.map((link) => (
                      <li key={link.href}>
                        <FooterAnchor link={link} />
                      </li>
                    ))}
                  </ul>
                </nav>
              );
            })}
          </div>
        </div>

        {extra != null && <div className="sf-extra">{extra}</div>}
      </div>
    </footer>
  );
}

function FooterAnchor({ link }: { link: FooterLink }) {
  if (link.external) {
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        title={link.title}
        className="sf-link"
      >
        {link.label}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  }
  return (
    <Link href={link.href} className="sf-link">
      {link.label}
    </Link>
  );
}

function GitHubIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}
