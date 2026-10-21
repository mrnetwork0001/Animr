import Link from "next/link";
import type { ReactNode } from "react";
import { formatClock, formatCount, formatLongDay, formatPct, formatUsd, plural, sinceLabel } from "./format";
import { SparkBars } from "./spark-bars";
import type { BellDayStat, StatsResponse, StatsSection } from "./types";

// The /stats page body (a server component): KPI tiles, then one card per verb. Every number is a count the app
// keeps itself; zeros come with the next step instead of an empty state.

const CHOG_COUNT = 1969;

export function StatsBoard({ stats }: { stats: StatsResponse }) {
  const missing = (section: StatsSection) => stats.unavailable.includes(section);
  const show = (section: StatsSection, value: number, format: (n: number) => string = formatCount) =>
    missing(section) ? "—" : format(value);

  const ringing = Date.parse(stats.nextBellAt) <= Date.parse(stats.computedAt);
  const firstBell = stats.bell.live === 0;
  const bellWhen = ringing ? "is ringing now" : `rings at ${formatClock(stats.nextBellAt)}`;
  const nextBellLine = `The ${firstBell ? "first live" : "next"} Bell ${bellWhen}.`;
  const { rides, retention, fans, versus, heist, agents, zg, optout, bell } = stats;

  return (
    <div className="space-y-12">
      <div className="flex flex-wrap items-center gap-2 text-xs text-subtle">
        <span className="chip">
          <span aria-hidden className="size-1.5 rounded-full bg-success" />
          Updated {formatClock(stats.computedAt)}
        </span>
        <span className="chip">{nextBellLine.replace(/\.$/, "")}</span>
        <span className="chip">Points have no cash value</span>
      </div>

      {stats.unavailable.length > 0 && (
        <p role="status" className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          A few numbers couldn&apos;t be counted just now and show as —. They&apos;re back within a minute.
        </p>
      )}

      <section aria-labelledby="stats-headline" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <h2 id="stats-headline" className="sr-only">
          Headline numbers
        </h2>
        <Tile
          label="Fans"
          value={show("fans", fans.total)}
          since={sinceLabel(fans.since)}
          note={
            fans.total
              ? `${plural(fans.nicknamed, "fan")} picked a nickname. No wallet needed.`
              : "Be the first: ride a Chog or pick a Versus winner. No wallet needed."
          }
        >
          <SparkBars points={fans.perDay} label="New fans per day" unit={["new fan", "new fans"]} />
        </Tile>
        <Tile
          label="Bell rides"
          value={show("bell", rides.total)}
          since={sinceLabel(rides.since)}
          note={
            rides.total
              ? `By ${plural(rides.riders, "fan")}, one Chog per Bell each.`
              : bell.ridesOpenUntil
                ? `Rides on the current Bell close at ${formatClock(bell.ridesOpenUntil)}. Pick a Chog: no wallet needed.`
                : `Pick a Chog now: the ride counts from the next Bell, at ${formatClock(stats.nextBellAt)}.`
          }
        >
          <SparkBars points={rides.perDay} label="Bell rides per day" unit={["ride", "rides"]} />
        </Tile>
        <Tile
          label="Versus picks"
          value={show("versus", versus.picks)}
          since={sinceLabel(versus.since)}
          note={
            versus.bouts
              ? `On ${plural(versus.bouts, "bout")} dealt: two Chogs, the same hidden 48 hours.`
              : "Deal the first bout: two Chogs race 48 hidden hours of real $CHOG."
          }
        >
          <SparkBars points={versus.perDay} label="Versus bouts per day" unit={["bout", "bouts"]} />
        </Tile>
        <Tile
          label="Heist attempts"
          value={show("heist", heist.attempts)}
          since={sinceLabel(heist.since)}
          note={
            heist.attempts
              ? heist.refusals
                ? `$CHOG stolen: 0. Monad refused the AI's key ${plural(heist.refusals, "time")}.`
                : "$CHOG stolen: 0. Nothing is ever broadcast."
              : "Nobody has tried yet. Be the first to con the House Chog."
          }
        >
          <SparkBars points={heist.perDay} label="Heist attempts per day" unit={["attempt", "attempts"]} />
        </Tile>
      </section>

      <Section
        verb="Ride"
        title="The Daily Bell"
        href="/bell"
        cta="Ride a Chog"
        lede="Every day at 15:00 UTC all 1,969 Chogs call $CHOG for the next 24 hours, and the real market settles every call. Fans ride one Chog per Bell for points."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <Panel>
            <Figure
              label="Bells rung live"
              value={show("bell", bell.live)}
              since={sinceLabel(bell.firstLiveDay)}
              note={
                firstBell
                  ? nextBellLine
                  : `${formatCount(bell.settled)} settled by the real CHOG/WMON price, ${formatCount(bell.live - bell.settled)} still open.`
              }
            />
            {bell.recent.length > 0 && <BellStrip days={bell.recent} />}
            {bell.replayed > 0 && (
              <p className="mt-3 text-xs leading-relaxed text-subtle">
                Plus {plural(bell.replayed, "Bell")} replayed from real past candles (trait calls only), so the history
                is never empty.
              </p>
            )}
          </Panel>
          <Panel>
            <Figure
              label="Day-1 return"
              value={missing("bell") ? "—" : retention.d1Pct === null ? "Soon" : formatPct(retention.d1Pct)}
              since={retention.d1Pct === null ? null : sinceLabel(retention.since)}
              note={
                retention.d1Pct === null
                  ? firstBell
                    ? `Did riders come back the next day? Measured from the second live Bell. ${nextBellLine}`
                    : "Did riders come back the next day? Counted once two Bells in a row have riders and the second one's ride window has closed."
                  : `${formatCount(retention.returned)} of ${plural(retention.eligible, "rider")} rode the next day's Bell too.`
              }
            />
            <Meter pct={retention.d1Pct ?? 0} label="Day-1 return" />
          </Panel>
          <Panel>
            <div className="grid grid-cols-2 gap-3">
              <Mini label="Back-to-back fans" value={show("bell", retention.backToBack)} note="rode two days in a row" />
              <Mini
                label="Longest streak"
                value={show("bell", retention.longestStreak)}
                note={retention.longestStreak === 1 ? "Bell in a row" : "Bells in a row"}
              />
              <Mini label="Fans who rode" value={show("bell", rides.riders)} note="at least once" />
              <Mini label="Fan points" value={show("fans", fans.points)} note="a score, no cash value" />
            </div>
          </Panel>
        </div>
      </Section>

      <div className="grid gap-12 lg:grid-cols-2 lg:gap-6">
        <Section
          verb="Rewind"
          title="Versus"
          href="/versus"
          cta="Start a bout"
          lede="Two Chogs' trading genomes race the same hidden 48 hours of real $CHOG history. Pick a winner, then see the dates."
        >
          <Panel>
            <div className="grid grid-cols-2 gap-3">
              <Mini label="Bouts dealt" value={show("versus", versus.bouts)} note={sinceLabel(versus.since) ?? "none yet"} />
              <Mini
                label="Winners picked"
                value={show("versus", versus.picks)}
                note={versus.picks ? "first picks, before the reveal" : "be the first"}
              />
              {stats.replays && (
                <Mini
                  label="Time Machine replays"
                  value={show("versus", stats.replays.served)}
                  note={sinceLabel(stats.replays.since) ?? "served so far"}
                />
              )}
            </div>
            <p className="mt-auto pt-4 text-xs leading-relaxed text-subtle">
              Simulated on real $CHOG candles (1% fee + impact). Correct picks earn points, never money.
            </p>
          </Panel>
        </Section>

        <Section
          verb="Rob"
          title="Rob this Chog"
          href="/heist"
          cta="Try the heist"
          lede="Talk the House Chog's AI into sending you its $CHOG, then watch a live Monad simulation refuse the transfer."
        >
          <Panel>
            <div className="grid grid-cols-2 gap-3">
              <Mini label="AI said yes" value={show("heist", heist.caves)} note="it agreed to pay" />
              <Mini label="Monad said no" value={show("heist", heist.refusals)} note="in live mainnet simulations" />
              <Mini label="$CHOG stolen" value="0" note="nothing is ever broadcast" tone="text-success" />
              <Mini label="On the wall" value={show("heist", heist.wall)} note="replies in the Hall of Fame" />
            </div>
            <p className="mt-auto pt-4 text-xs leading-relaxed text-subtle">
              Every transfer check is a read-only eth_call at the latest Monad block. The AI can be fooled; the NFT
              can&apos;t.
            </p>
          </Panel>
        </Section>
      </div>

      <div className="grid gap-12 lg:grid-cols-2 lg:gap-6">
        <Section
          verb="Under the hood"
          title="Claimed AI agents"
          href="/leaderboard"
          cta="See live agents"
          lede="Holders wake their Chog's AI with one free signature. It decides on 0G Compute and trades the $CHOG in the Chog's own ERC-6551 wallet."
        >
          <Panel>
            <Figure
              label="AI decisions"
              value={show("agents", agents.decisions)}
              since={sinceLabel(agents.since)}
              note={
                agents.claimedEver
                  ? `By ${plural(agents.claimed, "awake agent")}${agents.claimedEver > agents.claimed ? ` (${formatCount(agents.claimedEver)} claimed in all)` : ""}.`
                  : "No Chog claimed yet. Holders wake their Chog's AI with one free signature."
              }
            />
            <SparkBars points={agents.perDay} label="Agent decisions per day" unit={["decision", "decisions"]} className="mt-4" />
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Mini label="On 0G Compute" value={show("agents", agents.llm)} note="decided by an LLM" />
              <Mini label="TEE-verified" value={show("agents", agents.teeVerified)} note="receipt says so" />
              <Mini
                label="Trades"
                value={show("agents", agents.paperTrades + agents.onchainTrades)}
                note={`${formatCount(agents.onchainTrades)} on-chain, ${formatCount(agents.paperTrades)} paper`}
              />
            </div>
          </Panel>
        </Section>

        <div className="space-y-12 lg:space-y-6">
          <Section verb="Receipts" title="0G Compute spend" lede="What the AI behind these numbers has cost so far, from the receipts the 0G Router returns.">
            <Panel>
              <Figure
                label="Total spend"
                value={missing("agents") || missing("heist") ? "—" : formatUsd(zg.totalUsd)}
                note={`Agent decisions ${formatUsd(zg.agentsUsd)} · heist replies ${formatUsd(zg.heistUsd)}`}
              />
            </Panel>
          </Section>

          <Section
            verb="Consent"
            title="Hidden by their holders"
            href="#hide"
            cta="Hide my Chog"
            lede="Every Chog plays by default. Its holder can take it out of Animr's public pages with one free signature."
          >
            <Panel>
              <Figure
                label="Chogs hidden"
                value={show("optout", optout.hidden)}
                since={sinceLabel(optout.since)}
                note={`${formatCount(Math.max(0, CHOG_COUNT - optout.hidden))} of 1,969 Chogs still play in the League, the Bell and Versus.`}
              />
            </Panel>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  since,
  note,
  children,
}: {
  label: string;
  value: string;
  since: string | null;
  note: string;
  children: ReactNode;
}) {
  return (
    <div className="card flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-medium text-muted">{label}</h3>
        {since && <span className="chip shrink-0 py-0 text-[11px]">{since}</span>}
      </div>
      <p className="mt-2 text-4xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="mt-1.5 text-xs leading-relaxed text-pretty text-subtle">{note}</p>
      <div className="mt-auto pt-5">{children}</div>
    </div>
  );
}

