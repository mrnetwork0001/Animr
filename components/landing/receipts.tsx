import { ChogImage } from "./chog-image";
import { builtOn, labels, receipts, showcaseIds, thought } from "./content";
import { Icon } from "./icons";
import { Section, StyleBadge } from "./primitives";
import { Rich } from "./rich";
import { type ShowcaseChog, showcaseChog } from "./showcase";

/** Decisions on 0G Compute, each LLM call with its receipt and provider label; the fallback and guardrails behind them. */
export function Receipts() {
  const chog = showcaseChog(showcaseIds.receipt);
  return (
    <Section id={receipts.id} eyebrow={receipts.eyebrow} title={receipts.title} lede={receipts.lede}>
      <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:gap-14">
        <ul className="space-y-4">
          {receipts.points.map((point) => (
            <li key={point.title} className="landing-reveal flex gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent-strong ring-1 ring-accent/25 ring-inset">
                <Icon name={point.icon} className="size-5" />
              </span>
              <div>
                <h3 className="font-semibold tracking-tight">{point.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-pretty text-muted">
                  <Rich text={point.body} />
                </p>
              </div>
            </li>
          ))}
        </ul>

        {chog && <DecisionCard chog={chog} />}
      </div>

      <BuiltOn />
    </Section>
  );
}

/**
 * A real AI thought in the style of the app's feed (components/decision-feed.tsx), plus the receipt
 * fields stored with every LLM decision. No made-up numbers: the receipt rows that aren't real values
 * describe the field instead, and nothing here claims "TEE verified".
 */
function DecisionCard({ chog }: { chog: ShowcaseChog }) {
  const { card } = receipts;
  return (
    <div className="landing-reveal">
      <div className="card p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <ChogImage
            src={chog.image.src}
            fallbackSrc={chog.image.fallbackSrc}
            alt={chog.label}
            size={80}
            fallbackLabel={`#${chog.tokenId}`}
            className="size-10 shrink-0 rounded-xl"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {chog.name} <span className="font-normal text-subtle">· {chog.label}</span>
            </p>
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
              {card.title} · {chog.archetype}
              <StyleBadge style={chog.style} className="py-0 text-[10px]" />
            </p>
          </div>
          <span className="ml-auto shrink-0 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-[11px] font-medium text-accent-strong">
            {card.badge}
          </span>
        </div>

        <article className="mt-4 rounded-xl border border-line bg-surface-2/40 p-4">
          <span className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-xs font-semibold tracking-wider text-muted uppercase ring-1 ring-line ring-inset">
            {thought.action}
          </span>
          <p className="mt-3 text-sm leading-relaxed text-foreground">{thought.text}</p>
          <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-subtle">
            <div className="flex gap-1.5">
              <dt>{card.decidedByLabel}</dt>
              <dd className="text-muted">{labels.decidedBy}</dd>
            </div>
          </dl>
          <p className="mt-1.5 text-[11px] text-subtle">{thought.source}</p>
        </article>

        {/* The receipt: monospace values; field descriptions in plain italics. */}
        <div className="relative mt-4 rounded-xl border border-line bg-background/60 px-4 pt-4 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p className="flex items-center gap-2 text-xs font-semibold tracking-wider text-accent-strong uppercase">
              <Icon name="receipt" className="size-4" />
              {card.receiptTitle}
            </p>
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-success">
              <Icon name="check" className="size-3.5" strokeWidth={2.5} />
              {card.stored}
            </span>
          </div>
          <dl className="mt-3 divide-y divide-dashed divide-line text-xs">
            {card.receipt.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-4 py-2">
                <dt className="font-mono text-subtle">{row.label}</dt>
                <dd className={row.field ? "text-right text-muted italic" : "font-mono text-foreground tabular-nums"}>
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-subtle">{card.note}</p>
    </div>
  );
}

function BuiltOn() {
  return (
    <div className="landing-reveal mt-16">
      <h3 className="text-center text-xs font-semibold tracking-[0.16em] text-subtle uppercase">{builtOn.title}</h3>
      <ul className="mt-5 flex flex-wrap justify-center gap-3">
        {builtOn.items.map((item) => (
          <li key={item.name} className="rounded-xl border border-line bg-surface/70 px-4 py-3 text-center">
            <p className="text-sm font-semibold text-foreground">{item.name}</p>
            <p className="mt-0.5 text-xs text-muted">{item.role}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
