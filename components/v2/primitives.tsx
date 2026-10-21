import Link from "next/link";
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { ArrowRightIcon } from "./icons";
import "@/app/design-v2.css";

// The v2 building blocks (classes in app/design-v2.css, guide in components/v2/README.md). No hooks
// and no client-only imports, so they render on the server and also inside client components.

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/* ----------------------------------------------------------------------------- type */

/** The teal label above a title (the hero's "Trading DNA"). `dot` adds a glowing point. */
export function Kicker({ children, dot, className }: { children: ReactNode; dot?: boolean; className?: string }) {
  return <p className={cx("v2-kicker", dot && "v2-kicker--dot", className)}>{children}</p>;
}

type PageHeaderProps = {
  kicker?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  /** Buttons under the lead (PillLink / PillButton). */
  actions?: ReactNode;
  /** Right column from 1024px (stats, a Chog portrait, a picker); stacks under the copy on phones. */
  aside?: ReactNode;
  /** The hero's white-to-grey ink on the title. On by default. */
  fade?: boolean;
  className?: string;
};

/** A page's title block: kicker, one h1, lead, actions, optional aside. Use once per page. */
export function PageHeader({ kicker, title, lead, actions, aside, fade = true, className }: PageHeaderProps) {
  return (
    <header className={cx("v2-page-header", aside != null && "v2-page-header--split", className)}>
      <div className="v2-page-header-copy">
        {kicker != null && <Kicker dot>{kicker}</Kicker>}
        <h1 className={cx("v2-h1", fade && "v2-h1--fade")}>{title}</h1>
        {lead != null && <p className="v2-lead">{lead}</p>}
        {actions != null && <div className="v2-page-header-actions">{actions}</div>}
      </div>
      {aside != null && <div className="v2-page-header-aside">{aside}</div>}
    </header>
  );
}

type SectionTitleProps = {
  kicker?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Right-aligned link or control ("See all", a window picker). */
  action?: ReactNode;
  /** For aria-labelledby on the section. */
  id?: string;
  as?: "h2" | "h3";
  className?: string;
};

/** A section's heading row: kicker over an h2 (DM Sans), optional description and a right-hand action. */
export function SectionTitle({ kicker, title, description, action, id, as: Heading = "h2", className }: SectionTitleProps) {
  return (
    <div className={cx("v2-section-title", className)}>
      <div className="v2-section-title-copy">
        {kicker != null && <Kicker>{kicker}</Kicker>}
        <Heading id={id} className={Heading === "h2" ? "v2-h2" : "v2-h3"}>
          {title}
        </Heading>
        {description != null && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}

/* ----------------------------------------------------------------------------- surfaces */

type IconTileProps = {
  children: ReactNode;
  size?: "sm" | "md" | "lg";
  tone?: "teal" | "violet";
  className?: string;
};

/** The hero cards' glowing square for a glyph from components/v2/icons.tsx. Decorative. */
export function IconTile({ children, size = "md", tone = "teal", className }: IconTileProps) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "v2-icon-tile",
        size === "lg" && "v2-icon-tile--lg",
        size === "sm" && "v2-icon-tile--sm",
        tone === "violet" && "v2-icon-tile--violet",
        className,
      )}
    >
      {children}
    </span>
  );
}

type GlassCardProps = {
  children: ReactNode;
  /** Renders a next/link with the hover lift; otherwise `as`. */
  href?: string;
  as?: "div" | "section" | "article" | "li" | "aside";
  padding?: "tight" | "default" | "roomy" | "flush";
  /** The one card that leads a page: a violet/teal wash in the glass. */
  feature?: boolean;
  /** Hover lift without a link (a card containing its own button). */
  interactive?: boolean;
  className?: string;
  style?: CSSProperties;
  id?: string;
  "aria-labelledby"?: string;
  "aria-label"?: string;
};

/** A glass panel: hairline, 2% fill, backdrop blur, faint inner glow. The base of every v2 card. */
export function GlassCard({
  children,
  href,
  as: Tag = "div",
  padding = "default",
  feature,
  interactive,
  className,
  ...rest
}: GlassCardProps) {
  const classes = cx(
    "v2-card",
    padding !== "default" && `v2-card--${padding}`,
    feature && "v2-card--feature",
    interactive && "v2-card--interactive",
    className,
  );
  if (href) {
    return (
      <Link href={href} className={classes} {...rest}>
        {children}
      </Link>
    );
  }
  return (
    <Tag className={classes} {...rest}>
      {children}
    </Tag>
  );
}

