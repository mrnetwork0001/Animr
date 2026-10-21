/* eslint-disable @next/next/no-img-element -- next/og (Satori) draws plain <img>; next/image doesn't exist there. */
import type { ReactNode } from "react";
import { HERD_SLOTS, type Herd, herdX } from "./herd";
import { C, LOGO_SRC, siteHost } from "./theme";

// Building blocks of the share cards, for Satori (next/og): flexbox only, and every element with more
// than one child sets display: flex. Sizes are for the 1200x630 canvas, which feeds show at ~500 px
// wide, so nothing that matters is under ~20 px.

/** Every replay and league number on a card carries this (components/dna/shared.ts SIM_LABEL). */
export const SIM_NOTE = "Simulated on real $CHOG candles (1% fee + impact)";
/** Every Bell card carries this (lib/bell/rules.ts BELL_COPY.points, shortened). */
export const POINTS_NOTE = "Points only, never money · settled by the real CHOG/WMON price";

/** The card: Animr header with the section, the body, and the honest footer. */
export function Frame({ section, note, children }: { section: string; note: string; children: ReactNode }) {
  const host = siteHost();
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "38px 56px 32px",
        background: C.bg,
        backgroundImage: "radial-gradient(1000px 560px at 88% -18%, rgba(131,110,249,0.26), transparent 70%)",
        color: C.fg,
        fontFamily: "Geist",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <img src={LOGO_SRC} width={42} height={42} alt="" />
          <div style={{ display: "flex", fontSize: 30, fontWeight: 600, letterSpacing: -0.5 }}>Animr</div>
        </div>
        <div style={{ display: "flex", fontSize: 19, fontWeight: 600, letterSpacing: 4, color: C.accentStrong }}>
          {section}
        </div>
      </div>
      <div style={{ display: "flex", flex: 1, minHeight: 0, marginTop: 26, marginBottom: 22 }}>{children}</div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 24, fontSize: 18, color: C.subtle }}>
        <div style={{ display: "flex" }}>{note}</div>
        <div style={{ display: "flex", flexShrink: 0 }}>{host ? `${host} · Not affiliated with Chog` : "Not affiliated with Chog"}</div>
      </div>
    </div>
  );
}

/** Small caps label above a block. */
export function Eyebrow({ children, color = C.subtle, size = 17 }: { children: ReactNode; color?: string; size?: number }) {
  return (
    <div style={{ display: "flex", fontSize: size, fontWeight: 600, letterSpacing: 3, color, whiteSpace: "nowrap" }}>{children}</div>
  );
}

export function Chip({ children, color = C.muted, border = C.lineStrong, background = "transparent", size = 16 }: {
  children: ReactNode;
  color?: string;
  border?: string;
  background?: string;
  size?: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "4px 12px",
        borderRadius: 999,
        border: `2px solid ${border}`,
        background,
        fontSize: size,
        fontWeight: 600,
        letterSpacing: 2,
        color,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </div>
  );
}

/**
 * The Chog's original art, or (no copy in time, or a flagged Chog) a plain tile with its number and
 * name. Never generated art.
 */
export function ChogFace({ art, tokenId, label = `#${tokenId}`, name, size, radius = Math.round(size * 0.1), border = 3 }: {
  art: string | null;
  tokenId: number;
  /** The tile's number when there's no art (default "#<token id>"). */
  label?: string;
  name?: string;
  size: number;
  radius?: number;
  border?: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: radius,
        overflow: "hidden",
        border: `${border}px solid ${C.lineStrong}`,
        background: C.surface2,
        boxShadow: "0 24px 64px rgba(0,0,0,0.45)",
      }}
    >
      {art ? (
        <img src={art} width={size} height={size} alt="" style={{ objectFit: "cover" }} />
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
            backgroundImage: `linear-gradient(140deg, ${C.lineStrong} 0%, ${C.surface2} 55%, ${C.bg} 100%)`,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: Math.round(size * (label.length > 4 ? 0.2 : 0.24)),
              fontWeight: 600,
              letterSpacing: -2,
              color: C.fg,
              lineHeight: 1,
            }}
          >
            {label}
          </div>
          {name && size >= 180 && (
            <div style={{ display: "flex", marginTop: Math.round(size * 0.04), fontSize: Math.round(size * 0.065), color: C.muted }}>
              {name}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** A row of Chog faces (the showcase on cards without a Chog of their own). */
export function FaceStrip({ faces, size = 150 }: { faces: { tokenId: number; art: string }[]; size?: number }) {
  if (faces.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 18 }}>
      {faces.map((face) => (
        <ChogFace key={face.tokenId} art={face.art} tokenId={face.tokenId} size={size} radius={Math.round(size * 0.14)} border={2} />
      ))}
    </div>
  );
}

