import type { ReactNode } from "react";
import { Badge, Chip, EmptyState, GlassCard, Meter, PillLink, SectionTitle, Skeleton } from "@/components/v2";
import { formatClock, formatCount, formatLongDay, formatPct, formatUsd, plural, sinceLabel } from "./format";
import { SparkBars } from "./spark-bars";
import "./stats.css";
import type { BellDayStat, StatsResponse, StatsSection } from "./types";

// The /stats page body (a server component): headline stat cards with teal bar charts, then one section per verb.
// Every number is a count the app keeps itself; zeros come with the next step instead of an empty state.

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
    <>
      <div className="v2-row mt-8 gap-2">
        <Badge tone="success" live>
          Updated {formatClock(stats.computedAt)}
        </Badge>
        <Chip>{nextBellLine.replace(/\.$/, "")}</Chip>
        <Chip>Points have no cash value</Chip>
      </div>

      {stats.unavailable.length > 0 && (
        <p role="status" className="stats-alert mt-4 border-[rgb(242_193_107/0.32)] text-[var(--v2-warning)]">
          A few numbers couldn&apos;t be counted just now and show as —. They&apos;re back within a minute.
        </p>
      )}

      <section aria-labelledby="stats-headline" className="mt-6">
        <h2 id="stats-headline" className="v2-sr">
          Headline numbers
        </h2>
        <div className="v2-grid v2-grid--4">
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
        </div>
      </section>

      <Section
        id="stats-bell"
        verb="Ride"
        title="The Daily Bell"
        href="/bell"
        cta="Ride a Chog"
        lede="Every day at 15:00 UTC all 1,969 Chogs call $CHOG for the next 24 hours, and the real market settles every call. Fans ride one Chog per Bell for points."
      >
        <div className="v2-grid v2-grid--3">
          <GlassCard className="stats-panel">
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
              <p className="stats-note mt-auto pt-4">
                Plus {plural(bell.replayed, "Bell")} replayed from real past candles (trait calls only), so the history is
                never empty.
              </p>
            )}
          </GlassCard>
          <GlassCard className="stats-panel">
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
            <div className="mt-auto pt-6">
              <Meter value={(retention.d1Pct ?? 0) / 100} label="Day-1 return" />
            </div>
          </GlassCard>
          <GlassCard className="stats-panel">
            <dl className="stats-minis">
              <Mini label="Back-to-back fans" value={show("bell", retention.backToBack)} note="rode two days in a row" />
              <Mini
                label="Longest streak"
                value={show("bell", retention.longestStreak)}
                note={retention.longestStreak === 1 ? "Bell in a row" : "Bells in a row"}
              />
              <Mini label="Fans who rode" value={show("bell", rides.riders)} note="at least once" />
              <Mini label="Fan points" value={show("fans", fans.points)} note="a score, no cash value" />
            </dl>
          </GlassCard>
        </div>
      </Section>

      <div className="stats-pair v2-section">
        <Section
          id="stats-versus"
          flush
          verb="Rewind"
          title="Versus"
          href="/versus"
          cta="Start a bout"
          lede="Two Chogs' trading genomes race the same hidden 48 hours of real $CHOG history. Pick a winner, then see the dates."
        >
          <GlassCard className="stats-panel">
            <dl className={`stats-minis ${stats.replays ? "stats-minis--3" : ""}`}>
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
            </dl>
            <p className="stats-note mt-auto pt-5">
              Simulated on real $CHOG candles (1% fee + impact). Correct picks earn points, never money.
            </p>
          </GlassCard>
        </Section>

        <Section
          id="stats-heist"
          flush
          verb="Rob"
          title="Rob this Chog"
          href="/heist"
          cta="Try the heist"
          lede="Talk the House Chog's AI into sending you its $CHOG, then watch a live Monad simulation refuse the transfer."
        >
          <GlassCard className="stats-panel">
            <dl className="stats-minis">
              <Mini label="AI said yes" value={show("heist", heist.caves)} note="it agreed to pay" />
              <Mini label="Monad said no" value={show("heist", heist.refusals)} note="in live mainnet simulations" />
              <Mini label="$CHOG stolen" value="0" note="nothing is ever broadcast" />
              <Mini label="On the wall" value={show("heist", heist.wall)} note="replies in the Hall of Fame" />
            </dl>
            <p className="stats-note mt-auto pt-5">
              Every transfer check is a read-only eth_call at the latest Monad block. The AI can be fooled; the NFT
              can&apos;t.
            </p>
          </GlassCard>
        </Section>
      </div>

      <div className="stats-pair stats-pair--loose v2-section">
        <Section
          id="stats-agents"
          flush
          verb="Under the hood"
          title="Claimed AI agents"
          href="/leaderboard"
          cta="See live agents"
          lede="Holders wake their Chog's AI with one free signature. It decides on 0G Compute and trades the $CHOG in the Chog's own ERC-6551 wallet."
        >
          <GlassCard className="stats-panel">
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
            {agents.claimedEver === 0 && !missing("agents") ? (
              // One honest line instead of a row of zero tiles until a holder wakes a Chog's AI.
              <p className="v2-body mt-5 border-t border-[var(--v2-line-soft)] pt-5 text-pretty">
                No claimed agents yet: their decisions, 0G receipts and trades show here from the first one. Meanwhile
                every Chog already trades on its genome in the League and calls the Daily Bell.
              </p>
            ) : (
              <>
                <SparkBars points={agents.perDay} label="Agent decisions per day" unit={["decision", "decisions"]} className="mt-6" />
                <dl className="stats-minis stats-minis--3 mt-5">
                  <Mini label="On 0G Compute" value={show("agents", agents.llm)} note="decided by an LLM" />
                  <Mini
                    label="Provider tier"
                    value={missing("agents") ? "—" : `${formatCount(agents.providerTiers.teeML)} · ${formatCount(agents.providerTiers.teeTLS)}`}
                    note={
                      agents.teeVerified > 0
                        ? `TeeML · TeeTLS, as 0G lists the provider; ${formatCount(agents.teeVerified)} receipts say TEE verified`
                        : "TeeML · TeeTLS, as 0G lists the provider: a label, not a check of each call"
                    }
                  />
                  <Mini
                    label="Trades"
                    value={show("agents", agents.paperTrades + agents.onchainTrades)}
                    note={`${formatCount(agents.onchainTrades)} on-chain, ${formatCount(agents.paperTrades)} paper`}
                  />
                </dl>
              </>
            )}
          </GlassCard>
        </Section>

        <div className="stats-stack">
          <Section
            id="stats-spend"
            flush
            verb="Receipts"
            title="0G Compute spend"
            lede="What the AI behind these numbers has cost so far, from the receipts the 0G Router returns."
          >
            <GlassCard>
              <Figure
                label="Total spend"
                value={missing("agents") || missing("heist") ? "—" : formatUsd(zg.totalUsd)}
                note={`Agent decisions ${formatUsd(zg.agentsUsd)} · heist replies ${formatUsd(zg.heistUsd)}`}
              />
            </GlassCard>
          </Section>

          <Section
            id="stats-consent"
            flush
            verb="Consent"
            title="Hidden by their holders"
            href="#hide"
            cta="Hide my Chog"
            lede="Every Chog plays by default. Its holder can take it out of Animr's public pages with one free signature."
          >
            <GlassCard>
              <Figure
                label="Chogs hidden"
                value={show("optout", optout.hidden)}
                since={sinceLabel(optout.since)}
                note={`${formatCount(Math.max(0, CHOG_COUNT - optout.hidden))} of 1,969 Chogs still play in the League, the Bell and Versus.`}
              />
            </GlassCard>
          </Section>
        </div>
      </div>
    </>
  );
}

