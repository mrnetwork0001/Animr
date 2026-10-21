"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useId, useState } from "react";
import { Badge, Chip, GlassCard, PageHeader, SectionTitle, pillClass } from "@/components/v2/primitives";
import { parseChogQuery } from "@/lib/chog-id";
import type { ReplayResult } from "@/lib/dna/types";
import { possessive } from "@/lib/possessive";
import { useHiddenChogs } from "../hidden-chogs";
import { useChogName, useGenome, useReplay, useStanding } from "./api";
import { ChogThumb } from "./chog-thumb";
import { GenomeCard, StyleChip } from "./genome-card";
import { ArrowLeftIcon, DiceIcon } from "./icons";
import {
  CHOG_COUNT,
  DEFAULT_WINDOW,
  WINDOW_LABEL,
  type WindowKey,
  chogNumberLabel,
  formatInt,
  parseChogId,
  parseWindow,
  randomChogId,
  signedPct,
} from "./shared";
import { TimeMachine, TradeLog } from "./time-machine";
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
 * "Replaying 45 days of real $CHOG, trade by trade…": the title while the replay loads (no numbers yet), as long as
 * the result's so the header keeps its height on every width.
 */
function loadingTitle(span: WindowKey): string {
  const what = span === "max" ? "the whole real $CHOG chart" : `${WINDOW_LABEL[span]} of real $CHOG`;
  return `Replaying ${what}, trade by trade…`;
}

/** /replay/<id>, with ?vs= for a race and ?window= when it isn't the default window. */
function replayHref(tokenId: number, rivalId: number | undefined, span: WindowKey): string {
  const query = new URLSearchParams();
  if (rivalId !== undefined) query.set("vs", String(rivalId));
  if (span !== DEFAULT_WINDOW) query.set("window", span);
  const search = query.toString();
  return `/replay/${tokenId}${search ? `?${search}` : ""}`;
}

/**
 * The shareable /replay/[tokenId] page body: who this Chog is, its Time Machine, its trades and trading DNA, and
 * how its holder claims its AI. `?vs=<id>` turns the replay into a race against another Chog. `nameNumbers`
 * (token id -> the number in its name, "CHOG #1462" is token 1) gives every Chog its marketplace name.
 */
