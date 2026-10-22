import React from "react";
import { Img, interpolate, random, staticFile, useCurrentFrame } from "remotion";
import { evolvePath } from "@remotion/paths";
import { C, display, mono, sans } from "../theme";
import { clamp, expo, soft } from "./motion";

/**
 * The film's motif: a Chog card bound to its own wallet. A real Chog image, a teal tether that
 * draws from the card to an ERC-6551 wallet chip, and a pulse that travels it.
 */
export const ChogCard: React.FC<{
  id: number; size: number; x: number; y: number; name?: string; number?: string; p?: number; rot?: number; glow?: number; dim?: number; style?: React.CSSProperties;
}> = ({ id, size, x, y, name, number, p = 1, rot = 0, glow = 0, dim = 0, style }) => {
  const s = 0.6 + 0.4 * p;
  return (
    <div style={{
      position: "absolute", left: x - size / 2, top: y - size / 2, width: size, opacity: Math.min(1, p * 1.4),
      transform: `translateY(${(1 - p) * 60}px) scale(${s}) rotate(${rot + (1 - p) * -8}deg)`, ...style,
    }}>
      <div style={{
        width: size, height: size, borderRadius: size * 0.09, overflow: "hidden", background: C.raised,
        boxShadow: `0 0 0 ${Math.max(2, size * 0.012)}px rgba(255,255,255,0.18), 0 ${size * 0.12}px ${size * 0.3}px rgba(0,0,0,0.45), 0 0 ${size * 0.4 * glow}px rgba(159,240,236,${0.55 * glow})`,
      }}>
        <Img src={staticFile(`chogs/${id}.webp`)} style={{ width: "100%", height: "100%", objectFit: "cover", filter: dim ? `grayscale(${dim}) brightness(${1 - dim * 0.45})` : undefined }} />
      </div>
      {name ? (
        <div style={{ marginTop: size * 0.06, textAlign: "center", fontFamily: display, fontWeight: 500, fontSize: Math.max(18, size * 0.085), color: "inherit", letterSpacing: "-0.01em" }}>
          {name}
          {number ? <div style={{ fontFamily: mono, fontWeight: 400, fontSize: Math.max(13, size * 0.05), letterSpacing: "0.06em", opacity: 0.6, marginTop: 4 }}>{number}</div> : null}
        </div>
      ) : null}
    </div>
  );
};

/** The tether: a curved teal line from a to b, drawn by `p`, with a pulse that rides it after. */
export const Tether: React.FC<{ a: [number, number]; b: [number, number]; p: number; pulseAt?: number; bend?: number; color?: string; width?: number }> = ({ a, b, p, pulseAt, bend = 0.25, color = C.teal, width = 3 }) => {
  const f = useCurrentFrame();
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const nx = -(b[1] - a[1]) * bend, ny = (b[0] - a[0]) * bend;
  const d = `M ${a[0]} ${a[1]} Q ${mx + nx} ${my + ny} ${b[0]} ${b[1]}`;
  const ev = evolvePath(Math.max(0.0001, p), d);
  const q = pulseAt != null ? ((f - pulseAt) % 50) / 50 : -1;
  const pt = (t: number) => {
    const u = 1 - t;
    return [u * u * a[0] + 2 * u * t * (mx + nx) + t * t * b[0], u * u * a[1] + 2 * u * t * (my + ny) + t * t * b[1]];
  };
  const [px, py] = q >= 0 ? pt(q) : [0, 0];
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}>
      <defs>
        <filter id="tglow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" /></filter>
      </defs>
      <path d={d} stroke={color} strokeWidth={width * 3} fill="none" opacity={0.35} filter="url(#tglow)" strokeDasharray={ev.strokeDasharray} strokeDashoffset={ev.strokeDashoffset} />
      <path d={d} stroke={color} strokeWidth={width} fill="none" strokeLinecap="round" strokeDasharray={ev.strokeDasharray} strokeDashoffset={ev.strokeDashoffset} />
      {q >= 0 && p >= 1 ? <circle cx={px} cy={py} r={width * 2.6} fill="#fff" style={{ filter: `drop-shadow(0 0 10px ${color})` }} /> : null}
      <circle cx={a[0]} cy={a[1]} r={width * 2 * Math.min(1, p * 4)} fill={color} />
      <circle cx={b[0]} cy={b[1]} r={width * 2 * (p >= 0.98 ? 1 : 0)} fill={color} />
    </svg>
  );
};

