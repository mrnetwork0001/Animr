import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { scene, wordAt } from "../timing";
import { C, display, mono, sans } from "../theme";
import { clamp, expo, pop } from "../ui/motion";
import onchain from "../../data/onchain.json";

/** Scene-local frame and word cues: rel("word", n) is when the nth "word" is spoken, scene-local. */
export function useCue(id: string) {
  const s = scene(id);
  const f = useCurrentFrame();
  const rel = (w: string, n = 0) => wordAt(id, w, n) - s.from;
  return { s, f, rel, dur: s.durationInFrames };
}

export const Fill: React.FC<{ bg: string; children: React.ReactNode; color?: string }> = ({ bg, children, color = "#fff" }) => (
  <AbsoluteFill style={{ background: bg, fontFamily: sans, color, overflow: "hidden" }}>{children}</AbsoluteFill>
);

/** Small mono kicker with the app's teal dot. */
export const Kicker: React.FC<{ children: React.ReactNode; color?: string; dot?: string; size?: number; style?: React.CSSProperties }> = ({ children, color = "rgba(255,255,255,0.6)", dot = C.teal, size = 16, style }) => (
  <div style={{ fontFamily: mono, fontSize: size, letterSpacing: "0.16em", textTransform: "uppercase", color, display: "flex", alignItems: "center", gap: 12, ...style }}>
    <span style={{ width: 8, height: 8, borderRadius: 4, background: dot, boxShadow: `0 0 10px ${dot}` }} />{children}
  </div>
);

/** Fade, rise and un-blur for any block. */
export const In: React.FC<{ at: number; dur?: number; y?: number; x?: number; children: React.ReactNode; style?: React.CSSProperties; out?: number }> = ({ at, dur = 16, y = 26, x = 0, children, style, out }) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [at, at + dur], [0, 1], { ...clamp, easing: expo });
  const o = out != null ? interpolate(f, [out, out + 10], [1, 0], clamp) : 1;
  return <div style={{ opacity: p * o, transform: `translate(${(1 - p) * x}px, ${(1 - p) * y}px)`, filter: p < 1 ? `blur(${(1 - p) * 7}px)` : undefined, ...style }}>{children}</div>;
};

/** A glass card that pops in at `at`. */
export const Card: React.FC<{ at: number; left: number; top: number; width: number; light?: boolean; accent?: string; children: React.ReactNode; style?: React.CSSProperties; out?: number }> = ({ at, left, top, width, light, accent = C.teal, children, style, out }) => {
  const f = useCurrentFrame();
  const p = pop(f, at);
  const o = interpolate(f, [at, at + 8], [0, 1], clamp) * (out != null ? interpolate(f, [out, out + 10], [1, 0], clamp) : 1);
  return (
    <div style={{
      position: "absolute", left, top, width, opacity: o, transform: `translateY(${(1 - p) * 28}px) scale(${0.94 + 0.06 * p})`, transformOrigin: "50% 100%",
      background: light ? "rgba(255,255,255,0.9)" : "rgba(23,22,29,0.9)", color: light ? C.paperInk : "#fff", padding: "22px 26px", borderRadius: 20,
      boxShadow: light ? "0 0 0 1px rgba(13,12,17,0.08), 0 26px 60px rgba(40,20,90,0.14)" : "0 0 0 1px rgba(255,255,255,0.1), 0 30px 70px rgba(0,0,0,0.5)",
      borderTop: `3px solid ${accent}`, fontFamily: sans, backdropFilter: "blur(16px)", ...style,
    }}>{children}</div>
  );
};

/** A short tx hash chip, as Monadscan prints it. */
export const short = (h: string, a = 10, b = 8) => `${h.slice(0, a)}…${h.slice(-b)}`;
export const Hash: React.FC<{ h: string; color?: string; size?: number }> = ({ h, color = C.teal, size = 18 }) => (
  <span style={{ fontFamily: mono, fontSize: size, color, letterSpacing: "0.02em" }}>{short(h)}</span>
);

export const TX = onchain as unknown as {
  ownerSetup: { step: string; hash: string; blockNumber: number; timestampISO: string; keyFigures: Record<string, unknown> }[];
  otherTxs: { step: string; hash: string; blockNumber: number; timestampISO: string }[];
};
export const tx = (label: string) => {
  const t = [...TX.ownerSetup, ...TX.otherTxs].find((x) => x.step.includes(label));
  if (!t) throw new Error("no tx " + label);
  return t;
};
/** "22:41:25 UTC" from an ISO time. */
export const utc = (iso: string) => `${iso.slice(11, 19)} UTC`;
export const blockStr = (n: number) => n.toLocaleString("en-US");

/** A big headline in DM Sans. */
export const Head: React.FC<{ children: React.ReactNode; size?: number; style?: React.CSSProperties }> = ({ children, size = 92, style }) => (
  <div style={{ fontFamily: display, fontWeight: 400, fontSize: size, letterSpacing: "-0.035em", lineHeight: 1.04, ...style }}>{children}</div>
);
export const SIM = "Simulated on real $CHOG candles (1% fee + impact)";

/** Scene-local start frame of line i. */
export const lineStartLocal = (s: { from: number; lines: { startFrame: number }[] }, i: number) => s.lines[i].startFrame - s.from;
