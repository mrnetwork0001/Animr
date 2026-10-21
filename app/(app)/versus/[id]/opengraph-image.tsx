import { cacheLife } from "next/cache";
import type { CSSProperties } from "react";
import { SIDE_HEX, type Side } from "@/components/versus/shared";
import { ImageResponse } from "next/og";
import { FLAGGED_TOKEN_IDS } from "@/lib/brand-safety";
import { getChog } from "@/lib/dna/chogs";
import { resolveUri } from "@/lib/nft";
import { getBout } from "@/lib/rewind/bout";
import { decodeBoutId } from "@/lib/rewind/id";
import type { VersusBout, VersusFighter } from "@/lib/rewind/types";
import { loadVisibility } from "@/lib/visibility";

export const alt = "Two Chogs' trading genomes about to race the same hidden 48 hours of real $CHOG history: who stacks more?";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const C = {
  bg: "#0E0B1E",
  surface2: "#1C1737",
  line: "#2A2350",
  lineStrong: "#3A3170",
  fg: "#F3F1FF",
  muted: "#A59FC9",
  subtle: "#8A83B3",
  accentStrong: "#9D8CFF",
  success: "#3DDC97",
  danger: "#FF6B81",
};

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

/** The original art, decoded from the gateway's WebP with sharp (Next's own image library, a default server external). */
async function faceViaSharp(src: string): Promise<string> {
  const res = await fetch(src, { signal: AbortSignal.timeout(5_000) });
  if (!res.ok) throw new Error(`art ${res.status}`);
  const { default: sharp } = await import("sharp");
  const jpeg = await sharp(Buffer.from(await res.arrayBuffer())).resize(440, 440, { fit: "cover" }).jpeg({ quality: 85 }).toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

/** The same art as a resized JPEG from the image cache the app's thumbnails use (slow or missing when cold). */
async function faceViaResizer(src: string): Promise<string> {
  const url = `https://wsrv.nl/?url=${encodeURIComponent(src)}&w=440&h=440&fit=cover&output=jpg&q=85`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  if (!res.ok || !res.headers.get("content-type")?.includes("jpeg")) throw new Error(`resizer ${res.status}`);
  return `data:image/jpeg;base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
}

/**
 * The Chog's original art as a JPEG data URI, or null. The originals are 1000×1000 WebPs, which Satori accepts
 * but resvg draws blank, so they're converted first: whichever source answers first wins, and with neither
 * the card shows a name plate instead (never generated art). Flagged Chogs (their art shows the flagged
 * words) never go on a share card.
 */
async function loadFace(fighter: VersusFighter): Promise<string | null> {
  if (FLAGGED_TOKEN_IDS.has(fighter.tokenId)) return null;
  const src = resolveUri(fighter.image || getChog(fighter.tokenId)?.image || "");
  if (!src.startsWith("https://")) return null;
  return Promise.any([faceViaSharp(src), faceViaResizer(src)]).catch(() => null);
}

type CardFighter = {
  tokenId: number;
  title: string;
  ids: string;
  archetype: string;
  face: string | null;
};

// The card a shared bout unfurls with in X, Telegram or Discord is a pre-pick card: the page it opens asks the friend
// to call the winner, so the card never shows the result, either edge or the real dates (those come at the KO).
type Card = { a: CardFighter; b: CardFighter };

function cardFighter(fighter: VersusFighter, face: string | null): CardFighter {
  const metadataId = getChog(fighter.tokenId)?.metadataId;
  return {
    tokenId: fighter.tokenId,
    title: fighter.name || `token #${fighter.tokenId}`,
    ids: metadataId ? `CHOG #${metadataId} · token #${fighter.tokenId}` : `token #${fighter.tokenId}`,
    archetype: fighter.archetype,
    face,
  };
}

async function loadCard(id: string): Promise<Card | null> {
  "use cache";
  let bout: VersusBout;
  try {
    bout = await getBout(id);
  } catch {
    // Unknown id, or a window outside this server's price history: the generic card, retried soon.
    cacheLife("minutes");
    return null;
  }
  const [faceA, faceB] = await Promise.all([loadFace(bout.a), loadFace(bout.b)]);
  // A bout never changes; a card missing a face (the image cache was down) is retried sooner.
  const flagged = (f: VersusFighter) => FLAGGED_TOKEN_IDS.has(f.tokenId);
  if ((faceA || flagged(bout.a)) && (faceB || flagged(bout.b))) cacheLife("days");
  else cacheLife("minutes");
  return { a: cardFighter(bout.a, faceA), b: cardFighter(bout.b, faceB) };
}

