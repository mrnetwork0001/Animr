import Link from "next/link";
import { ArrowRightIcon, ExternalIcon, GuardIcon, IconTile, StatRow } from "@/components/v2";
import { labels, links, safety } from "./content";
import { FlowDiagram } from "./flow-diagram";
import { HouseChogCard } from "./house-status";
import { Icon } from "./icons";
import { Section, StatusBadge } from "./primitives";
import { Rich } from "./rich";
import { type GuardLink, guardLink, houseChog } from "./showcase";

/** AnimrTradeGuard, live on Monad: the deployment, the House Chog (live state read in the browser), real vs simulated, and the rules. */
export function Safety({ index }: { index?: number }) {
  const guard = guardLink();
  const house = houseChog();
  return (
    <Section id={safety.id} index={index} kicker={safety.eyebrow} title={safety.title} lede={safety.lede}>
      <div className="lp-grid-2">
        <Deployed guard={guard} />
        <HouseChogCard house={house && { label: house.label, name: house.archetype }} />
      </div>

      <RealVsSimulated />

      <div className="lp-rules-row">
        <Permissions />
        <Checklist guard={guard} />
      </div>

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
      <div className="lp-card-titlerow">
        <IconTile size="lg">
          <GuardIcon />
        </IconTile>
        <div>
          <p className="v2-kicker">AnimrTradeGuard</p>
          <h3 id="guard-deployed-title" className="lp-card-h3">
            {deployed.title}
          </h3>
        </div>
      </div>
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

/** What the AI's key can and can't do through the guard. */
function Permissions() {
  return (
    <div className="v2-card lp-perms lp-reveal">
      <h3 className="lp-perms-title lp-perms-title--can">{safety.can.title}</h3>
      <ul className="lp-perm-list">
        {safety.can.items.map((item) => (
          <li key={item}>
            <span className="lp-perm-mark lp-perm-mark--can">
              <Icon name="check" className="lp-perm-icon" strokeWidth={2.5} />
            </span>
            {item}
          </li>
        ))}
      </ul>
      <h3 className="lp-perms-title lp-perms-title--cannot">{safety.cannot.title}</h3>
      <ul className="lp-perm-list lp-perm-list--muted">
        {safety.cannot.items.map((item) => (
          <li key={item}>
            <span className="lp-perm-mark lp-perm-mark--cannot">
              <Icon name="x" className="lp-perm-icon" strokeWidth={2.5} />
            </span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The rules AnimrTradeGuard enforces on-chain. */
function Checklist({ guard }: { guard: GuardLink | null }) {
  return (
    <div className="v2-card lp-checklist lp-reveal">
      <div className="lp-checklist-head">
        <h3 className="lp-card-h3">{safety.checklistTitle}</h3>
        <StatusBadge status="live" />
      </div>
      <ol className="lp-numbered">
        {safety.checklist.map((item) => (
          <li key={item}>
            <span>
              <Rich text={item} />
            </span>
          </li>
        ))}
      </ol>
      {guard && (
        <p className="lp-checklist-foot">
          <Icon name="check" className="lp-check-icon" strokeWidth={2.5} />
          AnimrTradeGuard on Monad mainnet:
          {guard.href ? (
            <a href={guard.href} target="_blank" rel="noopener noreferrer" title={guard.address} className="lp-mono-link">
              {guard.short} ↗<span className="v2-sr"> ({labels.explorerHint})</span>
            </a>
          ) : (
            <span className="v2-mono">{guard.short}</span>
          )}
        </p>
      )}
    </div>
  );
}
