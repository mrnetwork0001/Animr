import React from "react";
import { interpolate } from "remotion";
import { C, display, mono, sans } from "../theme";
import { clamp } from "../ui/motion";
import { Sequence } from "remotion";
import { Browser, clip, syncTo } from "../ui/Footage";
import { easeIn } from "../ui/Bound";
import { Words } from "../ui/Words";
import { Fill, In, Kicker, useCue } from "./common";

/** The Bell's strike wave: rings that roll out from the bell when it rings. */
const Strike: React.FC<{ x: number; y: number; at: number; color: string }> = ({ x, y, at, color }) => {
  const { f } = useCue("bell");
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}>
      {[0, 1, 2, 3].map((i) => {
        const t = (f - at - i * 9) / 70;
        if (t < 0 || t > 1) return null;
        return <circle key={i} cx={x} cy={y} r={30 + t * 420} fill="none" stroke={color} strokeWidth={3 * (1 - t)} opacity={(1 - t) * 0.8} />;
      })}
    </svg>
  );
};

/** 15:00 UTC: every Chog calls the next 24 hours; one real ride on the live Bell of Oct 21. */
export const Bell: React.FC = () => {
  const { f, rel } = useCue("bell");
  const tRings = rel("rings.");
  const tAll = rel("All");
  const tFans = rel("Fans");
  const tPoints = rel("points.");
  const swing = Math.sin((f - tRings) / 5) * 14 * Math.exp(-Math.max(0, f - tRings) / 40) * (f > tRings ? 1 : 0);
  const rideAt = tFans + 22;
  return (
    <Fill bg={C.paper} color={C.paperInk}>
      <div style={{ position: "absolute", left: 90, top: 92 }}><In at={0}><Kicker color="rgba(13,12,17,0.55)" dot={C.violetA}>Daily Bell · live · Oct 21</Kicker></In></div>
      <Strike x={250} y={330} at={tRings} color={C.violetB} />
      <div style={{ position: "absolute", left: 200, top: 270, width: 100, height: 120, transform: `rotate(${swing}deg)`, transformOrigin: "50% 10%", opacity: easeIn(f, 4) }}>
        <svg width={100} height={120} viewBox="0 0 24 28"><path d="M12 2c-4 0-7 3-7 8v6l-2 4h18l-2-4v-6c0-5-3-8-7-8z" fill={C.violetA} /><circle cx={12} cy={23.5} r={2.6} fill={C.violetB} /></svg>
      </div>
      <div style={{ position: "absolute", left: 90, top: 440, width: 520 }}>
        <div style={{ fontFamily: display, fontSize: 120, fontWeight: 500, letterSpacing: "-0.05em", lineHeight: 1, color: C.violetA }}>
          <Words text="15:00" at={rel("fifteen") - 2} every={4} />
          <span style={{ fontSize: 46, letterSpacing: "0.02em", color: "rgba(13,12,17,0.5)", marginLeft: 8 }}>UTC</span>
        </div>
        <div style={{ marginTop: 26, fontFamily: display, fontSize: 40, letterSpacing: "-0.02em", lineHeight: 1.2 }}>
          <Words text="1,969 calls on the next 24h." at={tAll} every={3} />
        </div>
        <div style={{ marginTop: 22, fontFamily: display, fontSize: 40, letterSpacing: "-0.02em", lineHeight: 1.2, color: "rgba(13,12,17,0.6)" }}>
          <Words text="Ride one. The market settles it." at={tFans} every={3} accent={{ "settles": C.violetA }} />
        </div>
        <div style={{ marginTop: 30, fontFamily: mono, fontSize: 15, letterSpacing: "0.08em", color: "rgba(13,12,17,0.5)", opacity: easeIn(f, tPoints) }}>POINTS ONLY · NO CASH VALUE · NO WALLET</div>
      </div>
      <Browser name="bell" url="useanimr.vercel.app/bell" width={1180} left={650} top={150} light startFrom={syncTo("bell", "bell.ride", rideAt)}
        cams={[
          { f: 0, rect: { x: 40, y: 170, w: 1520, h: 460 }, z: 1.25 },
          { f: Math.max(30, rideAt - 70), rect: { x: 40, y: 170, w: 1520, h: 460 }, z: 1.25 },
          { f: rideAt - 30, rect: { x: 40, y: 300, w: 1100, h: 300 }, z: 1.55 },
          { f: rideAt + 60, rect: { x: 40, y: 300, w: 1100, h: 300 }, z: 1.55 },
          { f: rideAt + 160, rect: { x: 300, y: 330, w: 1250, h: 260 }, z: 1.5 },
        ]} />
      {/* once the Oct 21 Bell has settled (npm run prize): "Then the market settles it" over its real recap */}
      {clip("settled") ? (
        <Sequence from={rel("settles") - 8} layout="none">
          <Browser name="settled" url="useanimr.vercel.app/bell/2026-10-21" width={1180} left={650} top={150} light startFrom={0} stopAt={80}
            cams={[{ f: 0, rect: { x: 0, y: 420, w: 1600, h: 440 }, z: 1.12 }]} />
        </Sequence>
      ) : null}
      <div style={{ position: "absolute", left: 650, top: 860, width: 1180, display: "flex", justifyContent: "space-between", fontFamily: sans, fontSize: 18, color: "rgba(13,12,17,0.55)", opacity: interpolate(f, [rideAt, rideAt + 12], [0, 1], clamp) }}>
        <span>One real ride: Turbo Ears · CHOG #1305, called ▲ +1.2%</span>
        <span style={{ fontFamily: mono, fontSize: 15 }}>LIVE BELL OF WED, OCT 21 · SETTLES OCT 22, 15:00 UTC</span>
      </div>
    </Fill>
  );
};
