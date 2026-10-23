import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import chart from "../data/banner-chart.json";
import { C, display, mono, sans } from "./theme";

/**
 * Chogathon gallery banner (1920x1080, shown as a 16:9 card). Real content only: five brand-safe Chogs with the
 * app's own names and genome archetypes (/api/dna, Oct 23 2026), the House Chog's real 15,000 $CHOG, the first
 * Oracle of the Day's real 500 $CHOG purse, and the real hourly CHOG/WMON closes behind them (data/banner-chart.json).
 */

type Card = { id: number; name: string; style: string; x: number; y: number; size: number; rot: number; z: number; gold?: boolean; badge?: { text: string; color: string } };

const CARDS: Card[] = [
  { id: 1798, name: "Zen Whiskers", style: "Royal Fader", x: 1020, y: 560, size: 255, rot: -14, z: 1 },
  { id: 1881, name: "Purple Tail", style: "Dip Romantic", x: 1790, y: 560, size: 255, rot: 14, z: 1 },
  { id: 900, name: "Sharp Paws", style: "Fearless Sleeper", x: 1200, y: 505, size: 285, rot: -7, z: 2 },
  { id: 873, name: "Velvet Whiskers", style: "Oracle · +500 $CHOG", gold: true, x: 1628, y: 505, size: 285, rot: 7, z: 2 },
  { id: 1399, name: "Laser Pounce", style: "Paper Paws", x: 1405, y: 470, size: 320, rot: 0, z: 3, badge: { text: "15,000 $CHOG inside", color: C.teal } },
];

const TradingCard: React.FC<{ c: Card }> = ({ c }) => {
  const r = c.size * 0.08;
  return (
    <div style={{ position: "absolute", left: c.x - c.size / 2, top: c.y - c.size / 2, width: c.size, zIndex: c.z, transform: `rotate(${c.rot}deg)`, transformOrigin: "50% 50%" }}>
      <div style={{
        position: "relative", width: c.size, height: c.size * 1.22, borderRadius: r, overflow: "hidden", background: C.raised,
        boxShadow: `0 0 0 3px rgba(255,255,255,0.16), 0 40px 80px rgba(0,0,0,0.55)${c.z === 3 ? `, 0 0 120px rgba(159,240,236,0.45)` : ""}`,
      }}>
        <Img src={staticFile(`chogs/${c.id}.webp`)} style={{ width: c.size, height: c.size, objectFit: "cover", display: "block" }} />
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: c.size * 0.22, background: "linear-gradient(180deg, #17161d, #0d0c11)", padding: `${c.size * 0.035}px ${c.size * 0.06}px`, boxSizing: "border-box", textAlign: c.rot > 0 ? "right" : "left" }}>
          <div style={{ fontFamily: display, fontWeight: 700, fontSize: c.size * 0.078, letterSpacing: "-0.02em", color: "#fff", whiteSpace: "nowrap" }}>{c.name}</div>
          <div style={{ fontFamily: mono, fontSize: c.size * 0.046, letterSpacing: "0.08em", color: c.gold ? C.warning : C.violetInk, textTransform: "uppercase", marginTop: c.size * 0.012, whiteSpace: "nowrap" }}>{c.style}</div>
        </div>
      </div>
      {c.badge ? (
        <div style={{
          position: "absolute", left: "50%", top: -26, transform: "translateX(-50%)", whiteSpace: "nowrap",
          padding: "10px 20px", borderRadius: 999, background: "rgba(13,12,17,0.92)", border: `3px solid ${c.badge.color}`,
          fontFamily: mono, fontWeight: 500, fontSize: c.z === 3 ? 30 : 22, color: c.badge.color, boxShadow: "0 14px 34px rgba(0,0,0,0.55)",
        }}>{c.badge.text}</div>
      ) : null}
    </div>
  );
};

