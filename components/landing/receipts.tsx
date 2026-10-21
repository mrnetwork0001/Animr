import { Suspense } from "react";
import { receipts } from "./content";
import { LatestDecision, LatestDecisionFallback } from "./latest-decision";
import { Section } from "./primitives";
import { Rich } from "./rich";

/**
 * Decisions on 0G Compute, each LLM call with its receipt and provider label; the fallback and guardrails behind them.
 * The card is the newest real AI decision, read per request (latest-decision.tsx), so it streams in after the shell.
 */
export function Receipts() {
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

        {/* The reveal sits on a wrapper in the static shell: the card itself streams in later (landing-motion.tsx). */}
        <div className="lp-decision-slot lp-reveal">
          <Suspense fallback={<LatestDecisionFallback />}>
            <LatestDecision />
          </Suspense>
        </div>
      </div>
    </Section>
  );
}
