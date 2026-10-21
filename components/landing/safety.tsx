import Link from "next/link";
import { labels, links, safety } from "./content";
import { FlowDiagram } from "./flow-diagram";
import { HouseChogCard } from "./house-status";
import { Icon } from "./icons";
import { Section, StatusBadge } from "./primitives";
import { Rich } from "./rich";
import { type GuardLink, guardLink, houseChog } from "./showcase";

/** AnimrTradeGuard, live on Monad: the deployment, the House Chog (live state read in the browser), real vs simulated, and the rules. */
export function Safety() {
  const guard = guardLink();
  const house = houseChog();
  return (
    <Section id={safety.id} eyebrow={safety.eyebrow} title={safety.title} lede={safety.lede}>
      <div className="mt-12 grid gap-4 md:grid-cols-2">
        <Deployed guard={guard} />
        <HouseChogCard house={house && { label: house.label, name: house.name }} />
      </div>

      <RealVsSimulated />

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
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
    <div className="landing-reveal flex flex-col gap-3 rounded-2xl border border-success/25 bg-success/5 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusBadge status="live" label={deployed.label} />
        <span className="font-mono text-xs text-muted">Monad mainnet</span>
      </div>
      <h3 className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
        <Icon name="shield" className="size-5 text-success" />
        {deployed.title}
      </h3>
      <p className="text-sm leading-relaxed text-pretty text-muted">{deployed.text}</p>
      {guard && (
        <p className="font-mono text-xs break-all text-foreground sm:text-sm">
          {guard.href ? (
            <a
              href={guard.href}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded underline decoration-line-strong underline-offset-4 transition-colors hover:text-accent-strong hover:decoration-accent"
            >
              {guard.address}
              <span className="sr-only"> ({labels.explorerHint})</span>
            </a>
          ) : (
            guard.address
          )}
        </p>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 text-sm font-semibold">
        {guard?.href && (
          <a
            href={guard.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-accent-strong hover:underline"
          >
            {deployed.explorer}
            <Icon name="external" className="size-4" strokeWidth={2} />
            <span className="sr-only"> ({labels.newTab})</span>
          </a>
        )}
        <Link href={links.guard} className="inline-flex items-center gap-1.5 text-muted transition-colors hover:text-foreground">
          {deployed.status}
          <Icon name="arrowRight" className="size-4" strokeWidth={2} />
        </Link>
      </div>
    </div>
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
    <div className="landing-reveal card mt-4 overflow-hidden">
      <h3 className="border-b border-line px-5 py-4 text-lg font-semibold tracking-tight sm:px-6">{realVsSim.title}</h3>
      <div className="grid md:grid-cols-2">
        {columns.map((column, index) => (
          <div key={column.label} className={`p-5 sm:p-6 ${index > 0 ? "border-t border-line md:border-t-0 md:border-l" : ""}`}>
            <StatusBadge status={column.status} label={column.label} />
            <ul className="mt-4 space-y-2.5">
              {column.items.map((item) => (
                <li key={item} className="flex gap-3 text-sm leading-relaxed text-pretty text-muted">
                  <span
                    aria-hidden
                    className={`mt-[0.55rem] size-1.5 shrink-0 rounded-full ${column.status === "live" ? "bg-success" : "bg-accent-strong"}`}
                  />
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
    <div className="landing-reveal card flex-1 p-6 sm:p-7">
      <h3 className="text-sm font-semibold tracking-wider text-success uppercase">{safety.can.title}</h3>
      <ul className="mt-4 space-y-3">
        {safety.can.items.map((item) => (
          <li key={item} className="flex gap-3 text-sm leading-relaxed text-foreground">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
              <Icon name="check" className="size-3.5" strokeWidth={2.5} />
            </span>
            {item}
          </li>
        ))}
      </ul>
      <h3 className="mt-8 text-sm font-semibold tracking-wider text-danger uppercase">{safety.cannot.title}</h3>
      <ul className="mt-4 space-y-3">
        {safety.cannot.items.map((item) => (
          <li key={item} className="flex gap-3 text-sm leading-relaxed text-muted">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-danger/15 text-danger">
              <Icon name="x" className="size-3.5" strokeWidth={2.5} />
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
    <div className="landing-reveal card relative flex flex-col p-6 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
          <Icon name="shield" className="size-5 text-accent-strong" />
          {safety.checklistTitle}
        </h3>
        <StatusBadge status="live" />
      </div>
      <ul className="mt-5 flex-1 space-y-3.5">
        {safety.checklist.map((item) => (
          <li key={item} className="flex gap-3 text-sm leading-relaxed text-pretty text-muted">
            <Icon name="lock" className="mt-0.5 size-4 text-accent-strong" />
            <span>
              <Rich text={item} />
            </span>
          </li>
        ))}
      </ul>
      {guard && (
        <p className="mt-6 flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-xl border border-line bg-surface-2/60 px-4 py-3 text-sm text-foreground">
          <Icon name="check" className="size-4 text-success" strokeWidth={2.5} />
          AnimrTradeGuard on Monad mainnet:
          {guard.href ? (
            <a
              href={guard.href}
              target="_blank"
              rel="noopener noreferrer"
              title={guard.address}
              className="font-mono text-accent-strong hover:underline"
            >
              {guard.short} ↗<span className="sr-only"> ({labels.explorerHint})</span>
            </a>
          ) : (
            <span className="font-mono">{guard.short}</span>
          )}
        </p>
      )}
    </div>
  );
}