type FeatureCardProps = {
  icon: ReactNode;
  kicker: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  href?: string;
  tone?: "teal" | "violet";
  footer?: ReactNode;
  className?: string;
};

/** The hero's card, reusable: icon tile + teal kicker, then a title and optional body/footer. */
export function FeatureCard({ icon, kicker, title, body, href, tone, footer, className }: FeatureCardProps) {
  return (
    <GlassCard href={href} className={className}>
      <span className="v2-card-head">
        <IconTile size="lg" tone={tone}>
          {icon}
        </IconTile>
        <span className="v2-kicker">{kicker}</span>
      </span>
      <span className="v2-card-title">{title}</span>
      {body != null && <span className="v2-card-body">{body}</span>}
      {footer != null && <span className="v2-card-foot">{footer}</span>}
    </GlassCard>
  );
}

/* ----------------------------------------------------------------------------- stats */

export type V2Stat = {
  label: ReactNode;
  value: ReactNode;
  /** What a screen reader says instead of `value` ("37 of 37" for "37/37"). */
  spoken?: string;
  /** A faint line under the label (a window, a footnote mark). */
  hint?: ReactNode;
  /** Colours the value: gains / losses. */
  tone?: "up" | "down";
  key?: string;
};

type StatRowProps = {
  stats: readonly V2Stat[];
  size?: "md" | "sm";
  /** Inside a glass panel. */
  boxed?: boolean;
  /** Keep one row on phones too (2-3 short stats); otherwise phones get a 2-column grid. */
  inline?: boolean;
  className?: string;
};

