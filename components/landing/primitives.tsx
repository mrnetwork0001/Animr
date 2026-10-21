import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { TradingStyle } from "@/lib/agent/types";
import { styles as styleCopy } from "./content";
import { Rich } from "./rich";

/** Page-width container shared by every landing section. */
export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 ${className}`}>{children}</div>;
}

/**
 * A link whose target lives in content.ts: in-page anchors ("#faq") stay plain <a> elements (native
 * scrolling and focus), routes ("/app") go through next/link for client-side navigation.
 */
export function AnyLink({ href, ...props }: Omit<ComponentProps<"a">, "href"> & { href: string }) {
  return href.startsWith("#") ? <a href={href} {...props} /> : <Link href={href} {...props} />;
}

type SectionProps = {
  id: string;
  eyebrow: string;
  title: string;
  /** May use **bold** / `code` (see rich.tsx). */
  lede?: string;
  children: ReactNode;
  className?: string;
  /** Header alignment; centered for short, punchy sections. */
  align?: "start" | "center";
};

/**
 * A titled page section: anchor target, landmark labelled by its heading, consistent rhythm. Anchor
 * jumps clear the sticky header through html's scroll-padding-top (landing.css).
 */
export function Section({ id, eyebrow, title, lede, children, className = "", align = "start" }: SectionProps) {
  const headingId = `${id}-title`;
  const centered = align === "center";
  return (
    <section id={id} aria-labelledby={headingId} className={`py-14 sm:py-20 ${className}`}>
      <Container>
        <header className={`landing-reveal max-w-3xl ${centered ? "mx-auto text-center" : ""}`}>
          <p className="eyebrow">{eyebrow}</p>
          <h2
            id={headingId}
            className="mt-3 text-3xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-4xl lg:text-[2.75rem]"
          >
            {title}
          </h2>
          {lede && (
            <p className="mt-5 text-lg leading-relaxed text-pretty text-muted">
              <Rich text={lede} />
            </p>
          )}
        </header>
        {children}
      </Container>
    </section>
  );
}

const STYLE_TONE: Record<TradingStyle, string> = {
  aggressive: "bg-orange-300/10 text-orange-300 ring-orange-300/30",
  balanced: "bg-accent/15 text-accent-strong ring-accent/35",
  cautious: "bg-sky-300/10 text-sky-300 ring-sky-300/30",
};

/** Text and highlight colors per style, matching StyleBadge. */
export const STYLE_TEXT: Record<TradingStyle, string> = {
  aggressive: "text-orange-300",
  balanced: "text-accent-strong",
  cautious: "text-sky-300",
};

export const STYLE_HIGHLIGHT: Record<TradingStyle, string> = {
  aggressive: "bg-orange-300/10 text-orange-300 ring-orange-300/40",
  balanced: "bg-accent/15 text-accent-strong ring-accent/40",
  cautious: "bg-sky-300/10 text-sky-300 ring-sky-300/40",
};

/** Persona style pill, color-coded: aggressive = warm, balanced = Animr purple, cautious = cool. */
export function StyleBadge({ style, className = "" }: { style: TradingStyle; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide ring-1 ring-inset ${STYLE_TONE[style]} ${className}`}
    >
      {styleCopy[style].label.toLowerCase()}
    </span>
  );
}

/** live: on Monad mainnet today. simulated: replayed on real data. moving: the House Chog isn't in yet. */
export type Status = "live" | "simulated" | "moving";

const STATUS: Record<Status, { tone: string; dot: string; label: string }> = {
  live: { tone: "bg-success/10 text-success ring-success/30", dot: "bg-success", label: "Live" },
  simulated: { tone: "bg-accent/10 text-accent-strong ring-accent/30", dot: "bg-accent-strong", label: "Simulated" },
  moving: { tone: "bg-warning/10 text-warning ring-warning/30", dot: "bg-warning", label: "Moving in" },
};

/** A small uppercase status pill: "Live", "Simulated" or "Moving in" (or a custom label in that tone). */
export function StatusBadge({ status, label, className = "" }: { status: Status; label?: string; className?: string }) {
  const { tone, dot, label: fallback } = STATUS[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wider uppercase ring-1 ring-inset ${tone} ${className}`}
    >
      <span aria-hidden className={`size-1.5 rounded-full ${dot}`} />
      {label ?? fallback}
    </span>
  );
}

/** Small pulsing dot for "thinking" / live indicators. */
export function PulseDot({ className = "bg-success" }: { className?: string }) {
  return (
    <span aria-hidden className="relative flex size-2">
      <span className={`landing-ping absolute inset-0 rounded-full opacity-60 ${className}`} />
      <span className={`relative size-2 rounded-full ${className}`} />
    </span>
  );
}
