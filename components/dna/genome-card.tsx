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
    <div role="alert" className={`card px-5 py-8 text-center ${className}`}>
      <p className="font-medium text-danger">Couldn&apos;t read Chog #{tokenId}&apos;s DNA</p>
      <p className="mt-1 break-words font-mono text-xs text-muted">{error.message}</p>
      <button type="button" onClick={() => refetch()} disabled={isFetching} className="btn btn-secondary mt-4">
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
    <section aria-labelledby={headingId} className={`card p-5 sm:p-6 ${className}`}>
      <div className="flex items-start gap-4">
        {!hideIdentity && <ChogThumb image={chog.image} tokenId={chog.id} size={56} className="rounded-2xl" />}
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Trading DNA</p>
          <h2 id={headingId} className="mt-1 text-xl font-semibold tracking-tight text-balance">
            {hideIdentity ? `The genes behind the ${genome.archetype}` : genome.archetype}
          </h2>
          {!hideIdentity && (
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              {/* Both numbers: the name marketplaces show and the token id ("CHOG #1462 · token 1"). */}
              <span className="font-medium text-foreground">{chogLabel(chog.id, { metadataName: chog.name })}</span>
              {/* Its persona name, the one every page shows. */}
              <span className="text-subtle">{persona}</span>
              <StyleChip style={genome.style} />
            </p>
          )}
        </div>
      </div>

      {genome.genes.length > 0 ? (
        <ul className="mt-5 space-y-4">
          {genome.genes.map((gene, i) => (
            <GeneRow key={gene.key} gene={gene} index={i} />
          ))}
        </ul>
      ) : (
        <p className="mt-5 text-sm text-muted">This Chog&apos;s metadata couldn&apos;t be read, so it trades on default genes.</p>
      )}

      <p className="mt-5 border-t border-line/70 pt-4 text-xs leading-relaxed text-subtle">
        Compiled from this Chog&apos;s traits by genome <span className="font-mono text-muted">{genome.version}</span>.
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
        <span className="text-[11px] font-medium uppercase tracking-wider text-subtle">{gene.label}</span>
        <span className="text-right text-sm font-medium text-foreground">{gene.display}</span>
      </div>
      <div aria-hidden className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
        <div
          className="dna-grow h-full rounded-full bg-linear-to-r from-accent-deep to-accent-strong"
          style={{ width: `${Math.max(value, 3)}%`, animationDelay: `${index * 70}ms` }}
        />
      </div>
      <span className="sr-only">{Math.round(value)} out of 100.</span>
      <p className="mt-1.5 text-xs leading-relaxed text-muted">
        {gene.trait && chip && chip.action !== "hide" && (
          <span className="mr-1.5 inline-flex max-w-full items-baseline gap-1 rounded-md bg-accent/10 px-1.5 py-px align-baseline text-[11px] text-accent-strong ring-1 ring-inset ring-accent/25">
            <span className="text-subtle">{gene.trait.type}:</span>
            <span className="truncate font-medium">{chip.display}</span>
          </span>
        )}
        {explanationAfterChip(gene)}
      </p>
    </li>
  );
}

export function StyleChip({ style }: { style: TradingStyle }) {
  return (
    <span
      className={`rounded px-1.5 py-px text-[10px] font-medium uppercase tracking-wider ring-1 ring-inset ${STYLE_TONE[style] ?? STYLE_TONE.balanced}`}
    >
      {style}
    </span>
  );
}

export function GenomeCardSkeleton({ className = "" }: { className?: string }) {
  return (
    <div role="status" className={`card p-5 sm:p-6 ${className}`}>
      <span className="sr-only">Loading trading DNA…</span>
      <div aria-hidden className="flex items-start gap-4">
        <span className="size-14 animate-pulse rounded-2xl bg-surface-2" />
        <span className="flex-1 space-y-2 pt-1">
          <span className="block h-3 w-24 animate-pulse rounded bg-surface-2" />
          <span className="block h-5 w-40 animate-pulse rounded bg-surface-2" />
          <span className="block h-3 w-32 animate-pulse rounded bg-surface-2/60" />
        </span>
      </div>
      <div aria-hidden className="mt-6 space-y-5">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className="block space-y-2">
            <span className="block h-3 w-28 animate-pulse rounded bg-surface-2/70" />
            <span className="block h-2 animate-pulse rounded-full bg-surface-2" />
          </span>
        ))}
      </div>
    </div>
  );
}
