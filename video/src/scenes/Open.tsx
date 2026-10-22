import React from "react";
import { interpolate } from "remotion";
import { C, display, mono } from "../theme";
import { clamp, expo } from "../ui/motion";
import { ChogCard, Glow, Motes, Tether, WalletChip, easeIn } from "../ui/Bound";
import { Words } from "../ui/Words";
import { Count } from "../ui/Count";
import { Fill, Kicker, In, short, tx, utc, useCue } from "./common";

/** 22:41:25 UTC on Monad: Laser Pounce, CHOG #891, gets a wallet of its own. */
export const Open: React.FC = () => {
  const { f, rel } = useCue("open");
  const t = tx("Create the Token Bound");
  const tChog = rel("Chog");
  const tWallet = rel("wallet");
  const card = easeIn(f, tChog - 8, 26);
  const link = interpolate(f, [tWallet - 6, tWallet + 22], [0, 1], { ...clamp, easing: expo });
  const chip = easeIn(f, tWallet + 10, 20);
  const push = interpolate(f, [0, 330], [1.06, 1], clamp);
  return (
    <Fill bg={C.bg}>
      <Glow x="30%" y="55%" color="rgba(77,25,177,0.45)" size="45% 55%" />
      <Glow x="75%" y="45%" color="rgba(159,240,236,0.10)" size="35% 40%" strength={link} />
      <Motes n={30} seed="open" opacity={0.35} />
      <div style={{ position: "absolute", inset: 0, transform: `scale(${push})` }}>
        <div style={{ position: "absolute", left: 160, top: 150 }}>
          <In at={2}><Kicker>Monad mainnet · chain 143</Kicker></In>
          <In at={6} style={{ marginTop: 18, fontFamily: mono, fontSize: 26, color: "rgba(255,255,255,0.85)", letterSpacing: "0.04em" }}>
            BLOCK <Count to={t.blockNumber} at={6} dur={50} style={{ color: C.teal }} /> · 21 OCT 2026 · {utc(t.timestampISO)}
          </In>
        </div>
        <div style={{ position: "absolute", left: 160, top: 300, fontFamily: display, fontSize: 84, fontWeight: 400, letterSpacing: "-0.035em", lineHeight: 1.05, width: 900 }}>
          <Words text="October 21," at={rel("October")} every={4} />
          <br />
          <span style={{ color: "rgba(255,255,255,0.6)" }}><Words text="10:41 at night." at={rel("ten")} every={4} accent={{ "night.": C.violetInk }} /></span>
        </div>
        <ChogCard id={1399} size={330} x={560} y={735} p={card} rot={-4} glow={link} name="Laser Pounce" number="CHOG #891 · token 1399" style={{ color: "#fff" }} />
        <Tether a={[735, 660]} b={[1150, 560]} p={link} pulseAt={tWallet + 30} bend={-0.18} width={3.5} />
        <WalletChip x={1150} y={470} p={chip} width={600} address="0xa46aE236…0aB2AD71" label="Its own ERC-6551 wallet" sub="registry 0x0000…6551 · Tokenbound V3" />
        <div style={{ position: "absolute", left: 1150, top: 680, width: 640, opacity: easeIn(f, tWallet + 26) }}>
          <div style={{ fontFamily: mono, fontSize: 16, letterSpacing: "0.14em", color: "rgba(255,255,255,0.5)" }}>CREATEACCOUNT + INITIALIZE · ONE TX</div>
          <div style={{ marginTop: 8, fontFamily: mono, fontSize: 22, color: C.teal }}>{short(t.hash, 14, 10)}</div>
        </div>
        <div style={{ position: "absolute", left: 1150, top: 800, fontFamily: display, fontSize: 64, letterSpacing: "-0.03em" }}>
          <Words text="A wallet of its own." at={rel("A")} every={4} accent={{ "own.": C.teal }} />
        </div>
      </div>
    </Fill>
  );
};