/** The wallet end of the tether: an ERC-6551 account chip. */
export const WalletChip: React.FC<{ x: number; y: number; p: number; address: string; label?: string; sub?: string; light?: boolean; width?: number }> = ({ x, y, p, address, label = "ERC-6551 wallet", sub, light, width = 430 }) => (
  <div style={{
    position: "absolute", left: x, top: y, width, padding: "20px 24px", borderRadius: 20,
    background: light ? "rgba(255,255,255,0.86)" : "rgba(23,22,29,0.88)", border: `1.5px solid ${light ? "rgba(77,25,177,0.28)" : "rgba(159,240,236,0.38)"}`,
    boxShadow: light ? "0 26px 60px rgba(40,20,90,0.16)" : "0 26px 60px rgba(0,0,0,0.5), 0 0 40px rgba(159,240,236,0.10)",
    opacity: p, transform: `translateY(${(1 - p) * 26}px) scale(${0.94 + 0.06 * p})`, color: light ? C.paperInk : "#fff",
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: mono, fontSize: 14, letterSpacing: "0.14em", textTransform: "uppercase", color: light ? C.violetA : C.teal }}>
      <svg width={22} height={22} viewBox="0 0 24 24"><path d="M12 2 21 7v10l-9 5-9-5V7z" fill="none" stroke="currentColor" strokeWidth={2} /><circle cx={12} cy={12} r={3} fill="currentColor" /></svg>
      {label}
    </div>
    <div style={{ marginTop: 10, fontFamily: mono, fontSize: 26, letterSpacing: "0.01em" }}>{address}</div>
    {sub ? <div style={{ marginTop: 8, fontFamily: sans, fontSize: 17, opacity: 0.62 }}>{sub}</div> : null}
  </div>
);

/** Sparse drifting motes for dark scenes: particle accents, used lightly. */
export const Motes: React.FC<{ n?: number; color?: string; seed?: string; opacity?: number }> = ({ n = 26, color = C.teal, seed = "m", opacity = 0.5 }) => {
  const f = useCurrentFrame();
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", opacity }}>
      {Array.from({ length: n }, (_, i) => {
        const x0 = random(`${seed}x${i}`) * 1920, y0 = random(`${seed}y${i}`) * 1080;
        const sp = 0.15 + random(`${seed}s${i}`) * 0.4;
        const y = (y0 - f * sp + 1080 * 4) % 1080;
        const x = x0 + Math.sin((f + i * 40) / 60) * 14;
        const r = 1 + random(`${seed}r${i}`) * 2.2;
        const tw = 0.35 + 0.65 * Math.abs(Math.sin((f + i * 17) / 30));
        return <circle key={i} cx={x} cy={y} r={r} fill={color} opacity={tw} />;
      })}
    </svg>
  );
};

/** A soft radial glow that breathes. */
export const Glow: React.FC<{ x: string; y: string; color: string; size?: string; strength?: number }> = ({ x, y, color, size = "50% 50%", strength = 1 }) => {
  const f = useCurrentFrame();
  const b = 0.85 + 0.15 * Math.sin(f / 40);
  return <div style={{ position: "absolute", inset: 0, background: `radial-gradient(${size} at ${x} ${y}, ${color}, transparent 70%)`, opacity: b * strength }} />;
};

/** A rubber-stamp verdict that slams in at `at`. */
export const Stamp: React.FC<{ at: number; text: string; color: string; rot?: number; size?: number; style?: React.CSSProperties }> = ({ at, text, color, rot = -6, size = 40, style }) => {
  const f = useCurrentFrame();
  const s = interpolate(f, [at, at + 8], [2.4, 1], { ...clamp, easing: expo });
  const o = interpolate(f, [at, at + 4], [0, 1], clamp);
  return (
    <div style={{ display: "inline-block", opacity: o, transform: `scale(${s}) rotate(${rot}deg)`, border: `${size * 0.11}px solid ${color}`, color, fontFamily: mono, fontWeight: 500, fontSize: size, letterSpacing: "0.12em", padding: `${size * 0.2}px ${size * 0.45}px`, borderRadius: size * 0.22, ...style }}>{text}</div>
  );
};

/** A clearly labelled placeholder for footage still to come (never shown in the final cut). */
export const Pending: React.FC<{ x: number; y: number; w: number; h: number; title: string; sub: string; p?: number }> = ({ x, y, w, h, title, sub, p = 1 }) => (
  <div style={{
    position: "absolute", left: x, top: y, width: w, height: h, borderRadius: 18, overflow: "hidden", opacity: p,
    background: "repeating-linear-gradient(135deg, rgba(242,193,107,0.10) 0 22px, rgba(242,193,107,0.03) 22px 44px), #16141c",
    border: "2px dashed rgba(242,193,107,0.75)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 30,
  }}>
    <div style={{ fontFamily: mono, fontSize: 22, letterSpacing: "0.16em", color: C.warning }}>PENDING · PLACEHOLDER</div>
    <div style={{ marginTop: 14, fontFamily: display, fontSize: 34, color: "#fff", fontWeight: 500, maxWidth: w - 80 }}>{title}</div>
    <div style={{ marginTop: 10, fontFamily: sans, fontSize: 19, color: "rgba(255,255,255,0.65)", maxWidth: w - 80, lineHeight: 1.4 }}>{sub}</div>
  </div>
);

export const easeIn = (f: number, a: number, d = 18) => interpolate(f, [a, a + d], [0, 1], { ...clamp, easing: expo });
export const easeSoft = (f: number, a: number, d = 18) => interpolate(f, [a, a + d], [0, 1], { ...clamp, easing: soft });
