import { ChogImage } from "./chog-image";
import { gate, showcaseIds } from "./content";
import { Icon } from "./icons";
import { Section, StyleBadge } from "./primitives";
import { type ShowcaseChog, showcaseChog } from "./showcase";

/** The pass/fail gate, answered head-on: without the NFT there is no trader, no wallet and no authority. */
export function Gate() {
  const chog = showcaseChog(showcaseIds.handover);
  return (
    <Section id={gate.id} title={gate.title} lede={gate.lede}>
      <Handover chog={chog} />
    </Section>
  );
}

/** Seller → one NFT transfer → buyer, with everything that rides along. */
function Handover({ chog }: { chog: ShowcaseChog | null }) {
  const { handover } = gate;
  return (
    <div className="v2-card v2-card--feature lp-handover lp-reveal">
      <div className="lp-handover-copy">
        <h3 className="lp-h3-lg">{handover.title}</h3>
        <p className="lp-card-p">{handover.body}</p>
      </div>

      <div className="lp-handover-flow">
        <Party label={handover.seller} />
        <Arrow label={handover.transfer} />
        <div className="lp-bundle">
          {chog && (
            <div className="lp-bundle-head">
              <ChogImage
                src={chog.image.src}
                fallbackSrc={chog.image.fallbackSrc}
                alt={chog.label}
                size={112}
                fallbackLabel={`#${chog.tokenId}`}
                className="lp-avatar"
              />
              <div className="lp-min0">
                <p className="lp-bundle-name">{chog.name}</p>
                <p className="lp-mono-label">{chog.label}</p>
                <StyleBadge style={chog.style} />
              </div>
            </div>
          )}
          <ul className="lp-checks">
            {handover.bundle.map((item) => (
              <li key={item}>
                <Icon name="check" className="lp-check-icon" strokeWidth={2.25} />
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
    <div className="lp-party">
      <span className={`lp-party-dot ${accent ? "lp-party-dot--accent" : ""}`}>
        <Icon name="user" className="lp-party-icon" strokeWidth={1.5} />
      </span>
      <span className="lp-party-label">{label}</span>
    </div>
  );
}

function Arrow({ label }: { label?: string }) {
  return (
    <div className="lp-flow-arrow">
      <span aria-hidden="true" className="lp-flow-line" />
      {label && <span className="lp-flow-label">{label}</span>}
    </div>
  );
}