/** The hero's stat row: DM Sans numbers over grey labels, thin vertical hairlines between. */
export function StatRow({ stats, size = "md", boxed, inline, className }: StatRowProps) {
  return (
    <dl
      className={cx(
        "v2-stats",
        size === "sm" && "v2-stats--sm",
        boxed && "v2-stats--boxed",
        inline && "v2-stats--inline",
        className,
      )}
    >
      {stats.map((stat, i) => (
        <div key={stat.key ?? i} className="v2-stat">
          <dt className="v2-stat-label">
            {stat.label}
            {stat.hint != null && <span className="v2-stat-hint"> · {stat.hint}</span>}
          </dt>
          <dd className={cx("v2-stat-value", stat.tone === "up" && "v2-up", stat.tone === "down" && "v2-down")}>
            {stat.spoken ? (
              <>
                <span aria-hidden="true">{stat.value}</span>
                <span className="v2-sr">{stat.spoken}</span>
              </>
            ) : (
              stat.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** A thin violet-to-teal bar. `value` is 0..1. */
export function Meter({ value, label, className }: { value: number; label: string; className?: string }) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 100;
  return (
    <div
      className={cx("v2-meter", className)}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <span style={{ "--v2-value": `${pct}%` } as CSSProperties} />
    </div>
  );
}

/* ----------------------------------------------------------------------------- buttons */

export type PillVariant = "primary" | "glass" | "ghost";
export type PillSize = "sm" | "md" | "lg";

/** The class string for a pill, for elements these helpers don't render (RandomChog, a form's submit). */
export function pillClass(variant: PillVariant = "primary", size: PillSize = "md", block = false): string {
  return cx(`v2-btn-${variant}`, size !== "md" && `v2-btn--${size}`, block && "v2-btn--block");
}

type PillLinkProps = {
  href: string;
  children: ReactNode;
  variant?: PillVariant;
  size?: PillSize;
  block?: boolean;
  /** Trailing arrow. */
  arrow?: boolean;
  /** Opens off-site in a new tab (explorer links). */
  external?: boolean;
  className?: string;
  "aria-label"?: string;
};

/** A pill-shaped link: violet gradient (primary), dark glass (glass) or bare (ghost). */
export function PillLink({ href, children, variant, size, block, arrow, external, className, ...rest }: PillLinkProps) {
  const classes = cx(pillClass(variant, size, block), className);
  const content = (
    <>
      {children}
      {arrow && <ArrowRightIcon className="v2-btn-icon" />}
    </>
  );
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={classes} {...rest}>
        {content}
      </a>
    );
  }
  return (
    <Link href={href} className={classes} {...rest}>
      {content}
    </Link>
  );
}

type PillButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: PillVariant;
  size?: PillSize;
  block?: boolean;
  arrow?: boolean;
};

/** A pill-shaped <button> (type="button" unless given). Pass onClick from a client component. */
export function PillButton({ variant, size, block, arrow, className, children, type = "button", ...rest }: PillButtonProps) {
  return (
    <button type={type} className={cx(pillClass(variant, size, block), className)} {...rest}>
      {children}
      {arrow && <ArrowRightIcon className="v2-btn-icon" />}
    </button>
  );
}

/* ----------------------------------------------------------------------------- labels */

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "teal" | "violet";

/** Small status capsule (uppercase). `dot` adds a glowing point; `live` makes it pulse (motion-safe). */
export function Badge({
  children,
  tone = "neutral",
  dot,
  live,
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  dot?: boolean;
  live?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "v2-badge",
        tone !== "neutral" && `v2-badge--${tone}`,
        (dot || live) && "v2-badge--dot",
        live && "v2-badge--live",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A quiet glass tag (sentence case): traits, filters, metadata. Pass `href` for a link chip. */
export function Chip({
  children,
  href,
  active,
  className,
}: {
  children: ReactNode;
  href?: string;
  active?: boolean;
  className?: string;
}) {
  const classes = cx("v2-chip", active && "is-active", className);
  if (href) {
    return (
      <Link href={href} className={classes} aria-current={active ? "true" : undefined}>
        {children}
      </Link>
    );
  }
  return <span className={classes}>{children}</span>;
}

/* ----------------------------------------------------------------------------- tabs */

export type TabLinkItem = { href: string; label: ReactNode; count?: ReactNode; active?: boolean };

/**
 * Link tabs as a glass segmented control (window pickers, sub-views). For client-side state tabs use
 * the same classes: <div className="v2-tabs" role="tablist"><button className="v2-tab" aria-selected>.
 */
export function TabLinks({ items, label, className }: { items: readonly TabLinkItem[]; label: string; className?: string }) {
  return (
    <nav aria-label={label} className={cx("v2-tabs", className)}>
      {items.map((item) => (
        <Link key={item.href} href={item.href} className="v2-tab" aria-current={item.active ? "page" : undefined}>
          {item.label}
          {item.count != null && <span className="v2-tab-count">{item.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

/* ----------------------------------------------------------------------------- states */

type EmptyStateProps = {
  icon?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

/** Nothing here yet: dashed glass, a teal icon tile, one sentence and the way forward. */
export function EmptyState({ icon, title, body, actions, className }: EmptyStateProps) {
  return (
    <div className={cx("v2-empty", className)}>
      {icon != null && <IconTile size="lg">{icon}</IconTile>}
      <p className="v2-empty-title">{title}</p>
      {body != null && <p className="v2-empty-body">{body}</p>}
      {actions != null && <div className="v2-empty-actions">{actions}</div>}
    </div>
  );
}

/** Loading placeholder with a shimmer (static under reduced motion). Size it with style or utilities. */
export function Skeleton({
  variant = "block",
  className,
  style,
}: {
  variant?: "block" | "text" | "title" | "circle" | "card";
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden="true"
      className={cx("v2-skeleton", variant !== "block" && `v2-skeleton--${variant}`, className)}
      style={style}
    />
  );
}

/** A faded hairline; with `label`, the hero's tracked-caps "BUILT ON" style label in the middle. */
export function Divider({ label, className }: { label?: ReactNode; className?: string }) {
  if (label != null) {
    return (
      <div role="separator" className={cx("v2-divider v2-divider--label", className)}>
        {label}
      </div>
    );
  }
  return <hr className={cx("v2-divider", className)} />;
}

type ToastProps = {
  title: ReactNode;
  children?: ReactNode;
  tone?: "info" | "success" | "warning" | "danger";
  /** A close button or an undo link, from a client component. */
  action?: ReactNode;
  className?: string;
};

/**
 * A toast panel. Put it in a <div className="v2-toast-region" aria-live="polite"> for the fixed
 * bottom-right stack, or render it inline as a banner.
 */
export function Toast({ title, children, tone = "info", action, className }: ToastProps) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cx("v2-toast", tone !== "info" && `v2-toast--${tone}`, className)}
    >
      <div>
        <span className="v2-toast-title">{title}</span>
        {children}
      </div>
      {action ?? <span />}
    </div>
  );
}
