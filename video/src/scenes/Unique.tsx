import React from "react";
import { interpolate } from "remotion";
import { C, GRAD, display, mono } from "../theme";
import { clamp, soft } from "../ui/motion";
import { ChogCard, Glow, Tether, WalletChip, easeIn } from "../ui/Bound";
import { Words } from "../ui/Words";
import { Fill, In, Kicker, useCue } from "./common";

/** Why the Chog is essential: three claims with their proof, then the card and its wallet move as one. */
export const Unique: React.FC = () => {
  const { f, rel } = useCue("unique");
  const claims = [
    { at: rel("trader."), head: "No NFT, no trader.", proof: "the genome is a pure function of its traits" },
    { at: rel("wallet.") , head: "No NFT, no wallet.", proof: "the ERC-6551 registry derives it from Chog Genesis + token id" },
    { at: rel("authority."), head: "No NFT, no authority.", proof: "ownerOf signs: wake the AI, go on-chain, grant the guard" },
  ];
  const tSell = rel("Sell");
  // On "Sell": the card and its tethered wallet slide to a new holder together.
  const move = interpolate(f, [tSell + 10, tSell + 60], [0, 1], { ...clamp, easing: soft });
  const dx = move * 0, dy = move * 230;
  return (
    <Fill bg={GRAD}>
      <Glow x="75%" y="40%" color="rgba(159,240,236,0.18)" size="35% 45%" />
      <div style={{ position: "absolute", left: 120, top: 92 }}><In at={0}><Kicker color="rgba(255,255,255,0.75)">Why the Chog matters</Kicker></In></div>
      <div style={{ position: "absolute", left: 120, top: 190, width: 980 }}>
        {claims.map((c, i) => (
          <div key={i} style={{ marginBottom: 44 }}>
            <div style={{ fontFamily: display, fontSize: 76, letterSpacing: "-0.04em", lineHeight: 1 }}>
              <Words text={c.head} at={c.at - 14} every={3} accent={{ [c.head.split(" ").pop()!]: C.teal }} />
            </div>
            <In at={c.at + 4} style={{ marginTop: 12, fontFamily: mono, fontSize: 19, color: "rgba(255,255,255,0.75)", letterSpacing: "0.02em" }}>{c.proof}</In>
          </div>
        ))}
        <div style={{ marginTop: 10, fontFamily: display, fontSize: 40, letterSpacing: "-0.02em", color: "rgba(255,255,255,0.88)" }}>
          <Words text="Sell the Chog: its trader, wallet and trophies go with it." at={tSell} every={3} accent={{ "with": C.teal }} />
        </div>
      </div>
      <div style={{ position: "absolute", left: 1460, top: 160 + dy - 40, fontFamily: mono, fontSize: 15, letterSpacing: "0.12em", color: "rgba(255,255,255,0.7)", opacity: easeIn(f, 10) }}>
        HELD BY {move > 0.5 ? "THE NEXT HOLDER" : "0xc742…960C"}
      </div>
      <ChogCard id={1399} size={240} x={1340 + dx} y={330 + dy} p={easeIn(f, 6, 24)} rot={-4} glow={0.7} />
      <Tether a={[1460 + dx, 330 + dy]} b={[1560 + dx, 560 + dy]} p={easeIn(f, 14, 26)} pulseAt={40} bend={-0.2} />
      <WalletChip x={1450 + dx} y={560 + dy} p={easeIn(f, 24)} width={400} address="0xa46a…AD71" sub="15,000 $CHOG · 1,000 WMON" />
    </Fill>
  );
};
