import Link from "next/link";
import { IN_SAMPLE_NOTE, SIM_LABEL } from "@/components/dna/shared";
import { ChogImage } from "./chog-image";
import { ctas, hero, labels, links, showcaseIds } from "./content";
import { Icon } from "./icons";
import { HeroScore, LeagueTiles } from "./live-league";
import { Container, PulseDot, StyleBadge } from "./primitives";
import { RandomChog } from "./random-chog-button";
import { Rich } from "./rich";
import {
  type LeagueSnapshot,
  type ShowcaseChog,
  chogWallet,
  formatCallTime,
  leagueSnapshot,
  replayCall,
  showcaseChog,
} from "./showcase";

export function Hero() {
  const chog = showcaseChog(showcaseIds.hero);
  const league = leagueSnapshot();
  return (
    <section aria-labelledby="hero-title" className="relative">
      <div aria-hidden className="landing-grid pointer-events-none absolute inset-x-0 top-0 -z-10 h-[46rem]" />
      <Container className="grid items-center gap-x-10 gap-y-14 pt-10 pb-14 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_25rem] lg:pt-20 lg:pb-16 xl:grid-cols-[minmax(0,1fr)_28rem] xl:gap-x-16">
        <div className="max-w-2xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-xs font-medium text-muted">
            <PulseDot />
            {hero.eyebrow}
          </p>
          {/* The whole tagline is the page's heading; its second half reads as a subtitle. */}
          <h1
            id="hero-title"
            className="mt-6 text-[2.6rem] leading-[1.03] font-semibold tracking-tight text-balance sm:text-6xl lg:text-[3.8rem] xl:text-[4.2rem]"
          >
            {hero.title}{" "}
            <span className="mt-4 block bg-linear-to-r from-accent-strong via-[#c3b8ff] to-accent bg-clip-text text-[0.5em] leading-[1.15] text-transparent">
              {hero.subtitle}
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-pretty text-muted">
            <Rich text={hero.lede} />
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <RandomChog className="btn btn-primary px-5 py-3 text-base sm:px-6">
              <Icon name="dice" className="size-[1.15rem]" />
              {ctas.random}
            </RandomChog>
            <Link href={links.app} className="btn btn-secondary px-5 py-3 text-base sm:px-6">
              {ctas.launch}
              <Icon name="arrowRight" className="size-[1.1rem]" strokeWidth={2} />
            </Link>
          </div>
          <p className="mt-3 text-xs text-subtle">{hero.randomHint}</p>
          {/* What runs today, in plain sight under the buttons. */}
          <p className="mt-5 flex max-w-xl gap-2.5 text-sm leading-relaxed text-pretty text-muted">
            <span aria-hidden className="mt-[0.45rem] size-2 shrink-0 rounded-full bg-success" />
            <span>
              <Rich text={hero.status} />
            </span>
          </p>
        </div>

        {chog && <HeroCard chog={chog} league={league} />}
      </Container>

      {league && (
        <Container className="pb-4">
          <StatBand league={league} tokenId={showcaseIds.hero} />
        </Container>
      )}
    </section>
  );
}

/**
 * One Chog as a trader: a call from its replay, its NFT art, the traits that set its strategy, its
 * wallet and its score. Everything is computed from its traits at build time (showcase.ts).
 */
