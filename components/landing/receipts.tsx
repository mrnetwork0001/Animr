import { SparkIcon } from "@/components/v2";
import { ChogImage } from "./chog-image";
import { labels, receipts, showcaseIds, thought } from "./content";
import { Icon } from "./icons";
import { Section, StyleBadge } from "./primitives";
import { Rich } from "./rich";
import { type ShowcaseChog, showcaseChog } from "./showcase";

/** Decisions on 0G Compute, each LLM call with its receipt and provider label; the fallback and guardrails behind them. */
export function Receipts() {
  const chog = showcaseChog(showcaseIds.receipt);
  return (
    <Section id={receipts.id} title={receipts.title} lede={receipts.lede}>
      <div className="lp-receipts">
        <ul className="lp-points">
          {receipts.points.map((point) => (
            <li key={point.title} className="lp-reveal">
              <h3 className="lp-point-title">{point.title}</h3>
              <p className="lp-card-p">
                <Rich text={point.body} />
              </p>
            </li>
          ))}
        </ul>

        {chog && <DecisionCard chog={chog} />}
      </div>
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
    <div className="v2-card lp-decision lp-reveal">
      <div className="lp-decision-head">
        <ChogImage
          src={chog.image.src}
          fallbackSrc={chog.image.fallbackSrc}
          alt={chog.label}
          size={96}
          fallbackLabel={`#${chog.tokenId}`}
          className="lp-avatar"
        />
        <div className="lp-min0 lp-grow">
          <p className="lp-decision-name">
            {chog.name} <span className="lp-faint">· {chog.label}</span>
          </p>
          <p className="lp-decision-sub">
            {card.title} · {chog.archetype}
            <StyleBadge style={chog.style} />
          </p>
        </div>
        <span className="v2-badge v2-badge--violet lp-hide-xs">{card.badge}</span>
      </div>

      <article className="lp-thought">
        <div className="lp-thought-head">
          <span className="v2-badge">{thought.action}</span>
          <SparkIcon className="lp-thought-spark" />
        </div>
        <p className="lp-thought-text">{thought.text}</p>
        <dl className="lp-thought-meta">
          <div>
            <dt>{card.decidedByLabel}</dt>
            <dd>{labels.decidedBy}</dd>
          </div>
        </dl>
        <p className="lp-card-note">{thought.source}</p>
      </article>

      {/* The receipt: monospace values; field descriptions in plain italics. */}
      <div className="lp-receipt">
        <div className="lp-receipt-head">
          <p className="lp-receipt-title">
            <Icon name="receipt" className="lp-receipt-icon" strokeWidth={1.6} />
            {card.receiptTitle}
          </p>
          <span className="lp-receipt-stored">
            <Icon name="check" className="lp-check-icon" strokeWidth={2.5} />
            {card.stored}
          </span>
        </div>
        <dl className="lp-receipt-rows">
          {card.receipt.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd className={row.field ? "lp-receipt-field" : "lp-receipt-value"}>{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
