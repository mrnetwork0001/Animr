import { cacheLife } from "next/cache";
import { ImageResponse } from "next/og";
import { CHOG_COUNT, DEFAULT_WINDOW, SIM_LABEL, parseChogId, signedPct } from "@/components/dna/shared";
import { chogThumbUrl } from "@/components/dna/thumb-url";
import { getChog } from "@/lib/dna/chogs";
import { chogGenome, chogName, getPopulation, getReplay } from "@/lib/dna/population";
import type { PopulationResponse, ReplayResult } from "@/lib/dna/types";
import { isHiddenChog } from "@/lib/visibility";

export const alt = "A Chog's trading DNA replayed on real $CHOG candles, against just holding";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const C = {
  bg: "#0E0B1E",
  surface2: "#1C1737",
  lineStrong: "#3A3170",
  fg: "#F3F1FF",
  muted: "#A59FC9",
  subtle: "#8A83B3",
  accentStrong: "#9D8CFF",
  success: "#3DDC97",
  danger: "#FF6B81",
};

/** The Animr mark (components/site-header.tsx), for cards without a Chog. */
const LOGO = `data:image/svg+xml;base64,${Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#A493FF"/><stop offset="1" stop-color="#6A50F0"/></linearGradient></defs><rect width="32" height="32" rx="9" fill="url(#g)"/><path d="M9.5 23 16 8.5 22.5 23" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="16" cy="18.6" r="2.3" fill="#fff"/></svg>`,
).toString("base64")}`;

// Geist (the app's font) at 400 and 600; Satori needs TTF. Falls back to the built-in font offline.
const FONTS = [
  { weight: 400, url: "https://fonts.gstatic.com/s/geist/v5/gyBhhwUxId8gMGYQMKR3pzfaWI_RnOM4nQ.ttf" },
  { weight: 600, url: "https://fonts.gstatic.com/s/geist/v5/gyBhhwUxId8gMGYQMKR3pzfaWI_RQuQ4nQ.ttf" },
] as const;
let fontsPromise: Promise<{ name: string; data: ArrayBuffer; weight: 400 | 600; style: "normal" }[]> | undefined;

function loadFonts() {
  fontsPromise ??= Promise.all(
    FONTS.map(async ({ weight, url }) => {
      const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (!res.ok) throw new Error(`font ${res.status}`);
      return { name: "Geist", data: await res.arrayBuffer(), weight, style: "normal" as const };
    }),
  ).catch(() => {
    fontsPromise = undefined;
    return [];
  });
  return fontsPromise;
}

/** The promise's value, or null if it fails or takes longer than `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), ms)));
  return Promise.race([promise.catch(() => null), timeout]).finally(() => clearTimeout(timer));
}