function HeroCard({ chog, league }: { chog: ShowcaseChog; league: LeagueSnapshot | null }) {
  const visual = hero.visual;
  const call = replayCall(chog.tokenId);
  const wallet = chogWallet(chog.tokenId);
  const standing = league?.standings.get(chog.tokenId);
  // The three genes a glance should catch: what it watches, how it reads the chart, how big it trades.
  const shown = ["signal", "horizon", "trigger", "size"]
    .flatMap((key) => chog.genes.find((gene) => gene.key === key) ?? [])
    .slice(0, 3);

  return (
    <div
      role="group"
      aria-label={visual.label(chog.label, chog.name)}
      className="relative mx-auto flex w-full max-w-[25rem] flex-col lg:max-w-none"
    >
      <div aria-hidden className="landing-halo pointer-events-none absolute inset-x-6 top-1/4 bottom-6 -z-10 rounded-full" />

      {/* A call from its replay floats above its head, comic-style: the genome's rules, not the LLM. */}
      {call && (
        <div className="landing-float relative z-10 mr-8 xl:-ml-14 xl:mr-20">
          <figure className="rounded-2xl border border-line-strong bg-surface/95 p-4 shadow-[0_24px_60px_-28px_rgb(131_110_249/0.65)] backdrop-blur-sm">
            <figcaption className="flex items-center gap-2 text-xs">
              <PulseDot className="bg-accent-strong" />
              <span className="font-semibold text-foreground">{chog.name}</span>
              <span className="text-subtle">· {visual.callTitle}</span>
              <span className="ml-auto rounded-md bg-surface-2 px-2 py-0.5 font-mono text-[11px] font-semibold tracking-wider text-muted uppercase ring-1 ring-line ring-inset">
                {call.side}
              </span>
            </figcaption>
            <blockquote className="mt-3 text-[0.95rem] leading-relaxed text-pretty text-foreground">
              <p>“{call.text}”</p>
            </blockquote>
            <p className="mt-3 font-mono text-[11px] leading-snug text-subtle">
              {formatCallTime(call.t)} · {visual.callSource}
            </p>
          </figure>
          {/* Thought-bubble trail toward the Chog. */}
          <span aria-hidden className="absolute -bottom-4 left-2/3 size-3 rounded-full border border-line-strong bg-surface" />
          <span aria-hidden className="absolute -bottom-7 left-[70%] size-1.5 rounded-full border border-line-strong bg-surface" />
        </div>
      )}

      <div className={`card relative rounded-[1.75rem] p-2.5 ${call ? "mt-9" : ""}`}>
        <div className="relative">
          <ChogImage
            src={chog.image.src}
            fallbackSrc={chog.image.fallbackSrc}
            alt={`${chog.label}, ${chog.name}`}
            priority
            fallbackLabel={chog.label}
            className="rounded-[1.3rem]"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-[1.3rem] bg-linear-to-t from-background/90 via-background/45 to-transparent px-4 pt-20 pb-4">
            <p className="font-mono text-xs text-muted">{chog.label}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <p className="text-xl font-semibold tracking-tight">{chog.name}</p>
              <StyleBadge style={chog.style} />
            </div>
          </div>
        </div>

        <dl className="mt-2.5 grid gap-2.5 rounded-[1.1rem] bg-surface-2/70 px-4 py-3 text-sm">
          {/* One term, two values: the archetype, then the genes behind it (each <div> holds only <dt> and <dd>s). */}
          <div className="flex flex-wrap items-center justify-between gap-x-3">
            <dt className="flex items-center gap-2 text-muted">
              <Icon name="dna" className="size-4 text-accent-strong" />
              {visual.rows.strategy}
            </dt>
            <dd className="font-semibold text-foreground">{chog.archetype}</dd>
            <dd className="basis-full">
            <ul className="mt-1.5 space-y-0.5 pl-6 text-xs text-muted">
              {shown.map((gene) => (
                <li key={gene.key}>
                  <span className="text-subtle">{gene.trait.type}:</span> {gene.trait.value}{" "}
                  <span aria-hidden className="text-subtle">
                    →
                  </span>
                  <span className="sr-only">sets</span> <span className="text-foreground">{gene.display}</span>
                </li>
              ))}
            </ul>
            </dd>
          </div>
          {wallet && (
            <div className="flex items-center justify-between gap-3">
              <dt className="flex items-center gap-2 text-muted">
                <Icon name="wallet" className="size-4 text-accent-strong" />
                {visual.rows.wallet}
                <span className="hidden text-subtle sm:inline">· {labels.walletStandard}</span>
              </dt>
              <dd className="font-mono text-foreground">
                {wallet.href ? (
                  <a
                    href={wallet.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={wallet.address}
                    className="rounded underline decoration-line-strong underline-offset-4 transition-colors hover:text-accent-strong hover:decoration-accent"
                  >
                    {wallet.short}
                    <span className="sr-only"> ({labels.explorerHint})</span>
                  </a>
                ) : (
                  wallet.short
                )}
              </dd>
            </div>
          )}
          {standing && league && (
            <div className="flex items-start justify-between gap-3">
              <dt className="flex items-center gap-2 text-muted">
                <Icon name="trophy" className="size-4 text-accent-strong" />
                {visual.rows.score}
              </dt>
              <dd className="text-right">
                {/* Build-time numbers, swapped for the live League's once the page is idle (live-league.tsx). */}
                <HeroScore
                  tokenId={chog.tokenId}
                  build={{ edgePct: standing.edgePct, rank: standing.rank, total: league.total, window: league.window }}
                />
              </dd>
            </div>
          )}
        </dl>

        <Link
          href={links.replay(chog.tokenId)}
          className="mt-2.5 flex items-center justify-center gap-2 rounded-[1.1rem] border border-line px-4 py-2.5 text-sm font-semibold text-accent-strong transition-colors hover:border-accent/60 hover:text-foreground"
        >
          <Icon name="rewind" className="size-4" />
          {ctas.rewindIt}: every trade on the real chart
          <Icon name="arrowRight" className="size-4" strokeWidth={2} />
        </Link>
      </div>
    </div>
  );
}

/**
 * The whole League in four numbers: computed when the page was built and labelled with their window, then swapped
 * for the live League's once the page is idle (live-league.tsx), so they match /league.
 */
function StatBand({ league, tokenId }: { league: LeagueSnapshot; tokenId: number }) {
  const { total, genomeVersion, window, beatHoldPct, medianEdgePct, bestEdgePct, worstEdgePct } = league;
  const build = { total, genomeVersion, window, beatHoldPct, medianEdgePct, bestEdgePct, worstEdgePct };
  return <LeagueTiles tokenId={tokenId} build={build} note={`${SIM_LABEL}. ${IN_SAMPLE_NOTE}`} />;
}
