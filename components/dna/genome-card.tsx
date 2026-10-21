"use client";

import { useId } from "react";
import { personaName, sanitizeTraits } from "@/lib/agent/persona";
import type { TradingStyle } from "@/lib/agent/types";
import { displayTraitValue, scrubTraitText, traitSafety } from "@/lib/brand-safety";
import { chogLabel } from "@/lib/chog-id";
import type { ChogSnapshot, Gene, Genome } from "@/lib/dna/types";
import { useGenome } from "./api";
import { ChogThumb } from "./chog-thumb";
import { STYLE_TONE } from "./shared";
import "@/app/design-v2.css";
import "./dna.css";

type GenomeCardProps = ({ tokenId: number } | { chog: ChogSnapshot; genome: Genome; name?: string }) & {
  /** Hide the Chog's face and name, e.g. under a page header that already shows them and the archetype. */
  hideIdentity?: boolean;
  className?: string;
};

/** A Chog's trading DNA: archetype, style and one bar per gene, each naming the trait that set it. */
export function GenomeCard(props: GenomeCardProps) {
  if ("genome" in props) return <GenomeCardView {...props} />;
  return <GenomeCardQuery {...props} />;
}

function GenomeCardQuery({ tokenId, hideIdentity, className = "" }: { tokenId: number } & Omit<GenomeCardProps, "chog" | "genome">) {
  const { data, error, refetch, isFetching } = useGenome(tokenId);
  // The API sends display-safe traits, so the persona name (a hash of the raw traits) comes computed with them.
  const name = (data as { personaName?: unknown } | undefined)?.personaName;
  if (data) {
    return (
      <GenomeCardView
        chog={data.chog}
        genome={data.genome}
        name={typeof name === "string" ? name : undefined}
        hideIdentity={hideIdentity}
        className={className}
      />
    );
  }
  if (!error) return <GenomeCardSkeleton className={className} />;
  return (
    <div role="alert" className={`v2-card px-5 py-8 text-center ${className}`}>
      <p className="font-medium text-[var(--v2-danger)]">Couldn&apos;t read Chog #{tokenId}&apos;s DNA</p>
      <p className="v2-mono mt-1 break-words text-xs text-[var(--v2-nav)]">{error.message}</p>
      <button type="button" onClick={() => refetch()} disabled={isFetching} className="v2-btn-glass v2-btn--sm mt-4">
        {isFetching ? "Retrying…" : "Try again"}
      </button>
    </div>
  );
}

function GenomeCardView({
  chog,
  genome,
  name,
  hideIdentity = false,
  className = "",
}: {
  chog: ChogSnapshot;
  genome: Genome;
  /** Its persona name; computed from `chog.traits` when absent (pass raw traits then, as in data/chogs.json). */
  name?: string;
  hideIdentity?: boolean;
  className?: string;
}) {
  const headingId = useId();
  const persona = name ?? personaName(String(chog.id), sanitizeTraits(chog.traits));
  return (
    <section aria-labelledby={headingId} className={`v2-card ${className}`}>
      <div className="flex items-start gap-4">
        {!hideIdentity && (
          <ChogThumb image={chog.image} tokenId={chog.id} size={56} className="rounded-[14px] border border-[var(--v2-line)]" />
        )}
        <div className="min-w-0 flex-1">
          <p className="v2-kicker">Trading DNA</p>
          <h2 id={headingId} className="v2-h3 mt-2 text-balance">
            {hideIdentity ? `The genes behind the ${genome.archetype}` : genome.archetype}
          </h2>
          {!hideIdentity && (
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-[var(--v2-nav)]">
              {/* Both numbers: the name marketplaces show and the token id ("CHOG #1462 · token 1"). */}
              <span className="font-medium text-[var(--v2-ink)]">{chogLabel(chog.id, { metadataName: chog.name })}</span>
              {/* Its persona name, the one every page shows. */}
              <span className="text-[var(--v2-faint)]">{persona}</span>
              <StyleChip style={genome.style} />
            </p>
          )}
        </div>
      </div>

      {genome.genes.length > 0 ? (
        <ul className="mt-6 space-y-5">
          {genome.genes.map((gene, i) => (
            <GeneRow key={gene.key} gene={gene} index={i} />
          ))}
        </ul>
      ) : (
        <p className="mt-5 text-sm text-[var(--v2-nav)]">This Chog&apos;s metadata couldn&apos;t be read, so it trades on default genes.</p>
      )}

      <p className="v2-note mt-6 border-t border-[var(--v2-line-soft)] pt-4">
        Compiled from this Chog&apos;s traits by genome <span className="v2-mono text-[var(--v2-nav)]">{genome.version}</span>.
        Same traits, same trader: anyone can re-run it.
      </p>
    </section>
  );
}

