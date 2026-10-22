import React from "react";
import { interpolate, random } from "remotion";
import { C, display, mono } from "../theme";
import { clamp } from "../ui/motion";
import { ChogCard, easeIn } from "../ui/Bound";
import { Words } from "../ui/Words";
import { Count } from "../ui/Count";
import { Fill, In, Kicker, useCue } from "./common";

/** Real Chog Genesis art (public/landing/hero/chogs, none brand-flagged), token ids. */
export const DECK = [1881, 561, 1667, 70, 851, 1789, 900, 942, 1798, 1884, 196, 539, 923, 981, 1133, 1517, 1708, 1733, 206, 365, 428, 630, 715, 767, 833, 926, 991, 1313, 1447, 1553, 1764, 1797, 1821, 1839, 1913, 272, 943, 1114, 1491];

/** 1,969 Chogs, sitting in wallets, waiting. */
export const Problem: React.FC = () => {
  const { f, rel } = useCue("problem");
  const tSit = rel("sit,");
  const dim = interpolate(f, [tSit - 4, tSit + 30], [0, 0.85], clamp);
  const cols = 6, size = 150, gap = 26;
  return (
    <Fill bg={C.paper} color={C.paperInk}>
      <div style={{ position: "absolute", left: 150, top: 250, width: 720 }}>
        <In at={2}><Kicker color="rgba(13,12,17,0.55)" dot={C.violetA}>Chog Genesis · Monad</Kicker></In>
        <div style={{ marginTop: 20, fontFamily: display, fontSize: 230, fontWeight: 500, letterSpacing: "-0.06em", lineHeight: 0.9, color: C.violetA }}>
          <Count to={1969} at={rel("one")} dur={40} />
        </div>
        <div style={{ marginTop: 18, fontFamily: display, fontSize: 52, letterSpacing: "-0.03em" }}>
          <Words text="Chog Genesis NFTs." at={rel("Chog")} every={4} />
        </div>
        <div style={{ marginTop: 40, fontFamily: display, fontSize: 52, letterSpacing: "-0.03em", color: "rgba(13,12,17,0.55)" }}>
          <Words text="They sit, and they wait." at={tSit} every={4} accent={{ "wait.": C.violetA }} />
        </div>
      </div>
      <div style={{ position: "absolute", left: 1000, top: 0, width: 920, height: 1080, overflow: "hidden", maskImage: "linear-gradient(180deg, transparent, #000 18%, #000 82%, transparent)" }}>
        {DECK.slice(0, 36).map((id, i) => {
          const c = i % cols, r = Math.floor(i / cols);
          const drift = (c % 2 ? -1 : 1) * f * 0.35;
          const y = 40 + r * (size + gap) + drift + (c % 2 ? 60 : 0);
          const p = easeIn(f, 2 + random(`p${i}`) * 26, 22);
          return <ChogCard key={id} id={id} size={size} x={60 + c * (size + gap) + size / 2} y={y + size / 2} p={p} rot={(random(`r${i}`) - 0.5) * 6} dim={dim * (0.6 + 0.4 * random(`d${i}`))} />;
        })}
      </div>
      <div style={{ position: "absolute", left: 150, bottom: 140, fontFamily: mono, fontSize: 15, letterSpacing: "0.1em", color: "rgba(13,12,17,0.45)", opacity: easeIn(f, 30) }}>
        ART: THE COLLECTION'S OWN IMAGES · TOKEN IDS {DECK.slice(0, 4).join(", ")} …
      </div>
    </Fill>
  );
};
