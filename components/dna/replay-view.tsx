"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, type RefObject, useId, useRef, useState } from "react";
import { SparkIcon } from "@/components/v2/icons";
import { Badge, Chip, GlassCard, IconTile, PageHeader, SectionTitle, StatRow, pillClass } from "@/components/v2/primitives";
import { chogLabel, parseChogQuery } from "@/lib/chog-id";
import type { ReplayResult } from "@/lib/dna/types";
import { formatAmount } from "@/lib/format";
import { useHiddenChogs } from "../hidden-chogs";
import { useGenome, useReplay, useStanding } from "./api";
import { ChogThumb } from "./chog-thumb";
import { GenomeCard, StyleChip } from "./genome-card";
import { ArrowLeftIcon, DiceIcon } from "./icons";
import { CHOG_COUNT, DEFAULT_WINDOW, SIM_LABEL, type WindowKey, formatInt, parseChogId, randomChogId, signedPct } from "./shared";
import { KeyMoments, TimeMachine, TradeLog } from "./time-machine";
import "./dna.css";

/** "Beat holding by 12.4% on 45 days of real $CHOG": the replay's result as the page's title. */
function resultTitle(r: ReplayResult) {
  const days = Math.max(1, Math.round((r.window.to - r.window.from) / 86_400));
  // The verb carries the sign ("Trailed holding by 2.0%").
  const size = signedPct(Math.abs(r.edgePct)).replace(/^\+/, "");
  const on = ` on ${days} days of real $CHOG`;
  if (r.edgePct >= 0.05)
    return (
      <>
        Beat holding by <span style={{ WebkitTextFillColor: "var(--v2-success)", color: "var(--v2-success)" }}>{size}</span>
        {on}
      </>
    );
  if (r.edgePct <= -0.05)
    return (
      <>
        Trailed holding by <span style={{ WebkitTextFillColor: "var(--v2-danger)", color: "var(--v2-danger)" }}>{size}</span>
        {on}
      </>
    );
  return <>Matched just holding{on}</>;
}

/**
 * The shareable /replay/[tokenId] page body: who this Chog is, its Time Machine, its numbers, trades and genome,
 * and the way to wake it up for real. `?vs=<id>` turns the replay into a race against another Chog. `nameNumbers`
 * (token id -> the number in its name, "CHOG #1462" is token 1) labels every Chog with both numbers.
 */
