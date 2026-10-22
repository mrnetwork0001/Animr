import React from "react";
import { Img, Sequence, interpolate, staticFile } from "remotion";
import { C, display, mono, sans } from "../theme";
import { clamp, expo, soft } from "../ui/motion";
import { Browser } from "../ui/Footage";
import { ChogCard, Glow, Motes, Tether, easeIn } from "../ui/Bound";
import { Words } from "../ui/Words";
import { Fill, useCue } from "./common";
import { DECK } from "./Problem";

/** The end card: lockup, the four verbs, what's next (a holder's own view), and the URL. */
export const Close: React.FC = () => {
  const { f, rel, dur } = useCue("close");
  const tName = rel("Animr.");
  const tMeet = rel("Meet");
  const tNext = rel("Next,");
  const lock = interpolate(f, [tName - 6, tName + 18], [0, 1], { ...clamp, easing: expo });
  const side = interpolate(f, [tNext - 10, tNext + 14, dur - 90, dur - 66], [0, 1, 1, 0], { ...clamp, easing: soft });
  const ids = [DECK[1], DECK[4], DECK[7], 1399, DECK[10], DECK[13], DECK[16]];
  return (
    <Fill bg={C.bg}>
      <Glow x="50%" y="42%" color="rgba(77,25,177,0.5)" size="45% 50%" />
      <Motes n={28} seed="close" opacity={0.35} />
      <div style={{ position: "absolute", inset: 0, transform: `translateX(${side * -360}px)` }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 290, display: "flex", justifyContent: "center", opacity: lock, transform: `scale(${0.9 + 0.1 * lock})` }}>
          <Img src={staticFile("brand/animr-header.png")} style={{ height: 150, filter: `drop-shadow(0 0 ${40 * lock}px rgba(111,90,220,0.6))` }} />
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 480, textAlign: "center", fontFamily: display, fontSize: 56, letterSpacing: "-0.03em" }}>
          <Words text="Meet it. Race it. Ride it. Rob it." at={tMeet} every={3} accent={{ "rob": C.teal }} />
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 590, display: "flex", justifyContent: "center", opacity: easeIn(f, tMeet + 30) }}>
          <div style={{ fontFamily: mono, fontSize: 26, padding: "12px 28px", borderRadius: 999, background: "linear-gradient(90deg, #4d19b1, #6f5adc)", boxShadow: "0 14px 36px -12px rgba(111,90,220,0.85)" }}>useanimr.vercel.app</div>
        </div>
        {ids.map((id, i) => {
          const x = 960 + (i - 3) * 150, y = 820;
          return (
            <React.Fragment key={id}>
              {i < ids.length - 1 ? <Tether a={[x + 50, y]} b={[x + 100, y]} p={easeIn(f, tMeet + 20 + i * 4, 16)} bend={0} width={2} /> : null}
              <ChogCard id={id} size={96} x={x} y={y} p={easeIn(f, tMeet + 10 + i * 4, 20)} rot={(i - 3) * 2} glow={id === 1399 ? 0.8 : 0} />
            </React.Fragment>
          );
        })}
        <div style={{ position: "absolute", left: 0, right: 0, top: 905, display: "flex", justifyContent: "center", alignItems: "center", gap: 36, opacity: easeIn(f, tMeet + 40) }}>
          <span style={{ fontFamily: mono, fontSize: 13, letterSpacing: "0.18em", color: "rgba(255,255,255,0.5)" }}>BUILT ON</span>
          <Img src={staticFile("logos/monad.svg")} style={{ height: 22 }} />
          <Img src={staticFile("logos/tokenbound.svg")} style={{ height: 20 }} />
          <Img src={staticFile("logos/0g.svg")} style={{ height: 26 }} />
          <span style={{ width: 1, height: 26, background: "rgba(255,255,255,0.2)" }} />
          <Img src={staticFile("logos/chog.png")} style={{ height: 30, borderRadius: 6 }} />
          <span style={{ fontFamily: sans, fontSize: 16, color: "rgba(255,255,255,0.65)" }}>for Chogathon 2026</span>
        </div>
      </div>
      {/* What's next: a holder's own logged-in view, from the owner's recording */}
      <div style={{ opacity: side }}>
        <Sequence from={tNext - 10} layout="none">
          <Browser name="owner" url="useanimr.vercel.app/app · logged in" width={760} left={1110} top={300} startFrom={150} cams={[{ f: 0, rect: { x: 40, y: 170, w: 760, h: 460 }, z: 1.5 }]} />
        </Sequence>
        <div style={{ position: "absolute", left: 1110, top: 760, width: 760, fontFamily: sans, fontSize: 19, color: "rgba(255,255,255,0.7)", opacity: side }}>
          Next: every holder switches theirs on. Held by 0xc742…960C, Laser Pounce trades for its holder.
        </div>
      </div>
    </Fill>
  );
};