/** Whole percentages that add up to 100 (largest remainder). */
export function percents(counts: number[]): number[] {
  const total = counts.reduce((sum, n) => sum + Math.max(0, n), 0);
  if (!total) return counts.map(() => 0);
  const exact = counts.map((n) => (Math.max(0, n) / total) * 100);
  const out = exact.map(Math.floor);
  let left = 100 - out.reduce((sum, n) => sum + n, 0);
  for (const i of exact.map((_, i) => i).sort((a, b) => exact[b] - out[b] - (exact[a] - out[a]))) {
    if (left-- <= 0) break;
    out[i]++;
  }
  return out;
}

/** "53%", or "<1%" for a share that rounds to zero but isn't. */
const share = (pct: number, count: number) => (count > 0 && pct === 0 ? "<1%" : `${pct}%`);

/** Bulls from the left, bears from the right, flat calls between: neither side gets the better color or spot. */
export function SplitBar({ bull, flat, bear, width, exact = true }: { bull: number; flat: number; bear: number; width: number; exact?: boolean }) {
  const [bullPct, flatPct, bearPct] = percents([bull, flat, bear]);
  const total = Math.max(1, bull + flat + bear);
  return (
    <div style={{ display: "flex", flexDirection: "column", width }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 24, fontWeight: 600 }}>
        <div style={{ display: "flex", color: C.success }}>▲ {share(bullPct, bull)} bull</div>
        {flat > 0 && <div style={{ display: "flex", fontSize: 19, color: C.muted }}>{share(flatPct, flat)} flat</div>}
        <div style={{ display: "flex", color: C.danger }}>
          {share(bearPct, bear)} {exact ? "bear" : "bear or flat"} ▼
        </div>
      </div>
      <div style={{ display: "flex", marginTop: 10, height: 14, borderRadius: 999, overflow: "hidden", background: C.line }}>
        <div style={{ display: "flex", width: `${(bull / total) * 100}%`, background: C.success }} />
        <div style={{ display: "flex", width: `${(flat / total) * 100}%`, background: C.subtle }} />
        <div style={{ display: "flex", flex: 1, background: C.danger }} />
      </div>
    </div>
  );
}

/**
 * Every call bucketed by forecast, symmetric around 0% (lib/og/herd.ts): bears red on the left, flat
 * calls grey in the middle, bulls green on the right, plus a marker at the real move.
 */
export function HerdChart({ herd, actualPct, width, height, markerLabel }: {
  herd: Herd;
  actualPct: number | null;
  width: number;
  height: number;
  markerLabel?: string;
}) {
  const gap = 6;
  const bar = (width - gap * (HERD_SLOTS - 1)) / HERD_SLOTS;
  const max = Math.max(1, ...herd.slots);
  const marker = actualPct === null ? null : (herdX(actualPct, herd.range) / HERD_SLOTS) * width;
  const labelLeft = marker === null ? 0 : Math.min(width - 150, Math.max(0, marker - 75));
  return (
    <div style={{ display: "flex", flexDirection: "column", width }}>
      <div style={{ display: "flex", position: "relative", width, height }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap, width, height, borderBottom: `2px solid ${C.lineStrong}` }}>
          {herd.slots.slice(0, HERD_SLOTS).map((count, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                width: bar,
                height: count ? Math.max(4, (count / max) * (height - 30)) : 0,
                borderRadius: "4px 4px 0 0",
                background: i < 5 ? C.danger : i === 5 ? C.subtle : C.success,
                opacity: 0.85,
              }}
            />
          ))}
        </div>
        {marker !== null && (
          <div style={{ display: "flex", position: "absolute", left: marker - 2, top: 30, width: 4, height: height - 30, borderRadius: 2, background: C.fg }} />
        )}
        {marker !== null && markerLabel && (
          <div style={{ display: "flex", position: "absolute", left: labelLeft, top: 0, width: 150, justifyContent: "center" }}>
            <div style={{ display: "flex", padding: "2px 10px", borderRadius: 6, background: C.fg, color: C.bg, fontSize: 16, fontWeight: 600 }}>
              {markerLabel}
            </div>
          </div>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 16, color: C.subtle }}>
        <div style={{ display: "flex" }}>{`−${herd.range}%`}</div>
        <div style={{ display: "flex" }}>0%</div>
        <div style={{ display: "flex" }}>{`+${herd.range}%`}</div>
      </div>
    </div>
  );
}