/** The real $CHOG price line, faint, under the cards. */
const PriceLine: React.FC = () => {
  const raw = chart.n as number[];
  const n = raw.map((_, i) => { const w = raw.slice(Math.max(0, i - 3), i + 4); return w.reduce((a, b) => a + b, 0) / w.length; });
  const x0 = 1190, x1 = 1920, yTop = 790, yBot = 990;
  const pts = n.map((v, i) => [x0 + (i / (n.length - 1)) * (x1 - x0), yBot - v * (yBot - yTop)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0 }}>
      <defs>
        <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={C.teal} stopOpacity="0.22" />
          <stop offset="1" stopColor={C.teal} stopOpacity="0" />
        </linearGradient>
        <linearGradient id="fadeMask" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.3" stopColor="#fff" stopOpacity="1" />
        </linearGradient>
        <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={C.teal} stopOpacity="0" />
          <stop offset="0.2" stopColor={C.teal} stopOpacity="0.7" />
          <stop offset="1" stopColor={C.teal} stopOpacity="1" />
        </linearGradient>
      </defs>
      <mask id="m"><rect x={x0} y={0} width={x1 - x0} height={1080} fill="url(#fadeMask)" /></mask>
      <path d={`${d} L ${x1} 1080 L ${x0} 1080 Z`} fill="url(#fill)" mask="url(#m)" />
      <path d={d} fill="none" stroke="url(#fade)" strokeWidth={4} strokeLinejoin="round" style={{ filter: "drop-shadow(0 0 10px rgba(159,240,236,0.6))" }} />
    </svg>
  );
};

const Chip: React.FC<{ logo: string; h: number; text: string }> = ({ logo, h, text }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 14, height: 70, padding: "0 26px", borderRadius: 999, background: "rgba(255,255,255,0.06)", border: "2px solid rgba(255,255,255,0.14)", boxSizing: "border-box" }}>
    <Img src={staticFile(`logos/${logo}`)} style={{ height: h, width: "auto" }} />
    <span style={{ fontFamily: sans, fontWeight: 600, fontSize: 28, color: "rgba(255,255,255,0.88)", whiteSpace: "nowrap" }}>{text}</span>
  </div>
);

export const Banner: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg, color: "#fff", overflow: "hidden" }}>
    <AbsoluteFill style={{ background: "radial-gradient(45% 60% at 74% 45%, rgba(111,90,220,0.7), rgba(77,25,177,0.22) 55%, transparent 78%)" }} />
    <AbsoluteFill style={{ background: "radial-gradient(35% 45% at 8% 10%, rgba(159,240,236,0.10), transparent 70%)" }} />
    <PriceLine />
    {CARDS.map((c) => <TradingCard key={c.id} c={c} />)}
    <div style={{ position: "absolute", right: 48, bottom: 36, fontFamily: mono, fontSize: 18, letterSpacing: "0.08em", color: "rgba(159,240,236,0.75)", whiteSpace: "nowrap" }}>
      REAL $CHOG PRICE · {String(chart.from).toUpperCase()} – {String(chart.to).toUpperCase()}
    </div>

    <Img src={staticFile("brand/animr-header.png")} style={{ position: "absolute", left: 104, top: 96, height: 132 }} />
    <div style={{ position: "absolute", left: 104, top: 318, width: 860, fontFamily: display, fontWeight: 800, fontSize: 124, lineHeight: 0.95, letterSpacing: "-0.05em" }}>
      Every Chog is<br />an <span style={{ color: C.teal, textShadow: "0 0 50px rgba(159,240,236,0.45)" }}>AI trader.</span>
    </div>
    <div style={{ position: "absolute", left: 108, top: 600, width: 760, fontFamily: sans, fontWeight: 500, fontSize: 40, lineHeight: 1.3, color: "rgba(255,255,255,0.78)" }}>
      Its traits are its strategy. Its own wallet holds real $CHOG. The AI can be fooled, the NFT can't.
    </div>
    <div style={{ position: "absolute", left: 104, top: 880, display: "flex", gap: 16 }}>
      <Chip logo="monad.svg" h={30} text="mainnet" />
      <Chip logo="tokenbound.svg" h={22} text="ERC-6551" />
      <Chip logo="0g.svg" h={30} text="Compute" />
    </div>
  </AbsoluteFill>
);