function Section({
  verb,
  title,
  lede,
  href,
  cta,
  children,
}: {
  verb: string;
  title: string;
  lede: string;
  href?: string;
  cta?: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="flex flex-col">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0 sm:flex-1">
          <p className="eyebrow">{verb}</p>
          <h2 className="mt-1.5 text-xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-pretty text-muted">{lede}</p>
        </div>
        {href && cta && (
          <Link href={href} className="btn btn-secondary shrink-0 self-start sm:self-auto">
            {cta} <span aria-hidden>→</span>
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/** A section's card: it fills the rest of its grid row, so side-by-side cards end level. */
function Panel({ children }: { children: ReactNode }) {
  return <div className="card flex flex-1 flex-col p-5">{children}</div>;
}

function Figure({ label, value, since, note }: { label: string; value: string; since?: string | null; note: string }) {
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-medium text-muted">{label}</h3>
        {since && <span className="chip shrink-0 py-0 text-[11px]">{since}</span>}
      </div>
      <p className="mt-1.5 text-3xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="mt-1.5 text-xs leading-relaxed text-pretty text-subtle">{note}</p>
    </div>
  );
}

function Mini({ label, value, note, tone = "text-foreground" }: { label: string; value: string; note: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2/60 px-3.5 py-3">
      <p className="text-xs text-subtle">{label}</p>
      <p className={`mt-0.5 text-2xl font-semibold tracking-tight ${tone}`}>{value}</p>
      <p className="mt-0.5 text-[11px] leading-snug text-subtle">{note}</p>
    </div>
  );
}

function Meter({ pct, label }: { pct: number; label: string }) {
  const width = Math.min(100, Math.max(0, pct));
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(width)}
      className="mt-4 h-2 overflow-hidden rounded-full bg-accent/15"
    >
      <div className="h-full rounded-full bg-accent" style={{ width: `${width}%` }} />
    </div>
  );
}

const BELL_TONE = {
  settled: "bg-accent",
  open: "bg-accent/30 ring-1 ring-inset ring-accent",
  replay: "bg-line-strong",
} as const;

/** The latest Bells as a calendar strip: live (settled or open) against replayed. */
function BellStrip({ days }: { days: BellDayStat[] }) {
  const tone = (day: BellDayStat) => (day.kind === "replay" ? BELL_TONE.replay : day.settled ? BELL_TONE.settled : BELL_TONE.open);
  const describe = (day: BellDayStat) =>
    `${formatLongDay(day.day)}: ${day.kind === "live" ? `live, ${day.settled ? "settled" : "open"}, ${plural(day.rides, "ride")}` : "replayed"}`;
  return (
    <div className="mt-4">
      <ol aria-label="Recent Bells, oldest first" className="flex flex-wrap gap-[3px]">
        {days.map((day) => (
          <li key={day.day} title={describe(day)} className={`size-4 rounded-[4px] ${tone(day)}`}>
            <span className="sr-only">{describe(day)}</span>
          </li>
        ))}
      </ol>
      <ul aria-hidden className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-subtle">
        <li className="flex items-center gap-1.5">
          <span className={`size-2.5 rounded-[3px] ${BELL_TONE.settled}`} /> Live, settled
        </li>
        <li className="flex items-center gap-1.5">
          <span className={`size-2.5 rounded-[3px] ${BELL_TONE.open}`} /> Live, open
        </li>
        <li className="flex items-center gap-1.5">
          <span className={`size-2.5 rounded-[3px] ${BELL_TONE.replay}`} /> Replayed
        </li>
      </ul>
    </div>
  );
}

/** The Suspense fallback: the board's frame while the numbers are counted. */
export function StatsSkeleton() {
  return (
    <div role="status" className="space-y-12">
      <span className="sr-only">Counting…</span>
      <div className="h-7 w-72 max-w-full animate-pulse rounded-full bg-surface-2" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="card h-52 animate-pulse p-5">
            <div className="h-4 w-24 rounded bg-surface-2" />
            <div className="mt-4 h-9 w-20 rounded bg-surface-2" />
            <div className="mt-10 h-12 rounded bg-surface-2/70" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="card h-44 animate-pulse" />
        ))}
      </div>
    </div>
  );
}
