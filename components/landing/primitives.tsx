import Link from "next/link";
import { type CSSProperties, type ComponentProps, Fragment, type ReactNode } from "react";
import { Badge, type BadgeTone } from "@/components/v2/primitives";
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
  title: string;
  /** May use **bold** / `code` (see rich.tsx). */
  lede?: string;
  className?: string;
};

/**
 * A heading's words, each in its own mask so they can rise in one after another (landing.css .lp-word). Split on
 * plain spaces only, so no-break spaces keep their pairs together; the text itself is unchanged.
 */
export function MaskedWords({ text }: { text: string }) {
  const words = text.split(" ");
  return words.map((word, index) => (
    <Fragment key={index}>
      <span className="lp-word">
        <span className="lp-word-in" style={{ "--w": index } as CSSProperties}>
          {word}
        </span>
      </span>
      {index < words.length - 1 && " "}
    </Fragment>
  ));
}

/** A section's head: a hairline, then the DM Sans title with the lede beside it. */
export function SectionHead({ id, title, lede, className = "" }: SectionHeadProps) {
  return (
    <header className={`lp-head lp-reveal ${className}`}>
      <h2 id={`${id}-title`} className="lp-h2">
        <MaskedWords text={title} />
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
export function Section({ id, title, lede, children, className = "" }: SectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={`lp-section ${className}`}>
      <Shell>
        <SectionHead id={id} title={title} lede={lede} />
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

/** live: on Monad mainnet today. simulated: replayed on real data. */
export type Status = "live" | "simulated";

const STATUS: Record<Status, { tone: BadgeTone; label: string; live?: boolean }> = {
  live: { tone: "success", label: "Live", live: true },
  simulated: { tone: "violet", label: "Simulated" },
};

/** A status capsule: "Live" (pulsing) or "Simulated", or a custom label in that tone. */
export function StatusBadge({ status, label, className = "" }: { status: Status; label?: string; className?: string }) {
  const { tone, label: fallback, live } = STATUS[status];
  return (
    <Badge tone={tone} dot live={live} className={className}>
      {label ?? fallback}
    </Badge>
  );
}
