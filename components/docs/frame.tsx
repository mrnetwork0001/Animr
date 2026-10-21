import Link from "next/link";
import type { ReactNode } from "react";
import { DOC_GROUPS, type DocEntry, docEntry, docGroupOf, docHref, docNeighbours } from "./registry";
import "./docs.css";

export type DocSection = {
  /** The section's anchor (#id) and its "On this page" entry. */
  id: string;
  title: string;
  body: ReactNode;
};

export type DocContent = {
  /** Shown between the lead and the first section, without a heading. */
  intro?: ReactNode;
  sections: readonly DocSection[];
};

function navLabel(page: DocEntry): string {
  return page.nav ?? page.title;
}

function SidebarLinks({ current }: { current: string }) {
  return (
    <>
      {DOC_GROUPS.map((group) => (
        <div key={group.label} className="docs-nav-group">
          <p className="docs-nav-label">{group.label}</p>
          <ul className="docs-nav-list">
            {group.pages.map((page) => {
              const active = page.slug === current;
              return (
                <li key={page.slug || "home"}>
                  <Link
                    href={docHref(page.slug)}
                    className={active ? "docs-nav-link is-active" : "docs-nav-link"}
                    aria-current={active ? "page" : undefined}
                  >
                    {navLabel(page)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
}

/**
 * A docs page: sidebar (a section picker on phones and tablets), the reading column with H1, lead, sections and
 * prev/next, and an "On this page" list on wide screens for pages with three or more sections. Server component.
 */
export function DocsFrame({ slug, content }: { slug: string; content: DocContent }) {
  const entry = docEntry(slug);
  if (!entry) return null;
  const group = docGroupOf(slug);
  const { prev, next } = docNeighbours(slug);
  const toc = content.sections.length >= 3;

  return (
    <div className="v2-shell docs-shell">
      <div className={toc ? "docs-layout docs-layout--toc" : "docs-layout"}>
        {/* Phones and tablets: the whole table of contents behind one disclosure. Keyed so it closes on navigation. */}
        <details key={slug} className="docs-picker">
          <summary className="docs-picker-summary">
            <span className="docs-picker-kicker">Docs</span>
            <span className="docs-picker-current">{navLabel(entry)}</span>
            <svg className="docs-picker-chevron" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6l4 4 4-4" />
            </svg>
          </summary>
          <nav className="docs-picker-panel" aria-label="Docs sections">
            <SidebarLinks current={slug} />
          </nav>
        </details>

        <nav className="docs-sidebar" aria-label="Docs">
          <SidebarLinks current={slug} />
        </nav>

        <article className="docs-article">
          <header className="docs-header">
            {group && <p className="docs-header-group">{group.label}</p>}
            <h1 className="docs-h1">{entry.title}</h1>
            <p className="docs-lead">{entry.description}</p>
          </header>

          <div className="docs-prose">
            {content.intro}
            {content.sections.map((section) => (
              <section key={section.id} className="docs-section" aria-labelledby={section.id}>
                <h2 className="docs-h2" id={section.id}>
                  <a href={`#${section.id}`} className="docs-anchor">
                    {section.title}
                  </a>
                </h2>
                {section.body}
              </section>
            ))}
          </div>

          {(prev || next) && (
            <nav className="docs-pager" aria-label="Previous and next page">
              {prev ? (
                <Link href={docHref(prev.slug)} className="docs-pager-link" rel="prev">
                  <span className="docs-pager-dir">Previous</span>
                  <span className="docs-pager-title">{navLabel(prev)}</span>
                </Link>
              ) : (
                <span />
              )}
              {next && (
                <Link href={docHref(next.slug)} className="docs-pager-link docs-pager-link--next" rel="next">
                  <span className="docs-pager-dir">Next</span>
                  <span className="docs-pager-title">{navLabel(next)}</span>
                </Link>
              )}
            </nav>
          )}
        </article>

        {toc && (
          <nav className="docs-toc" aria-label="On this page">
            <p className="docs-toc-title">On this page</p>
            <ul className="docs-toc-list">
              {content.sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`} className="docs-toc-link">
                    {section.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </div>
  );
}
