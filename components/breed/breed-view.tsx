/* eslint-disable @next/next/no-img-element -- IPFS / resizer hosts aren't in next/image's allowlist */
import { ChogThumb } from "@/components/dna/chog-thumb";
import { SIM_LABEL, signedPct, windowDates } from "@/components/dna/shared";
import { chogThumbUrl } from "@/components/dna/thumb-url";
import { GlassCard, PillLink, StatRow } from "@/components/v2";
import type { BreedParent, BreedResult } from "@/lib/breed/breed";
import { possessive } from "@/lib/possessive";
import { BreedChart, type BreedLine } from "./breed-chart";

// The /breed result: the family (two parents + their child), the three replays on one chart, the verdict, and which
// parent passed each trait. Server-rendered; only the chart and the picker are client code.

const LINES: BreedLine[] = [
  { key: "child", label: "Child", color: "var(--v2-chart-1)", ink: "var(--v2-teal)", width: 2.5, glow: true },
  { key: "a", label: "Parent A", color: "var(--v2-chart-2)", ink: "var(--v2-violet-ink)", width: 1.75 },
  { key: "b", label: "Parent B", color: "var(--v2-chart-3)", ink: "var(--v2-chart-3)", width: 1.5 },
];
const DOT = { a: "var(--v2-chart-2)", b: "var(--v2-chart-3)" } as const;

const tone = (pct: number): "up" | "down" | undefined => (Math.abs(pct) < 0.05 ? undefined : pct > 0 ? "up" : "down");
const tradesText = (n: number) => `${n} trade${n === 1 ? "" : "s"}`;

function ParentCard({ parent, side }: { parent: BreedParent; side: "a" | "b" }) {
  return (
    <GlassCard href={`/chog/${parent.tokenId}`} padding="tight" className="min-w-0" aria-label={`${parent.name}, ${parent.label}: open its profile`}>
      <ChogThumb image={parent.image} tokenId={parent.tokenId} size={240} box="aspect-square w-full rounded-[var(--v2-r-md)]" eager />
      <p className="mt-3 flex items-center gap-2 text-xs text-[var(--v2-faint)]">
        <span aria-hidden className="inline-block size-2 rounded-full" style={{ background: DOT[side] }} />
        Parent {side.toUpperCase()}
      </p>
      <p className="v2-h3 mt-1 truncate">{parent.name}</p>
      <p className="truncate text-sm text-[var(--v2-nav)]">{parent.label}</p>
      <p className="mt-1 truncate text-sm text-[var(--v2-faint)]">{parent.archetype}</p>
    </GlassCard>
  );
}

/** The child's portrait: parent A's left half beside parent B's right half. A composite of real art, never generated. */
function ChildPortrait({ a, b }: { a: BreedParent; b: BreedParent }) {
  const half = (parent: BreedParent, clip: string) =>
    parent.image ? (
      <img
        src={chogThumbUrl(parent.image, 480)}
        alt=""
        width={240}
        height={240}
        loading="eager"
        decoding="async"
        referrerPolicy="no-referrer"
        className="absolute inset-0 size-full object-cover"
        style={{ clipPath: clip }}
      />
    ) : null;
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-[var(--v2-r-md)] bg-[var(--v2-bg-raised)]">
      {half(a, "inset(0 50% 0 0)")}
      {half(b, "inset(0 0 0 50%)")}
      <span aria-hidden className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[var(--v2-bg)]" />
    </div>
  );
}

