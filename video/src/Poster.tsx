import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { C, display, mono } from "./theme";
import { ChogCard } from "./ui/Bound";

/**
 * YouTube thumbnail: three big words that read at any size, the real House Chog (Laser Pounce,
 * CHOG #891), and the real stake. "Monad said NO." is the heist page's own verdict.
 */
export const Poster: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg, color: "#fff", fontFamily: display, overflow: "hidden" }}>
    <AbsoluteFill style={{ background: "radial-gradient(48% 62% at 74% 52%, rgba(111,90,220,0.75), rgba(77,25,177,0.25) 55%, transparent 75%)" }} />
    <AbsoluteFill style={{ background: "radial-gradient(40% 50% at 20% 80%, rgba(255,122,138,0.18), transparent 70%)" }} />
    <ChogCard id={1399} size={700} x={1430} y={560} rot={5} glow={1} />
    <div style={{ position: "absolute", left: 1070, top: 870, padding: "14px 26px", borderRadius: 18, background: "rgba(13,12,17,0.9)", border: `3px solid ${C.teal}`, fontFamily: mono, fontWeight: 500, fontSize: 42, color: C.teal, transform: "rotate(-3deg)", boxShadow: "0 20px 50px rgba(0,0,0,0.6)" }}>
      15,000 $CHOG inside
    </div>
    <Img src={staticFile("brand/animr-header.png")} style={{ position: "absolute", left: 80, top: 70, height: 110 }} />
    <div style={{ position: "absolute", left: 80, top: 290, fontWeight: 800, fontSize: 200, lineHeight: 0.92, letterSpacing: "-0.055em" }}>
      <div>Monad</div>
      <div>said <span style={{ color: C.danger, textShadow: "0 0 50px rgba(255,122,138,0.55)" }}>NO.</span></div>
    </div>
    <div style={{ position: "absolute", left: 86, top: 760, fontWeight: 600, fontSize: 54, letterSpacing: "-0.03em", color: "rgba(255,255,255,0.88)", width: 900, lineHeight: 1.15 }}>
      The AI can be fooled.<br /><span style={{ color: C.teal }}>The NFT can't.</span>
    </div>
  </AbsoluteFill>
);
