import React from "react";
import { Sequence } from "remotion";
import { C, display, mono, sans } from "../theme";
import { Browser } from "../ui/Footage";
import { Glow, Motes, easeIn } from "../ui/Bound";
import { Words } from "../ui/Words";
import { Card, Fill, In, Kicker, useCue } from "./common";

/** Traits compile into a genome; the landing deck, the genes, then the House Chog's first-visit guide. */
export const Meet: React.FC = () => {
  const { f, rel, dur } = useCue("meet");
  const tLaser = rel("Laser");
  const tCrowns = rel("Crowns");
  const tSame = rel("Same");
  const tLeague = rel("League");
  const tFirst = rel("first");
  const genes = [
    { at: tLaser, trait: "Eyes · Laser", gene: "Signal", says: "chases breakouts" },
    { at: tCrowns, trait: "Head · Crown", gene: "Size", says: "trades big" },
    { at: tSame, trait: "Up to 13 traits → 8 genes", gene: "Genome g1-7de62b", says: "a pure function of the NFT" },
  ];
  return (
    <Fill bg={C.bg}>
      <Glow x="25%" y="40%" color="rgba(77,25,177,0.35)" size="50% 60%" />
      <Motes n={18} seed="meet" opacity={0.25} />
      <div style={{ position: "absolute", left: 90, top: 92 }}>
        <In at={0}><Kicker>Meet · trading DNA</Kicker></In>
      </div>
      <Sequence from={0} durationInFrames={tFirst + 6} layout="none">
        <Browser name="hero" url="useanimr.vercel.app" width={1120} left={90} top={150} startFrom={20} stopAt={185}
          cams={[{ f: 0, z: 1 }, { f: 70, rect: { x: 760, y: 40, w: 760, h: 600 }, z: 1.45 }, { f: tLeague - 10, rect: { x: 760, y: 40, w: 760, h: 600 }, z: 1.45 }, { f: tLeague + 20, rect: { x: 0, y: 570, w: 700, h: 180 }, z: 1.9 }]} />
      </Sequence>
      <Sequence from={tFirst - 6} layout="none">
        <Browser name="guide" url="useanimr.vercel.app/chog/1399 · first visit" width={1120} left={90} top={150} startFrom={60}
          cams={[{ f: 0, rect: { x: 220, y: 30, w: 700, h: 400 }, z: 1.85 }, { f: 60, rect: { x: 220, y: 30, w: 700, h: 400 }, z: 1.85 }, { f: 140, rect: { x: 360, y: 30, w: 700, h: 400 }, z: 1.85 }]} />
      </Sequence>
      {genes.map((g, i) => (
        <Card key={i} at={g.at - 4} left={1270} top={170 + i * 175} width={560} accent={i === 2 ? C.violetB : C.teal}>
          <div style={{ fontFamily: mono, fontSize: 15, letterSpacing: "0.12em", color: "rgba(255,255,255,0.55)", textTransform: "uppercase" }}>{g.trait}</div>
          <div style={{ marginTop: 8, fontFamily: display, fontSize: 38, letterSpacing: "-0.02em" }}>
            {g.gene} <span style={{ color: i === 2 ? C.violetInk : C.teal, fontSize: 28 }}>→ {g.says}</span>
          </div>
        </Card>
      ))}
      <div style={{ position: "absolute", left: 1270, top: 720, width: 580, opacity: easeIn(f, tLeague - 4) }}>
        <div style={{ display: "flex", gap: 40, alignItems: "baseline" }}>
          <div><div style={{ fontFamily: display, fontSize: 76, letterSpacing: "-0.04em" }}>1,969</div><div style={{ fontFamily: sans, fontSize: 18, color: "rgba(255,255,255,0.6)" }}>traders in the League</div></div>
          <div><div style={{ fontFamily: display, fontSize: 76, letterSpacing: "-0.04em", color: C.teal }}>49%</div><div style={{ fontFamily: sans, fontSize: 18, color: "rgba(255,255,255,0.6)" }}>beat just holding*</div></div>
        </div>
        <div style={{ marginTop: 12, fontFamily: mono, fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.5 }}>*Backtest: each Chog's trading DNA replayed on real hourly $CHOG prices (Sep 7 to Oct 22, 2026), with the pool's 1% fee and price impact. Live landing page, Oct 22.</div>
      </div>
      <div style={{ position: "absolute", left: 90, top: 860, fontFamily: display, fontSize: 40, letterSpacing: "-0.02em", opacity: dur ? 1 : 1 }}>
        <Words text="Same traits, same trader." at={tSame} every={4} accent={{ "trader.": C.teal }} out={tLeague + 40} />
      </div>
    </Fill>
  );
};
