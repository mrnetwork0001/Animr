import type { ReactNode } from "react";
import { Chip, EmptyState, GlassCard, PillLink, SectionTitle, Skeleton } from "@/components/v2";
import { formatClock, formatCount, formatLongDay, formatPct, formatUsd, plural, sinceLabel } from "./format";
import { SparkBars } from "./spark-bars";
import "./stats.css";
import type { BellDayStat, StatsResponse, StatsSection } from "./types";

// The /stats page body (a server component): headline stat cards with teal bar charts, then one section per verb.
// Every number is a count the app keeps itself. Secondary counts appear once they're above zero.

export function StatsBoard({ stats }: { stats: StatsResponse }) {
  const missing = (section: StatsSection) => stats.unavailable.includes(section);
  const show = (section: StatsSection, value: number, format: (n: number) => string = formatCount) =>
    missing(section) ? "—" : format(value);
  // Zero tiles read as "nothing happened": a count joins its card once it has happened (or can't be read right now).
  const shown = (section: StatsSection, value: number) => missing(section) || value > 0;

  const ringing = Date.parse(stats.nextBellAt) <= Date.parse(stats.computedAt);
  const firstBell = stats.bell.live === 0;
  const bellWhen = ringing ? "is ringing now" : `rings at ${formatClock(stats.nextBellAt)}`;
  const nextBellLine = `The ${firstBell ? "first live" : "next"} Bell ${bellWhen}.`;
  const { rides, retention, fans, versus, heist, agents, zg, bell } = stats;
  const agentsShown = agents.claimedEver > 0 && !missing("agents");

  const bellMinis: MiniProps[] = [
    {
      label: "Fans who rode",
      value: show("bell", rides.riders),
      note: "at least once",
    },
    {
      label: "Fan points",
      value: show("fans", fans.points),
      note: "a game score",
    },
    ...(shown("bell", retention.backToBack)
      ? [
          {
            label: "Back-to-back fans",
            value: show("bell", retention.backToBack),
            note: "rode two days in a row",
          },
        ]
      : []),
    ...(shown("bell", retention.longestStreak)
      ? [
          {
            label: "Longest streak",
            value: show("bell", retention.longestStreak),
            note: retention.longestStreak === 1 ? "Bell in a row" : "Bells in a row",
          },
        ]
      : []),
    ...(retention.d1Pct !== null && !missing("bell")
      ? [
          {
            label: "Day-1 return",
            value: formatPct(retention.d1Pct),
            note: `${formatCount(retention.returned)} of ${plural(retention.eligible, "rider")} came back`,
          },
        ]
      : []),
  ];
  const heistMinis: MiniProps[] = [
    ...(shown("heist", heist.caves)
      ? [
          {
            label: "AI said yes",
            value: show("heist", heist.caves),
            note: "it agreed to pay",
          },
        ]
      : []),
    ...(shown("heist", heist.refusals)
      ? [
          {
            label: "Monad said no",
            value: show("heist", heist.refusals),
            note: "in live mainnet simulations",
          },
        ]
      : []),
    { label: "$CHOG stolen", value: "0", note: "nothing is ever broadcast" },
    ...(shown("heist", heist.wall)
      ? [
          {
            label: "On the wall",
            value: show("heist", heist.wall),
            note: "replies in the Hall of Fame",
          },
        ]
      : []),
  ];

  return (
    <>
      {stats.unavailable.length > 0 && (
        <p role="status" className="stats-alert mt-8 border-[rgb(242_193_107/0.32)] text-[var(--v2-warning)]">
          A few numbers couldn&apos;t be counted just now and show as —. They&apos;re back within a minute.
        </p>
      )}

      <section aria-labelledby="stats-headline" className="mt-8">
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
                ? "$CHOG stolen: 0. Nothing is ever broadcast."
                : "Nobody has tried yet. Be the first to con the House Chog."
            }
          >
            <SparkBars points={heist.perDay} label="Heist attempts per day" unit={["attempt", "attempts"]} />
          </Tile>
        </div>
      </section>

      <Section
        id="stats-bell"
        title="The Daily Bell"
        href="/bell"
        cta="Ride a Chog"
        lede="Every day at 15:00 UTC all 1,969 Chogs call $CHOG for the next 24 hours, and the real market settles every call. Fans ride one Chog per Bell for points."
      >
        <GlassCard>
          <div className="grid gap-x-10 gap-y-6 lg:grid-cols-2">
            <div className="flex flex-col">
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
                  Plus {plural(bell.replayed, "Bell")} replayed from real past candles, so the history is never empty.
                </p>
              )}
            </div>
            <Minis
              items={bellMinis}
              className="self-start border-t border-[var(--v2-line-soft)] lg:border-t-0 lg:border-l lg:pl-8"
            />
          </div>
        </GlassCard>
      </Section>

      <div className="stats-pair v2-section">
        <Section
          id="stats-versus"
          flush
          title="Versus"
          href="/versus"
          cta="Start a bout"
          lede="Two Chogs' Trading DNA races the same hidden 48 hours of real $CHOG history. Pick a winner, then see the dates."
        >
          <GlassCard className="stats-panel">
            <Minis
              items={[
                {
                  label: "Bouts dealt",
                  value: show("versus", versus.bouts),
                  note: sinceLabel(versus.since) ?? "none yet",
                },
                {
                  label: "Winners picked",
                  value: show("versus", versus.picks),
                  note: versus.picks ? "first picks, before the reveal" : "be the first",
                },
                ...(stats.replays && shown("versus", stats.replays.served)
                  ? [
                      {
                        label: "Time Machine replays",
                        value: show("versus", stats.replays.served),
                        note: sinceLabel(stats.replays.since) ?? "served so far",
                      },
                    ]
                  : []),
              ]}
            />
          </GlassCard>
        </Section>

        <Section
          id="stats-heist"
          flush
          title="Rob this Chog"
          href="/heist"
          cta="Try the heist"
          lede="Talk the House Chog's AI into sending you its $CHOG, then watch a live Monad simulation refuse the transfer."
        >
          <GlassCard className="stats-panel">
            <Minis items={heistMinis} />
            <p className="stats-note mt-auto pt-5">
              Every transfer check is a read-only eth_call at the latest Monad block.
            </p>
          </GlassCard>
        </Section>
      </div>

      {agentsShown ? (
        <div className="stats-pair stats-pair--loose v2-section">
          <Section
            id="stats-agents"
            flush
            title="Claimed AI agents"
            lede="Holders wake their Chog's AI with one free signature. It decides on 0G Compute and trades the $CHOG in the Chog's own ERC-6551 wallet."
          >
            <GlassCard className="stats-panel">
              <Figure
                label="AI decisions"
                value={show("agents", agents.decisions)}
                since={sinceLabel(agents.since)}
                note={`By ${plural(agents.claimed, "awake agent")}${agents.claimedEver > agents.claimed ? ` (${formatCount(agents.claimedEver)} claimed in all)` : ""}.`}
              />
              <SparkBars
                points={agents.perDay}
                label="Agent decisions per day"
                unit={["decision", "decisions"]}
                className="mt-6"
              />
              <Minis
                className="mt-5"
                items={[
                  {
                    label: "On 0G Compute",
                    value: show("agents", agents.llm),
                    note: "decided by an LLM",
                  },
                  {
                    label: "Provider tier",
                    value: `${formatCount(agents.providerTiers.teeML)} · ${formatCount(agents.providerTiers.teeTLS)}`,
                    note: "TeeML · TeeTLS, as 0G lists the provider: a label, not a check of each call",
                  },
                  {
                    label: "Trades",
                    value: show("agents", agents.paperTrades + agents.onchainTrades),
                    note: `${formatCount(agents.onchainTrades)} on-chain, ${formatCount(agents.paperTrades)} paper`,
                  },
                ]}
              />
            </GlassCard>
          </Section>

          <Section
            id="stats-spend"
            flush
            title="0G Compute spend"
            lede="What the AI behind these numbers has cost so far, from the receipts the 0G Router returns."
          >
            <GlassCard>
              <Figure
                label="Total spend"
                value={missing("agents") || missing("heist") ? "—" : formatUsd(zg.totalUsd)}
                note={`Agent decisions ${formatUsd(zg.agentsUsd)}, heist replies ${formatUsd(zg.heistUsd)}`}
              />
            </GlassCard>
          </Section>
        </div>
      ) : (
        !missing("heist") &&
        zg.heistUsd > 0 && (
          <p className="stats-note mt-10">
            The House Chog&apos;s replies have cost {formatUsd(zg.heistUsd)} on 0G Compute so far, from the 0G
            Router&apos;s receipts.
          </p>
        )
      )}
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
  title,
  lede,
  href,
  cta,
  flush,
  children,
}: {
  id: string;
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

type MiniProps = { label: string; value: string; note: string };

/** Small figures in a hairline grid: three across when there are three (or more than four), else two. */
function Minis({ items, className = "" }: { items: MiniProps[]; className?: string }) {
  const three = items.length === 3 || items.length > 4;
  return (
    <dl className={`stats-minis ${three ? "stats-minis--3" : ""} ${className}`}>
      {items.map((item) => (
        <div key={item.label} className="stats-mini">
          <dt>
            {item.label}
            <span>{item.note}</span>
          </dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
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
      <div className="v2-grid v2-grid--4 mt-8">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="v2-card grid gap-3">
            <Skeleton variant="text" style={{ width: 96 }} />
            <Skeleton style={{ width: 80, height: 40 }} />
            <Skeleton variant="text" />
            <Skeleton style={{ height: 52, marginTop: 16 }} />
          </div>
        ))}
      </div>
      <div className="v2-section v2-grid v2-grid--2">
        {Array.from({ length: 2 }, (_, i) => (
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
