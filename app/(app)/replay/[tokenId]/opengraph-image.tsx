import { cacheLife } from "next/cache";
import { ImageResponse } from "next/og";
import { CHOG_COUNT, DEFAULT_WINDOW, SIM_LABEL, parseChogId, signedPct } from "@/components/dna/shared";
import { nameNumberOf } from "@/lib/chog-id";
import { getChog } from "@/lib/dna/chogs";
import { chogGenome, chogName, getPopulation, getReplay } from "@/lib/dna/population";
import type { PopulationResponse, ReplayResult } from "@/lib/dna/types";
import { artExpected, chogArt } from "@/lib/og/art";
import { C, LOGO_SRC, ogOptions } from "@/lib/og/theme";
import { isHiddenChog } from "@/lib/visibility";

// The share card of /replay/[tokenId]: the Chog's art, its edge vs just holding and the curve of that edge over the
// default window. Rendered on request from cached data (loadCard follows the hourly candles); the CDN keeps each card
// five minutes, like the other cards (lib/og/theme.ts ogOptions). The art comes through lib/og/art.ts, capped at a
// few seconds, so a slow IPFS gateway costs the art (the tile shows the Chog's number) and never the card.

export const alt = "A Chog's trading DNA replayed on real $CHOG candles, against just holding";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The promise's value, or null if it fails or takes longer than `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), ms)));
  return Promise.race([promise.catch(() => null), timeout]).finally(() => clearTimeout(timer));
}

type Card = {
  tokenId: number;
  /** "CHOG #1312": its marketplace name (lib/chog-id.ts). */
  label: string;
  name: string;
  archetype: string;
  edgePct: number | null;
  verdict: string | null;
  rank: number | null;
  total: number;
  windowLabel: string | null;
  /** Edge vs holding over time, oldest first, ~100 points. */
  curve: number[];
  art: string | null;
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
  const [replay, population, art]: [ReplayResult | null, PopulationResponse | null, string | null] = await Promise.all([
    withTimeout(getReplay(tokenId, DEFAULT_WINDOW), 8_000),
    withTimeout(getPopulation(DEFAULT_WINDOW), 8_000),
    // Flagged Chogs' art is left out by chogArt (lib/brand-safety.ts): never on a share card.
    chogArt(tokenId),
  ]);
  const row = population?.rows.find((r) => r.tokenId === tokenId);
  const step = Math.max(1, Math.ceil((replay?.points.length ?? 0) / 100));
  const curve = (replay?.points ?? [])
    .filter((_, i, all) => i % step === 0 || i === all.length - 1)
    .map((p) => (p.value / replay!.startChog - 1) * 100);
  // A card missing a piece is retried soon; a complete one is good until the candles move on.
  if (replay && population && (art || !artExpected(tokenId))) cacheLife("hours");
  else cacheLife("minutes");
  return {
    tokenId,
    // Its marketplace name ("CHOG #1312"; a 1:1 keeps its title), never its token id dressed as a name.
    label: nameNumberOf(chog.name) !== null ? chog.name.trim() : `token ${tokenId}`,
    // Its persona name ("Rocket Ears"), the one every page shows.
    name: chogName(chog),
    archetype: genome.archetype,
    edgePct: replay?.edgePct ?? row?.edgePct ?? null,
    verdict: replay?.verdict ?? null,
    rank: row?.rank ?? null,
    total: population?.rows.length ?? CHOG_COUNT,
    windowLabel: replay?.window.label ?? null,
    curve,
    art,
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
  const card = tokenId ? await loadCard(tokenId) : null;
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
          {card?.art ? (
            <img src={card.art} width={460} height={460} alt="" style={{ objectFit: "cover" }} />
          ) : card ? (
            card.label
          ) : (
            <img src={LOGO_SRC} width={200} height={200} alt="" />
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", flex: 1, height: 460, justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 22, letterSpacing: 5, color: C.accentStrong, fontWeight: 600 }}>
              ANIMR · TIME MACHINE
            </div>
            <div style={{ display: "flex", marginTop: 14, fontSize: card ? 44 : 76, fontWeight: 600, letterSpacing: -1, lineHeight: 1.05 }}>
              {card ? card.name : "Every Chog is a trader"}
            </div>
            <div style={{ display: "flex", marginTop: 14, fontSize: 32, color: C.muted }}>
              {card ? `${card.label} · ${card.archetype}` : "1,969 traders on real $CHOG candles"}
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
    // A complete card is good for a while on the CDN; one still missing its replay or art is retried sooner.
    ogOptions(card && edge !== null && (card.art || !tokenId || !artExpected(tokenId)) ? 300 : 60),
  );
}
