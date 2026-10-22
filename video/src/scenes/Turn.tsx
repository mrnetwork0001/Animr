import React from "react";
import { Img, interpolate, staticFile } from "remotion";
import { C, GRAD, display } from "../theme";
import { clamp, expo } from "../ui/motion";
import { ChogCard, Glow, Motes, Tether, easeIn } from "../ui/Bound";
import { Words } from "../ui/Words";
import { Fill, useCue } from "./common";
import { DECK } from "./Problem";

/** Full-bleed violet: the Animr lockup, every Chog tethered to it, and the line the product rests on. */
export const Turn: React.FC = () => {
  const { f, rel } = useCue("turn");
  const tName = rel("Animr.");
  const tEvery = rel("Every");
  const tIts = rel("Its");
  const mark = interpolate(f, [tName - 8, tName + 18], [0, 1], { ...clamp, easing: expo });
  const word = interpolate(f, [tName + 2, tName + 22], [0, 1], { ...clamp, easing: expo });
  const ring = interpolate(f, [tName - 4, tName + 40], [0, 1], clamp);
  const ids = [DECK[0], DECK[3], DECK[6], DECK[9], DECK[12], DECK[15], DECK[18], DECK[21]];
  const cx = 960, cy = 400;
  return (
    <Fill bg={GRAD}>
      <Glow x="50%" y="38%" color="rgba(159,240,236,0.22)" size="40% 45%" />
      <Motes n={22} seed="turn" color="#ffffff" opacity={0.3} />
      {/* the burst ring on the logo hit */}
      <div style={{ position: "absolute", left: cx - 400, top: cy - 400, width: 800, height: 800, borderRadius: "50%", border: `2px solid rgba(159,240,236,${0.7 * (1 - ring)})`, transform: `scale(${0.2 + ring * 1.4})` }} />
      {ids.map((id, i) => {
        const a = (i / ids.length) * Math.PI * 2 + 0.3;
        const x = cx + Math.cos(a) * 780, y = cy + 160 + Math.sin(a) * 380;
        const p = easeIn(f, tEvery - 6 + i * 3, 22);
        return (
          <React.Fragment key={id}>
            <Tether a={[x, y]} b={[cx, cy]} p={interpolate(f, [tEvery + i * 3, tEvery + i * 3 + 24], [0, 1], { ...clamp, easing: expo }) * 0.98} bend={0.12} color="rgba(159,240,236,0.55)" width={1.6} />
            <ChogCard id={id} size={118} x={x} y={y} p={p} rot={(i % 2 ? 1 : -1) * 6} />
          </React.Fragment>
        );
      })}
      <div style={{ position: "absolute", left: 0, right: 0, top: cy - 90, display: "flex", justifyContent: "center", alignItems: "center", gap: 26 }}>
        <Img src={staticFile("brand/animr-mark.png")} style={{ width: 170, height: 170, opacity: mark, transform: `scale(${0.5 + 0.5 * mark}) rotate(${(1 - mark) * -20}deg)`, filter: `drop-shadow(0 0 ${30 * mark}px rgba(159,240,236,0.5))` }} />
        <div style={{ fontFamily: display, fontWeight: 600, fontSize: 170, letterSpacing: "-0.05em", color: "#fff", opacity: word, clipPath: `inset(0 ${(1 - word) * 100}% 0 0)`, transform: `translateX(${(1 - word) * -30}px)` }}>animr</div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 640, textAlign: "center", fontFamily: display, fontSize: 64, letterSpacing: "-0.03em", lineHeight: 1.2, color: "#fff" }}>
        <div><Words text="Every Chog is an AI trader." at={tEvery} every={3} accent={{ "trader.": C.teal }} /></div>
        <div style={{ fontSize: 40, color: "rgba(255,255,255,0.78)", marginTop: 14 }}><Words text="Its traits are its strategy. The $CHOG market keeps score." at={tIts} every={3} /></div>
      </div>
    </Fill>
  );
};
