import Link from "next/link";
import type { ReactNode } from "react";
import { explorerAddressUrl } from "@/lib/format";
import { CopyButton } from "./copy-button";

// Small building blocks for doc pages (components/docs/content/*). Server components; classes in ./docs.css.

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** A paragraph whose first sentence is bold: <P lead="The NFT is the key.">Everything else…</P>. */
export function P({ lead, children }: { lead?: ReactNode; children?: ReactNode }) {
  return (
    <p>
      {lead != null && <strong className="docs-p-lead">{lead}</strong>}
      {lead != null && children != null && " "}
      {children}
    </p>
  );
}

export function H3({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h3 className="docs-h3" id={id}>
      {children}
    </h3>
  );
}

/** Inline code: function names, env vars, values. */
export function Code({ children }: { children: ReactNode }) {
  return <code className="docs-code">{children}</code>;
}

/** A block of code or a message, as written (no highlighting). */
export function CodeBlock({ children, label }: { children: string; label?: string }) {
  return (
    <figure className="docs-pre-wrap">
      {label && <figcaption className="docs-pre-label">{label}</figcaption>}
      <pre className="docs-pre">
        <code>{children}</code>
      </pre>
    </figure>
  );
}

/** An internal link inside the prose. */
export function DocLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="docs-link">
      {children}
    </Link>
  );
}

/** An external link (new tab). */
export function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="docs-link" target="_blank" rel="noopener noreferrer">
      {children}
      <span className="v2-sr"> (opens in a new tab)</span>
    </a>
  );
}

function ExternalGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 3.5h-3v9h9v-3M9.5 2.5h4v4M13.5 2.5 7.5 8.5" />
    </svg>
  );
}

/**
 * A contract or wallet address: the full checksummed address in mono (it wraps on phones), a copy button and a link
 * to the explorer the app already uses (lib/format.ts, viem's Monad chain).
 */
export function Address({ address, kind = "address" }: { address: string; kind?: "address" | "contract" | "wallet" }) {
  const url = explorerAddressUrl(address);
  return (
    <span className="docs-address">
      <code className="docs-address-text">{address}</code>
      <span className="docs-address-actions">
        <CopyButton value={address} label={`Copy ${kind}`} />
        {url && (
          <a className="docs-icon-btn" href={url} target="_blank" rel="noopener noreferrer" title="View on the explorer">
            <ExternalGlyph />
            <span className="v2-sr">View {address} on the explorer (opens in a new tab)</span>
          </a>
        )}
      </span>
    </span>
  );
}

export type CalloutTone = "note" | "warning" | "honest";

/** A boxed aside. "honest" is for what is simulated, points-only or not live. */
export function Callout({ tone = "note", title, children }: { tone?: CalloutTone; title?: ReactNode; children: ReactNode }) {
  return (
    <aside className={cx("docs-callout", `docs-callout--${tone}`)}>
      {title != null && <p className="docs-callout-title">{title}</p>}
      <div className="docs-callout-body">{children}</div>
    </aside>
  );
}

/** A numbered flow: each step a short title and a line or two. */
export function StepList({ steps }: { steps: readonly { title: ReactNode; body?: ReactNode }[] }) {
  return (
    <ol className="docs-steps">
      {steps.map((step, i) => (
        <li key={i} className="docs-step">
          <span className="docs-step-num" aria-hidden="true">
            {i + 1}
          </span>
          <div className="docs-step-copy">
            <p className="docs-step-title">{step.title}</p>
            {step.body != null && <div className="docs-step-body">{step.body}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** A prose table: header row plus cells that wrap (unlike the app's data tables). */
export function DocTable({
  head,
  rows,
  caption,
  compact,
}: {
  head: readonly ReactNode[];
  rows: readonly (readonly ReactNode[])[];
  caption?: ReactNode;
  /** Tighter cells for long reference tables. */
  compact?: boolean;
}) {
  return (
    <div className="docs-table-wrap">
      <table className={cx("docs-table", compact && "docs-table--compact")}>
        {caption != null && <caption className="v2-sr">{caption}</caption>}
        <thead>
          <tr>
            {head.map((cell, i) => (
              <th key={i} scope="col">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) =>
                c === 0 ? (
                  <th key={c} scope="row">
                    {cell}
                  </th>
                ) : (
                  <td key={c}>{cell}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A small capsule in a table cell ("Secret", "GET", "Cron"). */
export function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "teal" | "violet" | "warning" }) {
  return <span className={cx("docs-tag", tone !== "neutral" && `docs-tag--${tone}`)}>{children}</span>;
}
