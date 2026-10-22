import React from "react";
import { Sequence } from "remotion";
import { C, mono } from "../theme";
import { Browser, markOf } from "../ui/Footage";
import { Glow } from "../ui/Bound";
import { Fill, In, Kicker, SIM, useCue } from "./common";

/** Versus: one pick, the race, the KO and its real dates. Then Breed. */
export const Rewind: React.FC = () => {
  const { rel } = useCue("rewind");
  const tCall = rel("Call");
  const tKnock = rel("knockout,");
  const tBreed = rel("breed");
  const W = 1380, L = 270, TOP = 120;
  const pick = markOf("versus", "versus.pick");
  const ko = markOf("versus", "versus.ko");
  return (
    <Fill bg={C.bg}>
      <Glow x="50%" y="50%" color="rgba(111,90,220,0.25)" size="55% 55%" />
      <div style={{ position: "absolute", left: 90, top: 92 }}><In at={0}><Kicker>Versus · Breed</Kicker></In></div>
      <div style={{ position: "absolute", right: 90, top: 86 }}>
        <In at={6}><div style={{ fontFamily: mono, fontSize: 15, letterSpacing: "0.08em", color: C.warning, border: `1px solid rgba(242,193,107,0.5)`, borderRadius: 999, padding: "6px 14px" }}>{SIM.toUpperCase()}</div></In>
      </div>
      {/* the tale of the tape, the pick and the race */}
      <Sequence from={0} durationInFrames={tKnock - 4} layout="none">
        <Browser name="versus" url="useanimr.vercel.app/versus" width={W} left={L} top={TOP} startFrom={Math.max(0, pick - tCall - 10)}
          cams={[{ f: 0, rect: { x: 300, y: 250, w: 1000, h: 500 }, z: 1.25 }, { f: tCall + 20, rect: { x: 300, y: 250, w: 1000, h: 500 }, z: 1.25 }, { f: tCall + 50, z: 1 }]} />
      </Sequence>
      {/* the KO and the real dates */}
      <Sequence from={tKnock - 6} durationInFrames={tBreed - tKnock + 4} layout="none">
        <Browser name="versus" url="useanimr.vercel.app/versus" width={W} left={L} top={TOP} startFrom={ko - 40}
          cams={[{ f: 0, z: 1 }, { f: 40, rect: { x: 40, y: 80, w: 1520, h: 300 }, z: 1.3 }, { f: 80, rect: { x: 40, y: 520, w: 1100, h: 300 }, z: 1.45 }]} />
      </Sequence>
      <Sequence from={tBreed - 6} layout="none">
        <Browser name="breed" url="useanimr.vercel.app/breed" width={W} left={L} top={TOP} startFrom={20}
          cams={[{ f: 0, z: 1 }, { f: 70, z: 1.3, rect: { x: 40, y: 330, w: 1200, h: 560 } }]} />
      </Sequence>
    </Fill>
  );
};
