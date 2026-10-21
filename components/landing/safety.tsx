import Link from "next/link";
import { ArrowRightIcon, ExternalIcon, StatRow } from "@/components/v2";
import { labels, links, safety } from "./content";
import { FlowDiagram } from "./flow-diagram";
import { HouseChogCard } from "./house-status";
import { Section, StatusBadge } from "./primitives";
import { type GuardLink, guardLink, houseChog } from "./showcase";

/**
 * AnimrTradeGuard, live on Monad: the deployment, the House Chog (only once its vault is open, read in the browser),
 * what's real and what's simulated, and the flow. The guard's full rule list lives on /guard.
 */
export function Safety() {
  const guard = guardLink();
  const house = houseChog();
  return (
    <Section id={safety.id} title={safety.title} lede={safety.lede}>
      {/* The guard card spans the row on its own until the House Chog card renders beside it (landing.css). */}
      <div className="lp-grid-2 lp-safety-cards">
        <Deployed guard={guard} />
        <HouseChogCard house={house && { label: house.label, name: house.name }} />
      </div>

      <RealVsSimulated />

      <FlowDiagram />
    </Section>
  );
}

function Deployed({ guard }: { guard: GuardLink | null }) {
  const { deployed } = safety;
  return (
    <article className="v2-card v2-card--feature lp-deployed lp-reveal" aria-labelledby="guard-deployed-title">
      <div className="lp-card-status">
        <StatusBadge status="live" label={deployed.label} />
        <span className="lp-card-status-note">{deployed.network}</span>
      </div>
      <h3 id="guard-deployed-title" className="lp-card-h3 lp-card-title">
        {deployed.title}
      </h3>
      <p className="lp-card-p">{deployed.text}</p>
      <StatRow size="sm" inline className="lp-house-limits" stats={deployed.facts} />
      {guard && (
        <p className="lp-address">
          <span className="v2-overline">Contract</span>
          {guard.href ? (
            <a href={guard.href} target="_blank" rel="noopener noreferrer" className="lp-address-link">
              {guard.address}
              <span className="v2-sr"> ({labels.explorerHint})</span>
            </a>
          ) : (
            <span className="lp-address-link">{guard.address}</span>
          )}
        </p>
      )}
      <div className="lp-card-actions">
        {guard?.href && (
          <a href={guard.href} target="_blank" rel="noopener noreferrer" className="v2-btn-glass v2-btn--sm">
            {deployed.explorer}
            <ExternalIcon className="v2-btn-icon" />
            <span className="v2-sr"> ({labels.newTab})</span>
          </a>
        )}
        <Link href={links.guard} className="v2-btn-ghost v2-btn--sm">
          {deployed.status}
          <ArrowRightIcon className="v2-btn-icon" />
        </Link>
      </div>
    </article>
  );
}

/** Two honest columns: what runs on Monad mainnet, and what is replayed on real data. */
function RealVsSimulated() {
  const { realVsSim } = safety;
  const columns = [
    { status: "live" as const, ...realVsSim.real },
    { status: "simulated" as const, ...realVsSim.simulated },
  ];
  return (
    <div className="v2-card v2-card--flush lp-realsim lp-reveal">
      <h3 className="lp-realsim-title">{realVsSim.title}</h3>
      <div className="lp-realsim-cols">
        {columns.map((column) => (
          <div key={column.label} className="lp-realsim-col">
            <StatusBadge status={column.status} label={column.label} />
            <ul className="lp-dots">
              {column.items.map((item) => (
                <li key={item} className={column.status === "live" ? "lp-dot--live" : "lp-dot--sim"}>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