/** The Chog's face as a PNG data URI (Satori can't decode the WebP originals), or null. */
async function loadFace(image: string): Promise<string | null> {
  try {
    const res = await fetch(chogThumbUrl(image, 480, "png"), { signal: AbortSignal.timeout(6_000) });
    if (!res.ok || !res.headers.get("content-type")?.includes("png")) return null;
    return `data:image/png;base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  }
}

type Card = {
  tokenId: number;
  name: string;
  archetype: string;
  edgePct: number | null;
  verdict: string | null;
  rank: number | null;
  total: number;
  windowLabel: string | null;
  /** Edge vs holding over time, oldest first, ~100 points. */
  curve: number[];
  face: string | null;
};

async function loadCard(tokenId: number): Promise<Card | null> {
  "use cache";
  const chog = getChog(tokenId);
  if (!chog) {
    cacheLife("days");
    return null;
  }
  // The same genome the API serves (Legendaries also read their metadata name).
  const genome = chogGenome(chog);
  const [replay, population, face]: [ReplayResult | null, PopulationResponse | null, string | null] = await Promise.all([
    withTimeout(getReplay(tokenId, DEFAULT_WINDOW), 8_000),
    withTimeout(getPopulation(DEFAULT_WINDOW), 8_000),
    loadFace(chog.image),
  ]);
  const row = population?.rows.find((r) => r.tokenId === tokenId);
  const step = Math.max(1, Math.ceil((replay?.points.length ?? 0) / 100));
  const curve = (replay?.points ?? [])
    .filter((_, i, all) => i % step === 0 || i === all.length - 1)
    .map((p) => (p.value / replay!.startChog - 1) * 100);
  // A card missing a piece is retried soon; a complete one is good until the candles move on.
  if (replay && population && face) cacheLife("hours");
  else cacheLife("minutes");
  return {
    tokenId,
    // Its persona name ("Rocket Ears"), the one every page shows.
    name: chogName(chog),
    archetype: genome.archetype,
    edgePct: replay?.edgePct ?? row?.edgePct ?? null,
    verdict: replay?.verdict ?? null,
    rank: row?.rank ?? null,
    total: population?.rows.length ?? CHOG_COUNT,
    windowLabel: replay?.window.label ?? null,
    curve,
    face,
  };
}

function Curve({ values, color }: { values: number[]; color: string }) {
  const W = 600;
  const H = 76;
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const y = (v: number) => 6 + (1 - (v - lo) / (hi - lo || 1)) * (H - 12);
  const x = (i: number) => (i / Math.max(1, values.length - 1)) * W;
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join("");
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke={C.subtle} strokeWidth={2} strokeDasharray="8 8" />
      <path d={d} fill="none" stroke={color} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default async function Image({ params }: { params: Promise<{ tokenId: string }> }) {
  const id = parseChogId((await params).tokenId);
  // A Chog its holder hid ("Hide my Chog") never goes on a card: the generic one instead.
  const tokenId = id && !(await isHiddenChog(id)) ? id : null;
  const [card, fonts] = await Promise.all([tokenId ? loadCard(tokenId) : null, loadFonts()]);
  const edge = card?.edgePct ?? null;
  const tone = edge === null ? C.muted : edge > 0 ? C.success : C.danger;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          gap: 56,
          padding: "0 64px",
          background: C.bg,
          backgroundImage: "radial-gradient(900px 520px at 70% -10%, rgba(131,110,249,0.32), transparent 70%)",
          color: C.fg,
          fontFamily: "Geist",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 460,
            height: 460,
            flexShrink: 0,
            borderRadius: 44,
            overflow: "hidden",
            border: `3px solid ${C.lineStrong}`,
            background: C.surface2,
            boxShadow: "0 30px 80px rgba(0,0,0,0.55)",
            fontSize: 72,
            color: C.subtle,
          }}
        >
          {card?.face ? (
            <img src={card.face} width={460} height={460} alt="" style={{ objectFit: "cover" }} />
          ) : card ? (
            `#${card.tokenId}`
          ) : (
            <img src={LOGO} width={200} height={200} alt="" />
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", flex: 1, height: 460, justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 22, letterSpacing: 5, color: C.accentStrong, fontWeight: 600 }}>
              ANIMR · TIME MACHINE
            </div>
            <div style={{ display: "flex", marginTop: 14, fontSize: 76, fontWeight: 600, letterSpacing: -2, lineHeight: 1 }}>
              {card ? `Chog #${card.tokenId}` : "Every Chog is a trader"}
            </div>
            <div style={{ display: "flex", marginTop: 14, fontSize: 32, color: C.muted }}>
              {card ? `${card.archetype} · ${card.name}` : "1,969 trading genomes on real $CHOG candles"}
            </div>
          </div>

          {edge !== null && (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: 108, fontWeight: 600, letterSpacing: -3, lineHeight: 1, color: tone }}>
                {signedPct(edge)}
              </div>
              <div style={{ display: "flex", marginTop: 10, fontSize: 26, color: C.muted }}>
                {/* The engine's verdict when it says what the number means, else the plain label. */}
                {card?.verdict && /holding/i.test(card.verdict) ? card.verdict : "vs just holding $CHOG"}
              </div>
            </div>
          )}

          {card && card.curve.length > 1 && <Curve values={card.curve} color={tone} />}

          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 21, color: C.subtle }}>
            {card?.rank && (
              <div style={{ display: "flex", color: C.muted }}>
                #{card.rank.toLocaleString("en-US")} of {card.total.toLocaleString("en-US")} Chogs
                {card.windowLabel ? ` · ${card.windowLabel.replace(/\s*\(.*\)\s*$/, "")}` : ""}
              </div>
            )}
            <div style={{ display: "flex" }}>{SIM_LABEL}</div>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}
