import { ChogImage } from "./chog-image";
import { gate, labels, showcaseIds } from "./content";
import { Icon } from "./icons";
import { Section, StyleBadge } from "./primitives";
import { type ShowcaseChog, showcaseChog } from "./showcase";

/** The pass/fail gate, answered head-on: without the NFT there is no trader, no wallet and no authority. */
export function Gate() {
  const chog = showcaseChog(showcaseIds.handover);
  return (
    <Section id={gate.id} eyebrow={gate.eyebrow} title={gate.title} lede={gate.lede}>
      <ul className="mt-12 grid gap-4 md:grid-cols-3">
        {gate.pillars.map((pillar) => (
          <li key={pillar.without} className="landing-reveal card relative overflow-hidden p-6">
            <div className="flex items-center gap-3">
              <span className="relative flex size-11 items-center justify-center rounded-xl bg-accent/15 text-accent-strong ring-1 ring-accent/25 ring-inset">
                <Icon name={pillar.icon} className="size-5" />
                {/* A strike through the icon: take the NFT away and this piece is gone. */}
                <span aria-hidden className="absolute h-0.5 w-8 -rotate-45 rounded-full bg-danger/80" />
              </span>
              <h3 className="text-lg font-semibold tracking-tight">{pillar.without}</h3>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-pretty text-muted">{pillar.body}</p>
          </li>
        ))}
      </ul>

      <Handover chog={chog} />
    </Section>
  );
}

/** Seller → one NFT transfer → buyer, with everything that rides along. */
function Handover({ chog }: { chog: ShowcaseChog | null }) {
  const { handover } = gate;
  return (
    <div className="landing-reveal card mt-6 grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-12">
      <div className="max-w-xl">
        <h3 className="text-2xl font-semibold tracking-tight">{handover.title}</h3>
        <p className="mt-3 leading-relaxed text-pretty text-muted">{handover.body}</p>
      </div>

      <div className="flex flex-col items-center gap-3 md:flex-row md:gap-4">
        <Party label={handover.seller} />
        <Arrow label={handover.transfer} />
        <div className="w-full max-w-[17rem] rounded-2xl border border-line-strong bg-surface-2/70 p-3 shadow-[0_20px_50px_-30px_rgb(131_110_249/0.8)]">
          {chog && (
            <div className="mb-3 flex items-center gap-3 border-b border-line pb-3">
              <ChogImage
                src={chog.image.src}
                fallbackSrc={chog.image.fallbackSrc}
                alt={labels.chog(chog.tokenId)}
                size={96}
                fallbackLabel={`#${chog.tokenId}`}
                className="size-14 shrink-0 rounded-xl"
              />
              <div className="min-w-0">
                <p className="font-mono text-xs text-subtle">{labels.chog(chog.tokenId)}</p>
                <p className="truncate font-semibold">{chog.name}</p>
                <StyleBadge style={chog.style} className="mt-1" />
              </div>
            </div>
          )}
          <ul className="space-y-1.5 text-sm">
            {handover.bundle.map((item) => (
              <li key={item} className="flex items-center gap-2 text-foreground">
                <Icon name="check" className="size-4 text-success" strokeWidth={2.25} />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <Arrow />
        <Party label={handover.buyer} accent />
      </div>
    </div>
  );
}

function Party({ label, accent = false }: { label: string; accent?: boolean }) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5">
      <span
        className={`flex size-12 items-center justify-center rounded-full ring-1 ring-inset ${
          accent ? "bg-accent/20 text-accent-strong ring-accent/40" : "bg-surface-2 text-muted ring-line-strong"
        }`}
      >
        <Icon name="user" className="size-5" />
      </span>
      <span className="text-xs font-medium text-muted">{label}</span>
    </div>
  );
}

function Arrow({ label }: { label?: string }) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1 text-subtle">
      <Icon name="arrowDown" className="size-5 md:-rotate-90" />
      {label && <span className="font-mono text-[11px] whitespace-nowrap">{label}</span>}
    </div>
  );
}