/**
 * The explanation without a lead-in that repeats the trait chip next to it:
 * "Mint: it acts once…" -> "It acts once…", "BTC Glass eyes: it trades…" -> "It trades…". The lead-in names the
 * trait as shown (its neutral name when flagged), so either spelling is recognized; flagged trait values left in the
 * text are replaced by their neutral names (lib/brand-safety.ts).
 */
function explanationAfterChip(gene: Gene): string {
  const text = scrubTraitText(gene.explanation);
  const cut = text.indexOf(": ");
  const head = text.toLowerCase();
  const names = gene.trait ? [gene.trait.value, displayTraitValue(gene.trait.type, gene.trait.value)] : [];
  if (cut < 0 || cut > 48 || !names.some((name) => name && head.startsWith(name.toLowerCase()))) return text;
  const rest = text.slice(cut + 2);
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

function GeneRow({ gene, index }: { gene: Gene; index: number }) {
  const value = Math.max(0, Math.min(100, Number.isFinite(gene.value) ? gene.value : 0));
  // A hidden trait value gets no chip (its explanation already reads "It …").
  const chip = gene.trait && traitSafety(gene.trait.type, gene.trait.value);
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3">
        <span className="v2-overline">{gene.label}</span>
        <span className="text-right text-sm font-[480] text-[var(--v2-ink)]">{gene.display}</span>
      </div>
      <div aria-hidden className="dna-bar mt-2">
        <span className="dna-grow" style={{ width: `${Math.max(value, 3)}%`, animationDelay: `${index * 70}ms` }} />
      </div>
      <span className="v2-sr">{Math.round(value)} out of 100.</span>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--v2-nav)]">
        {gene.trait && chip && chip.action !== "hide" && (
          <span className="mr-1.5 inline-flex max-w-full items-baseline gap-1 rounded-full border border-[rgb(189_247_238/0.28)] bg-[rgb(159_240_236/0.06)] px-2 py-px align-baseline text-[11.5px] text-[var(--v2-kicker)]">
            <span className="text-[var(--v2-faint)]">{gene.trait.type}:</span>
            <span className="truncate font-[480]">{chip.display}</span>
          </span>
        )}
        {explanationAfterChip(gene)}
      </p>
    </li>
  );
}

export function StyleChip({ style }: { style: TradingStyle }) {
  return (
    <span className={`v2-badge h-[22px] px-2 text-[10.5px] ${STYLE_TONE[style] ?? STYLE_TONE.balanced}`}>{style}</span>
  );
}

export function GenomeCardSkeleton({ className = "" }: { className?: string }) {
  return (
    <div role="status" className={`v2-card ${className}`}>
      <span className="v2-sr">Loading trading DNA…</span>
      <div aria-hidden className="flex items-start gap-4">
        <span className="v2-skeleton size-14 rounded-[14px]" />
        <span className="flex-1 space-y-2 pt-1">
          <span className="v2-skeleton v2-skeleton--text w-24" />
          <span className="v2-skeleton v2-skeleton--title w-44" />
        </span>
      </div>
      <div aria-hidden className="mt-7 space-y-6">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className="block space-y-2.5">
            <span className="v2-skeleton v2-skeleton--text w-28" />
            <span className="v2-skeleton h-1.5 min-h-0 rounded-full" />
          </span>
        ))}
      </div>
    </div>
  );
}