/** A headline stat card: label, big number, note, and its per-day bars. */
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
    <GlassCard className="stats-tile">
      <div className="stats-tile-head">
        <h3 className="stats-label">{label}</h3>
        {since && <Chip className="stats-since">{since}</Chip>}
      </div>
      <p className="stats-value">{value}</p>
      <p className="stats-note">{note}</p>
      <div className="stats-tile-chart">{children}</div>
    </GlassCard>
  );
}

function Section({
  id,
  verb,
  title,
  lede,
  href,
  cta,
  flush,
  children,
}: {
  id: string;
  verb: string;
  title: string;
  lede: string;
  href?: string;
  cta?: string;
  /** Inside a .stats-pair, which already spaces the row. */
  flush?: boolean;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={flush ? undefined : "v2-section"}>
      <SectionTitle
        id={id}
        kicker={verb}
        title={title}
        description={lede}
        action={
          href && cta ? (
            <PillLink href={href} variant="glass" size="sm" arrow>
              {cta}
            </PillLink>
          ) : undefined
        }
      />
      {children}
    </section>
  );
}

function Figure({ label, value, since, note }: { label: string; value: string; since?: string | null; note: string }) {
  return (
    <div>
      <div className="stats-tile-head">
        <h3 className="stats-label">{label}</h3>
        {since && <Chip className="stats-since">{since}</Chip>}
      </div>
      <p className="stats-value">{value}</p>
      <p className="stats-note">{note}</p>
    </div>
  );
}