export function ReplayView({ tokenId, nameNumbers = [] }: { tokenId: number; nameNumbers?: readonly number[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const vs = parseChogId(params.get("vs"));
  const hidden = useHiddenChogs();
  // A rival its holder hid isn't raced or shown (its replay answers 404 anyway).
  const rivalId = vs !== null && vs !== tokenId && !hidden.has(vs) ? vs : undefined;
  const labelOf = (id: number) => chogLabel(id, { number: nameNumbers[id - 1] || null });
  const label = labelOf(tokenId);
  // VERSUS: the same pair (or this Chog and a random rival) on a hidden 48 hours, picked before the race.
  const versusHref = rivalId === undefined ? `/versus?a=${tokenId}` : `/versus?a=${tokenId}&b=${rivalId}`;
  // The window is the page's: the title, the numbers and the trade log follow the Time Machine's picker.
  const [span, setSpan] = useState<WindowKey>(DEFAULT_WINDOW);
  const replay = useReplay(tokenId, span);
  const genome = useGenome(tokenId);
  // The rank and claimed badge: this Chog's league row only, not the whole ~0.5 MB population.
  const standing = useStanding(tokenId, DEFAULT_WINDOW);
  const row = standing.data?.row;
  const challengeRef = useRef<HTMLInputElement>(null);
  const r = replay.data;

  const setRival = (id?: number) =>
    router.replace(id ? `/replay/${tokenId}?vs=${id}` : `/replay/${tokenId}`, { scroll: false });

  return (
    <>
      <PageHeader
        className="dna-replay-header pt-6 sm:pt-10"
        kicker={<>Time Machine · {label}</>}
        title={r ? resultTitle(r) : (genome.data?.genome.archetype ?? label)}
        lead={
          <>
            {row ? <span className="text-[var(--v2-ink)]">{row.name}</span> : "This Chog"} trades as a{" "}
            {genome.data?.genome.archetype ?? "trait-coded trader"}.{" "}
            {row && (
              <>
                <Link href={`/league?id=${tokenId}`} className="v2-link">
                  #{formatInt(row.rank)} of {formatInt(standing.data?.total ?? CHOG_COUNT)}
                </Link>{" "}
                in the League over 45 days.{" "}
              </>
            )}
            Every trade below is simulated on real $CHOG candles (1% fee + impact).
          </>
        }
        actions={
          <>
            <Link href={versusHref} className={pillClass("primary")}>
              {rivalId === undefined ? "Rewind vs another" : "Race them in Rewind"}
            </Link>
            <Link href={`/chog/${tokenId}`} className={pillClass("glass")}>
              Profile
            </Link>
            <button type="button" onClick={() => router.push(`/replay/${randomChogId(tokenId, hidden)}`)} className={pillClass("ghost")}>
              <DiceIcon className="size-[18px]" /> Random Chog
            </button>
          </>
        }
        aside={
          <div className="dna-portrait">
            <ChogThumb
              image={genome.data?.chog.image}
              tokenId={tokenId}
              size={168}
              box="v2-avatar v2-avatar--xl"
              eager
              alt={label}
            />
            <div className="min-w-0">
              {/* Its persona name, as on the landing page and the League ("Rocket Ears"). */}
              <p className="v2-h3">{row?.name ?? label}</p>
              <p className="mt-0.5 text-[13px] text-[var(--v2-faint)]">{label}</p>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5 lg:justify-end">
                {genome.data && <Chip>{genome.data.genome.archetype}</Chip>}
                {genome.data && <StyleChip style={genome.data.genome.style} />}
                {row?.claimed && (
                  <Badge tone="teal" live>
                    Live AI awake
                  </Badge>
                )}
              </div>
            </div>
          </div>
        }
      />

      <div className="mt-8 space-y-3 sm:mt-10">
        <TimeMachine
          tokenId={tokenId}
          rivalId={rivalId}
          nameNumbers={nameNumbers}
          span={span}
          onSpanChange={setSpan}
          onChallenge={() => challengeRef.current?.focus()}
        />
        <ChallengeBar
          tokenId={tokenId}
          rivalId={rivalId}
          onRival={setRival}
          inputRef={challengeRef}
          nameNumbers={nameNumbers}
          hidden={hidden}
          labelOf={labelOf}
        />
      </div>

      <section aria-labelledby="replay-numbers" className="v2-section">
        <SectionTitle
          id="replay-numbers"
          kicker="The numbers"
          title={rivalId === undefined ? "How the replay went" : `How ${label} did`}
          description={SIM_LABEL}
        />
        {r ? (
          <StatRow
            boxed
            stats={[
              { key: "edge", label: "vs holding", value: signedPct(r.edgePct), tone: r.edgePct >= 0.05 ? "up" : r.edgePct <= -0.05 ? "down" : undefined },
              { key: "end", label: "Ending stack", hint: `from ${formatAmount(r.startChog, 0)}`, value: <>{formatAmount(r.endValueChog, 0)}</>, spoken: `${formatAmount(r.endValueChog, 0)} $CHOG` },
              { key: "dip", label: "Worst dip", value: signedPct(-Math.abs(r.maxDrawdownPct)) },
              { key: "trades", label: "Trades", value: formatInt(r.trades.length) },
              { key: "fees", label: "Fees paid", hint: "$CHOG", value: formatAmount(r.feesPaidChog, 0) },
            ]}
          />
        ) : (
          <span aria-hidden className="v2-skeleton block h-[112px] rounded-[var(--v2-r-lg)]" />
        )}
      </section>

      <section aria-labelledby="replay-under-the-hood" className="v2-section">
        <SectionTitle
          id="replay-under-the-hood"
          kicker="Under the hood"
          title="Every trade, and the genes behind them"
          description="Same traits, same trader: the trades come from the genome on the right, run hour by hour."
        />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="min-w-0 space-y-4">
            <GlassCard as="section" padding="flush" aria-labelledby="replay-trades">
              <div className="flex items-baseline justify-between gap-3 px-5 pt-5 pb-4 sm:px-6">
                <h3 id="replay-trades" className="v2-h3">
                  Trade log
                </h3>
                <span className="text-xs text-[var(--v2-faint)]">{label}</span>
              </div>
              {!r ? (
                <div aria-hidden className="space-y-3 px-5 pb-6 sm:px-6">
                  {Array.from({ length: 5 }, (_, i) => (
                    <span key={i} className="v2-skeleton v2-skeleton--text block" />
                  ))}
                </div>
              ) : r.trades.length === 0 ? (
                <p className="px-5 pb-6 text-sm text-[var(--v2-nav)] sm:px-6">It never traded in this window: it just held its $CHOG.</p>
              ) : (
                <div className="max-h-[30rem] overflow-y-auto border-t border-[var(--v2-line-soft)]">
                  <TradeLog trades={r.trades} />
                </div>
              )}
            </GlassCard>

            {r && r.moments.length > 0 && (
              <GlassCard as="section" aria-labelledby="replay-moments">
                <h3 id="replay-moments" className="v2-h3">
                  Key moments
                </h3>
                <div className="mt-5">
                  <KeyMoments moments={r.moments} />
                </div>
              </GlassCard>
            )}
          </div>

          <div className="space-y-4">
            <GenomeCard tokenId={tokenId} hideIdentity />
            {rivalId !== undefined && <GenomeCard tokenId={rivalId} />}
          </div>
        </div>
      </section>

      <WakeUp tokenId={tokenId} claimed={row?.claimed ?? false} />
    </>
  );
}

function ChallengeBar({
  tokenId,
  rivalId,
  onRival,
  inputRef,
  nameNumbers,
  hidden,
  labelOf,
}: {
  tokenId: number;
  rivalId?: number;
  onRival: (id?: number) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  nameNumbers: readonly number[];
  hidden: ReadonlySet<number>;
  labelOf: (id: number) => string;
}) {
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const inputId = useId();
  const errorId = useId();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    // A bare number is a token id; "CHOG #1462" or "#1462" is the number in a Chog's name (lib/chog-id.ts).
    const query = parseChogQuery(text, nameNumbers, CHOG_COUNT);
    if (query.kind === "empty") return setProblem(`Type a token id (1 to ${formatInt(CHOG_COUNT)}) or a name like CHOG #1462.`);
    if (query.kind === "invalid") return setProblem(query.message);
    const id = query.tokenId;
    if (id === tokenId) return setProblem("A Chog can't race itself. Pick another one.");
    if (hidden.has(id)) return setProblem(`${labelOf(id)}'s holder took it out of Animr's public pages. Pick another one.`);
    setProblem(null);
    setText("");
    onRival(id);
  };

  return (
    <form onSubmit={submit} className="v2-card v2-card--tight flex flex-wrap items-center gap-x-3 gap-y-2.5 sm:px-5" noValidate>
      <label htmlFor={inputId} className="text-sm font-[480] text-[var(--v2-muted)]">
        {rivalId === undefined ? (
          "Challenge: race it against"
        ) : (
          <>
            Racing <span className="text-[var(--v2-violet-ink)]">{labelOf(rivalId)}</span>. Swap for
          </>
        )}
      </label>
      <div className="v2-input-group w-full max-w-xs p-1 sm:w-auto">
        <input
          ref={inputRef}
          id={inputId}
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoComplete="off"
          placeholder="7 or CHOG #1462"
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? errorId : undefined}
          className="v2-input h-9 min-w-0 flex-1 text-[14.5px]"
        />
        <button type="submit" className={`${pillClass("glass", "sm")} h-9`}>
          Race
        </button>
      </div>
      <button type="button" onClick={() => onRival(randomChogId(tokenId, hidden))} className={pillClass("ghost", "sm")}>
        <DiceIcon className="size-4" /> Random rival
      </button>
      {rivalId !== undefined && (
        <button type="button" onClick={() => onRival(undefined)} className={`${pillClass("ghost", "sm")} sm:ml-auto`}>
          End race
        </button>
      )}
      {problem && (
        <p id={errorId} role="alert" className="w-full text-xs text-[var(--v2-danger)]">
          {problem}
        </p>
      )}
    </form>
  );
}

