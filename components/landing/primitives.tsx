import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Badge, type BadgeTone, Kicker } from "@/components/v2/primitives";
import type { TradingStyle } from "@/lib/agent/types";
import { styles as styleCopy } from "./content";
import { Rich } from "./rich";

// Shared pieces for the landing sections below the hero, in the v2 language (app/design-v2.css) plus
// the landing's own layout classes (landing.css, prefix `lp-`).

/** The landing's content column: the hero canvas's content width on wide screens, v2 gutters always. */
export function Shell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`lp-shell ${className}`}>{children}</div>;
}

/**
 * A link whose target lives in content.ts: in-page anchors ("#faq") stay plain <a> elements (native
 * scrolling and focus), routes ("/app") go through next/link for client-side navigation.
 */
export function AnyLink({ href, ...props }: Omit<ComponentProps<"a">, "href"> & { href: string }) {
  return href.startsWith("#") ? <a href={href} {...props} /> : <Link href={href} {...props} />;
}

type SectionHeadProps = {
  id: string;
  /** Its place on the page: 1 → "01". */
  index?: number;
  kicker: string;
  title: string;
  /** May use **bold** / `code` (see rich.tsx). */
  lede?: string;
  className?: string;
};

/** A section's head: a hairline, the index and teal kicker, then the DM Sans title with the lede beside it. */
export function SectionHead({ id, index, kicker, title, lede, className = "" }: SectionHeadProps) {
  return (
    <header className={`lp-head lp-reveal ${className}`}>
      <div className="lp-head-meta">
        {index != null && (
          <span className="lp-index" aria-hidden="true">
            {String(index).padStart(2, "0")}
          </span>
        )}
        <Kicker dot>{kicker}</Kicker>
      </div>
      <h2 id={`${id}-title`} className="lp-h2">
        {title}
      </h2>
      {lede && (
        <p className="lp-lead">
          <Rich text={lede} />
        </p>
      )}
    </header>
  );
}

type SectionProps = Omit<SectionHeadProps, "className"> & {
  children: ReactNode;
  className?: string;
};

/** A titled page section: anchor target, landmark labelled by its heading, the landing's rhythm. */
export function Section({ id, index, kicker, title, lede, children, className = "" }: SectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={`lp-section ${className}`}>
      <Shell>
        <SectionHead id={id} index={index} kicker={kicker} title={title} lede={lede} />
        {children}
      </Shell>
    </section>
  );
}

/** Styles on the v2 palette: no new hues (aggressive = violet, balanced = teal, cautious = neutral). */
const STYLE_TONE: Record<TradingStyle, BadgeTone> = {
  aggressive: "violet",
  balanced: "teal",
  cautious: "neutral",
};

/** Text colour per style, matching StyleBadge (landing.css). */
export const STYLE_TEXT: Record<TradingStyle, string> = {
  aggressive: "lp-tone-violet",
  balanced: "lp-tone-teal",
  cautious: "lp-tone-neutral",
};

/** Persona style capsule. */
export function StyleBadge({ style, className = "" }: { style: TradingStyle; className?: string }) {
  return (
    <Badge tone={STYLE_TONE[style]} className={className}>
      {styleCopy[style].label}
    </Badge>
  );
}

/** live: on Monad mainnet today. simulated: replayed on real data. moving: the House Chog isn't in yet. */
export type Status = "live" | "simulated" | "moving";

const STATUS: Record<Status, { tone: BadgeTone; label: string; live?: boolean }> = {
  live: { tone: "success", label: "Live", live: true },
  simulated: { tone: "violet", label: "Simulated" },
  moving: { tone: "warning", label: "Moving in" },
};

/** A status capsule: "Live" (pulsing), "Simulated" or "Moving in", or a custom label in that tone. */
export function StatusBadge({ status, label, className = "" }: { status: Status; label?: string; className?: string }) {
  const { tone, label: fallback, live } = STATUS[status];
  return (
    <Badge tone={tone} dot live={live} className={className}>
      {label ?? fallback}
    </Badge>
  );
}