export function BreedView({ result }: { result: BreedResult }) {
  const { a, b, child, verdict } = result;
  const parentName = { a: a.name, b: b.name };
  const lines = LINES.map((line) => (line.key === "a" ? { ...line, label: a.name } : line.key === "b" ? { ...line, label: b.name } : { ...line, label: child.name }));
  const summary = `${child.name} ${signedPct(child.edgePct)}, ${a.name} ${signedPct(a.edgePct)}, ${b.name} ${signedPct(b.edgePct)} vs just holding $CHOG, ${windowDates(result.window)}.`;

  return (
    <div className="v2-stack v2-stack--lg">
      {/* The family */}
      <div className="grid grid-cols-2 items-center gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1.15fr)] md:gap-4 lg:max-w-[1040px]">
        <ParentCard parent={a} side="a" />
        <span aria-hidden className="hidden text-2xl text-[var(--v2-faint)] md:block">
          +
        </span>
        <ParentCard parent={b} side="b" />
        <span aria-hidden className="hidden text-2xl text-[var(--v2-faint)] md:block">
          =
        </span>
        <GlassCard padding="tight" className="col-span-2 min-w-0 md:col-span-1">
          <div className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)] items-center gap-4 md:grid-cols-1 md:gap-0">
            <ChildPortrait a={a} b={b} />
            <div className="min-w-0 md:mt-3">
              <p className="text-xs text-[var(--v2-faint)]">Their child</p>
              <p className="v2-h2 mt-1 truncate">{child.name}</p>
              <p className="mt-1 truncate text-sm text-[var(--v2-nav)]">{child.archetype}</p>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* The race */}
      <GlassCard as="section" aria-labelledby="breed-verdict">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div className="min-w-0">
            <h2 id="breed-verdict" className="v2-h2">
              {verdict.text}
            </h2>
            <p className="v2-muted mt-1 text-sm">Same real $CHOG chart, {windowDates(result.window)}.</p>
          </div>
          <StatRow
            size="sm"
            inline
            stats={[
              { key: "child", label: child.name, hint: tradesText(child.trades), value: signedPct(child.edgePct), tone: tone(child.edgePct) },
              { key: "a", label: a.name, hint: tradesText(a.trades), value: signedPct(a.edgePct), tone: tone(a.edgePct) },
              { key: "b", label: b.name, hint: tradesText(b.trades), value: signedPct(b.edgePct), tone: tone(b.edgePct) },
            ]}
          />
        </div>
        <div className="mt-6">
          <BreedChart points={result.points} lines={lines} summary={summary} />
        </div>
        <p className="v2-note mt-4">{SIM_LABEL}. Scores are vs just holding the same {result.startChog.toLocaleString("en-US")} $CHOG.</p>
      </GlassCard>

      {/* The genes */}
      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard as="section" aria-labelledby="breed-traits">
          <h2 id="breed-traits" className="v2-h3">
            Who passed what
          </h2>
          <div className="v2-table-wrap mt-4">
            <table className="v2-table">
              <thead>
                <tr>
                  <th scope="col">Trait</th>
                  <th scope="col">Value</th>
                  <th scope="col">From</th>
                </tr>
              </thead>
              <tbody>
                {child.traits.map((trait) => (
                  <tr key={trait.type}>
                    <td className="text-[var(--v2-nav)]">{trait.type}</td>
                    <td>{trait.value ?? <span className="text-[var(--v2-faint)]">None</span>}</td>
                    <td>
                      <span className="inline-flex items-center gap-2 whitespace-nowrap">
                        <span aria-hidden className="inline-block size-2 shrink-0 rounded-full" style={{ background: DOT[trait.from] }} />
                        <span className="hidden sm:inline">{parentName[trait.from]}</span>
                        <span className="sm:hidden">
                          <span aria-hidden>{trait.from.toUpperCase()}</span>
                          <span className="v2-sr">{parentName[trait.from]}</span>
                        </span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>

        <GlassCard as="section" aria-labelledby="breed-dna">
          <h2 id="breed-dna" className="v2-h3">
            {possessive(child.name)} Trading DNA
          </h2>
          <ul className="mt-4 grid gap-4">
            {child.genes.map((gene) => (
              <li key={gene.key} className="min-w-0">
                <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                  <span className="text-[var(--v2-nav)]">{gene.label}</span>
                  <span className="text-[var(--v2-ink)]">{gene.display}</span>
                </p>
                <div className="v2-meter mt-1.5" style={{ ["--v2-value" as string]: `${Math.max(2, Math.min(100, gene.value))}%` }}>
                  <span />
                </div>
                <p className="mt-1.5 text-sm text-[var(--v2-faint)]">{gene.explanation}</p>
              </li>
            ))}
          </ul>
        </GlassCard>
      </div>

      <div className="flex flex-wrap gap-2">
        <PillLink href={`/versus?a=${a.tokenId}&b=${b.tokenId}`} variant="glass" arrow>
          Race the parents in Versus
        </PillLink>
        <PillLink href={`/replay/${a.tokenId}`} variant="ghost">
          {possessive(a.name)} Time Machine
        </PillLink>
        <PillLink href={`/replay/${b.tokenId}`} variant="ghost">
          {possessive(b.name)} Time Machine
        </PillLink>
      </div>
    </div>
  );
}