export function ReplayView({ tokenId, nameNumbers = [] }: { tokenId: number; nameNumbers?: readonly number[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const vs = parseChogId(params.get("vs"));
  const hidden = useHiddenChogs();
  // A rival its holder hid isn't raced or shown (its replay answers 404 anyway).
  const rivalId = vs !== null && vs !== tokenId && !hidden.has(vs) ? vs : undefined;
  // "CHOG #1312" (its marketplace name) and "Silver Whiskers" (its persona name, once its DNA loads).
  const label = chogNumberLabel(tokenId, nameNumbers);
  const name = useChogName(tokenId, nameNumbers);
  const rivalName = useChogName(rivalId, nameNumbers);
  // Versus: the same pair (or this Chog and a random rival) on a hidden 48 hours, picked before the race.
  const versusHref = rivalId === undefined ? `/versus?a=${tokenId}` : `/versus?a=${tokenId}&b=${rivalId}`;
  // The window is the page's and the URL's (?window=30d, so a shared link opens on it): the title, the numbers and the
  // trade log follow the Time Machine's picker. Switching replaces the entry (no history step per switch).
  const span = parseWindow(params.get("window"));
  const setSpan = (next: WindowKey) => window.history.replaceState(null, "", replayHref(tokenId, rivalId, next));
  const replay = useReplay(tokenId, span);
  const genome = useGenome(tokenId);
  // The rank and claimed badge: this Chog's league row only, not the whole ~0.5 MB population.
  const standing = useStanding(tokenId, DEFAULT_WINDOW);
  const row = standing.data?.row;
  const r = replay.data;

  const setRival = (id?: number) => router.replace(replayHref(tokenId, id, span), { scroll: false });

  return (
    <>
      <PageHeader
        className="dna-replay-header pt-6 sm:pt-10"
        kicker="Time Machine"
        title={
          r ? (
            resultTitle(r)
          ) : (
            // Until the replay loads: a plain loading line (never a placeholder verdict), about as long as the
            // result's so the header keeps its height, with the Chog's name read out ahead of it.
            <>
              <span className="v2-sr">{name}: </span>
              {loadingTitle(span)}
            </>
          )
        }
        lead={
          <>
            <span className="text-[var(--v2-ink)]">{name}</span> trades as a{" "}
            {genome.data?.genome.archetype ?? "trait-coded trader"}
            {row ? (
              <>
                :{" "}
                <Link href={`/league?id=${tokenId}`} className="v2-link">
                  #{formatInt(row.rank)} of {formatInt(standing.data?.total ?? CHOG_COUNT)}
                </Link>{" "}
                in the League.{" "}
              </>
            ) : standing.isPending ? (
              // The rank's room, kept while it loads.
              <span aria-hidden className="invisible">
                : #0,000 of 1,969 in the League.{" "}
              </span>
            ) : (
              ". "
            )}
            Every trade below is simulated on real $CHOG candles.
          </>
        }
        actions={
          <>
            <Link href={versusHref} className={pillClass("hero")}>
              {rivalId === undefined ? "Race it in Versus" : "Race them in Versus"}
            </Link>
            <Link href={`/chog/${tokenId}`} className={pillClass("glass")}>
              Profile
            </Link>
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
              alt={name}
            />
            <div className="min-w-0">
              {/* Its persona name, as on the landing page and the League ("Rocket Ears"). */}
              <p className="v2-h3">{name}</p>
              <p className="mt-0.5 text-[13px] text-[var(--v2-faint)]">{label}</p>
              {/* min-h: one chip's height, kept while the DNA loads. */}
              <div className="mt-2.5 flex min-h-[26px] flex-wrap items-center gap-1.5 lg:justify-end">
                {genome.data && <Chip>{genome.data.genome.archetype}</Chip>}
                {genome.data && <StyleChip style={genome.data.genome.style} />}
                {row?.claimed && (
                  <Badge tone="teal" live>
                    AI claimed
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
        />
        <ChallengeBar
          tokenId={tokenId}
          rivalId={rivalId}
          rivalName={rivalName}
          onRival={setRival}
          nameNumbers={nameNumbers}
          hidden={hidden}
        />
      </div>

      <section aria-labelledby="replay-under-the-hood" className="v2-section">
        <SectionTitle
          id="replay-under-the-hood"
          title="Every trade, and the genes behind them"
          description="Same traits, same trader: the trades come from the trading DNA beside them, run hour by hour."
        />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="min-w-0 space-y-4">
            <GlassCard as="section" padding="flush" aria-labelledby="replay-trades">
              <div className="px-5 pt-5 pb-4 sm:px-6">
                <h3 id="replay-trades" className="v2-h3">
                  Trade log
                </h3>
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
  rivalName,
  onRival,
  nameNumbers,
  hidden,
}: {
  tokenId: number;
  rivalId?: number;
  rivalName: string;
  onRival: (id?: number) => void;
  nameNumbers: readonly number[];
  hidden: ReadonlySet<number>;
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
    if (hidden.has(id))
      return setProblem(`${possessive(chogNumberLabel(id, nameNumbers))} holder took it out of Animr's public pages. Pick another one.`);
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
            Racing <span className="text-[var(--v2-violet-ink)]">{rivalName}</span>. Swap for
          </>
        )}
      </label>
      <div className="v2-input-group w-full max-w-xs p-1 sm:w-auto">
        <input
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
        <div className="max-w-2xl">
          <h2 id="wake-up-title" className="v2-h3">
            {claimed ? "Its holder already claimed its AI" : "Own this Chog? Claim its AI."}
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-[var(--v2-nav)]">
            {claimed
              ? "Its AI runs on 0G Compute and trades with this DNA from the Chog's own ERC-6551 wallet."
              : "Its holder signs one free message to give it an AI on 0G Compute that trades with this DNA."}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2.5">
          {claimed ? (
            <Link href={`/chog/${tokenId}`} className={pillClass("glass")}>
              See its AI
            </Link>
          ) : (
            <Link href={`/chog/${tokenId}`} className={pillClass("glass")}>
              Claim its AI
            </Link>
          )}
          <Link href="/league" className={pillClass("ghost")}>
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