function Face({ side, fighter }: { side: Side; fighter: CardFighter | null }) {
  const color = SIDE_HEX[side];
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 250,
        height: 250,
        flexShrink: 0,
        borderRadius: 34,
        overflow: "hidden",
        border: `4px solid ${color}`,
        background: `linear-gradient(135deg, ${color}55, ${C.surface2})`,
        boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
      }}
    >
      {fighter?.face ? (
        <img src={fighter.face} width={250} height={250} alt="" style={{ objectFit: "cover" }} />
      ) : (
        // No art (flagged, or the image cache was down): a plain name card, never generated art.
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <div style={{ display: "flex", fontSize: 42, fontWeight: 600, color: C.fg }}>
            {fighter ? fighter.ids.split(" · ")[0] : "Chog"}
          </div>
          {fighter && <div style={{ display: "flex", fontSize: 20, color: C.muted }}>{fighter.ids.split(" · ")[1] ?? ""}</div>}
        </div>
      )}
    </div>
  );
}

function Corner({ side, fighter }: { side: Side; fighter: CardFighter | null }) {
  const line: CSSProperties = { display: "flex", maxWidth: 360, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" };
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 360 }}>
      <div style={{ display: "flex", marginTop: 10 }}>
        <Face side={side} fighter={fighter} />
      </div>
      <div style={{ ...line, marginTop: 14, fontSize: 30, fontWeight: 600, color: SIDE_HEX[side] }}>
        {fighter?.title ?? "A Chog"}
      </div>
      <div style={{ ...line, marginTop: 2, fontSize: 19, color: C.muted }}>{fighter?.archetype ?? "1 of 1,969 traders"}</div>
      <div style={{ ...line, marginTop: 2, fontSize: 16, color: C.subtle }}>{fighter?.ids ?? "Chog Genesis"}</div>
    </div>
  );
}

/** A bout whose fighters are both on show (a Chog its holder hid never goes on a card: the generic one instead). */
async function shownBoutId(id: string): Promise<string | null> {
  const key = decodeBoutId(id);
  if (!key) return null;
  const { hidden } = await loadVisibility();
  return hidden.has(key.a) || hidden.has(key.b) ? null : id;
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const shown = await shownBoutId((await params).id);
  const [card, fonts] = await Promise.all([shown ? loadCard(shown) : null, loadFonts()]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "36px 52px 32px",
          background: C.bg,
          backgroundImage:
            "radial-gradient(620px 420px at 12% 40%, rgba(131,110,249,0.30), transparent 70%), radial-gradient(620px 420px at 88% 40%, rgba(245,181,68,0.18), transparent 70%)",
          color: C.fg,
          fontFamily: "Geist",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 22, letterSpacing: 5, color: C.accentStrong, fontWeight: 600 }}>
            ANIMR · VERSUS
          </div>
          <div style={{ display: "flex", fontSize: 20, color: C.muted }}>48 hidden hours of real $CHOG history</div>
        </div>

        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
          <Corner side="a" fighter={card?.a ?? null} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 280 }}>
            <div
              style={{
                display: "flex",
                fontSize: 96,
                fontWeight: 600,
                letterSpacing: -2,
                color: C.fg,
                transform: "rotate(-4deg)",
              }}
            >
              VS
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 18,
                fontSize: 26,
                fontWeight: 600,
                textAlign: "center",
                justifyContent: "center",
                lineHeight: 1.2,
                maxWidth: 280,
              }}
            >
              Who stacks more $CHOG?
            </div>
            <div style={{ display: "flex", marginTop: 10, fontSize: 18, color: C.muted, textAlign: "center", justifyContent: "center", maxWidth: 260 }}>
              Two trading genomes, the same 48 hidden hours. Call it before the KO.
            </div>
          </div>
          <Corner side="b" fighter={card?.b ?? null} />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 19, color: C.subtle }}>
          <div style={{ display: "flex" }}>Simulated on real $CHOG history (1% fee + impact) · points only</div>
          <div style={{ display: "flex" }}>Not affiliated with Chog</div>
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}