function Mini({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="stats-mini">
      <dt>
        {label}
        <span>{note}</span>
      </dt>
      <dd>{value}</dd>
    </div>
  );
}

/** The latest Bells as a calendar strip: live (settled or open) against replayed. */
function BellStrip({ days }: { days: BellDayStat[] }) {
  const tone = (day: BellDayStat) =>
    day.kind === "replay" ? "" : day.settled ? "stats-bell--settled" : "stats-bell--open";
  const describe = (day: BellDayStat) =>
    `${formatLongDay(day.day)}: ${day.kind === "live" ? `live, ${day.settled ? "settled" : "open"}, ${plural(day.rides, "ride")}` : "replayed"}`;
  return (
    <div className="mt-5">
      <ol aria-label="Recent Bells, oldest first" className="stats-bells">
        {days.map((day, i) => (
          <li
            key={day.day}
            title={describe(day)}
            className={`stats-bell ${tone(day)} ${i === days.length - 1 && day.kind === "live" ? "stats-bell--latest" : ""}`}
          >
            <span className="v2-sr">{describe(day)}</span>
          </li>
        ))}
      </ol>
      <ul aria-hidden className="v2-legend mt-3">
        <li>
          <span className="stats-bell stats-bell--settled size-2.5 rounded-[3px]" /> Live, settled
        </li>
        <li>
          <span className="stats-bell stats-bell--open size-2.5 rounded-[3px]" /> Live, open
        </li>
        <li>
          <span className="stats-bell size-2.5 rounded-[3px]" /> Replayed
        </li>
      </ul>
    </div>
  );
}

/** The Suspense fallback: the board's frame while the numbers are counted. */
export function StatsSkeleton() {
  return (
    <div role="status">
      <span className="v2-sr">Counting…</span>
      <div className="v2-row mt-8 gap-2">
        <Skeleton style={{ width: 150, height: 24, borderRadius: 999 }} />
        <Skeleton style={{ width: 220, height: 26, borderRadius: 999 }} />
      </div>
      <div className="v2-grid v2-grid--4 mt-6">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="v2-card grid gap-3">
            <Skeleton variant="text" style={{ width: 96 }} />
            <Skeleton style={{ width: 80, height: 40 }} />
            <Skeleton variant="text" />
            <Skeleton style={{ height: 52, marginTop: 16 }} />
          </div>
        ))}
      </div>
      <div className="v2-section v2-grid v2-grid--3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} variant="card" style={{ height: 190 }} />
        ))}
      </div>
    </div>
  );
}

/** When the counters can't be read: one calm line and the way forward. */
export function StatsUnavailable() {
  return (
    <div role="status" className="mt-8">
      <EmptyState
        title="The counters are catching their breath."
        body="The numbers are back within a minute. Meanwhile, ride a Chog at the Daily Bell."
        actions={
          <PillLink href="/bell" variant="glass" arrow>
            Ride a Chog
          </PillLink>
        }
      />
    </div>
  );
}