function WakeUp({ tokenId, claimed }: { tokenId: number; claimed: boolean }) {
  return (
    <section aria-labelledby="wake-up-title" className="v2-section">
      <GlassCard padding="roomy" className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex max-w-2xl gap-5">
          <IconTile size="lg" tone="violet">
            <SparkIcon />
          </IconTile>
          <div>
            <h2 id="wake-up-title" className="v2-h3">
              {claimed ? "This Chog is already awake" : "That was a replay. Wake it up for real."}
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-[var(--v2-nav)]">
              {claimed
                ? "Its owner gave it a live brain: an LLM on 0G Compute that decides with this genome in mind, inside the Chog's own ERC-6551 wallet."
                : "Every Chog owns an ERC-6551 wallet. Its owner signs once to give it a live brain on 0G Compute that trades with this genome in mind. Sell the Chog and the trader, wallet and record go with it."}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2.5">
          {claimed ? (
            <Link href={`/chog/${tokenId}`} className={pillClass("primary")}>
              See its live AI
            </Link>
          ) : (
            <Link href={`/app?id=${tokenId}#lookup`} className={pillClass("primary")}>
              Wake it up for real
            </Link>
          )}
          <Link href="/league" className={pillClass("glass")}>
            All 1,969 Chogs
          </Link>
        </div>
      </GlassCard>
    </section>
  );
}

/** "← The League", above the replay's header. */
export function BackToLeague() {
  return (
    <Link
      href="/league"
      className="mt-6 inline-flex items-center gap-1.5 text-sm text-[var(--v2-nav)] transition-colors hover:text-[var(--v2-ink)] sm:mt-8"
    >
      <ArrowLeftIcon className="size-4" /> The League
    </Link>
  );
}

/** Suspense fallback while the page reads its params. */
export function ReplaySkeleton() {
  return (
    <div role="status">
      <span className="v2-sr">Loading the Time Machine…</span>
      <div aria-hidden className="v2-page-header v2-page-header--split dna-replay-header pt-6 sm:pt-10">
        <span className="block space-y-4">
          <span className="v2-skeleton v2-skeleton--text w-56" />
          <span className="v2-skeleton block h-12 w-full max-w-xl rounded-xl" />
          <span className="v2-skeleton block h-12 w-2/3 max-w-md rounded-xl" />
          <span className="v2-skeleton v2-skeleton--text w-full max-w-lg" />
        </span>
        <span className="dna-portrait">
          <span className="v2-skeleton v2-avatar v2-avatar--xl" />
        </span>
      </div>
      <span aria-hidden className="v2-skeleton mt-8 block h-[560px] rounded-[var(--v2-r-lg)] sm:mt-10 sm:h-[680px]" />
    </div>
  );
}
