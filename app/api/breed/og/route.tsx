/* eslint-disable @next/next/no-img-element -- next/og (Satori) draws plain <img>. */
import { ImageResponse } from "next/og";
import type { ReactNode } from "react";
import { connection } from "next/server";
import { signedPct } from "@/components/dna/shared";
import { type BreedResult, breed } from "@/lib/breed/breed";
import { breedPair } from "@/lib/breed/pair";
import { chogArt } from "@/lib/og/art";
import { C, ogOptions, toneOf } from "@/lib/og/theme";
import { ChogFace, Frame, SIM_NOTE } from "@/lib/og/ui";
import { isHiddenChog } from "@/lib/visibility";

// The /breed share card (1200x630): parent A + parent B = their child, with each one's simulated score vs holding.
// A route handler rather than breed/opengraph-image.tsx, because the card depends on ?a=&b= (metadata image files
// can't read search params). Hidden Chogs never go on a card: the generic card instead.

const FACE = 230;

function Score({ pct, size = 40 }: { pct: number; size?: number }) {
  return <div style={{ display: "flex", fontSize: size, fontWeight: 600, letterSpacing: -1, color: toneOf(pct) }}>{signedPct(pct)}</div>;
}

function Member({ face, tokenId, name, sub, pct }: { face: ReactNode; tokenId: number; name: string; sub: string; pct: number }) {
  return (
    <div key={tokenId} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: FACE + 20 }}>
      {face}
      <div style={{ display: "flex", marginTop: 16, fontSize: 30, fontWeight: 600, whiteSpace: "nowrap" }}>{name}</div>
      <div style={{ display: "flex", marginTop: 4, fontSize: 20, color: C.subtle, whiteSpace: "nowrap" }}>{sub}</div>
      <div style={{ display: "flex", marginTop: 8 }}>
        <Score pct={pct} />
      </div>
    </div>
  );
}

function Sign({ children }: { children: string }) {
  return <div style={{ display: "flex", fontSize: 64, color: C.subtle, marginTop: FACE / 2 - 50 }}>{children}</div>;
}

function Card({ result, art }: { result: BreedResult; art: [string | null, string | null] }) {
  const { a, b, child } = result;
  const half = (src: string | null, side: "left" | "right") => (
    <div style={{ display: "flex", width: FACE / 2, height: FACE, overflow: "hidden", background: C.surface2 }}>
      {src && <img src={src} width={FACE} height={FACE} alt="" style={{ marginLeft: side === "left" ? 0 : -FACE / 2 }} />}
    </div>
  );
  return (
    <Frame section="BREED · TRADING DNA" note={SIM_NOTE}>
      <div style={{ display: "flex", flexDirection: "column", width: "100%", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <Member face={<ChogFace art={art[0]} tokenId={a.tokenId} size={FACE} name={a.name} />} tokenId={a.tokenId} name={a.name} sub={a.label} pct={a.edgePct} />
          <Sign>+</Sign>
          <Member face={<ChogFace art={art[1]} tokenId={b.tokenId} size={FACE} name={b.name} />} tokenId={b.tokenId} name={b.name} sub={b.label} pct={b.edgePct} />
          <Sign>=</Sign>
          <Member
            face={
              <div style={{ display: "flex", borderRadius: 23, overflow: "hidden", border: `3px solid ${C.accentStrong}` }}>
                {half(art[0], "left")}
                {half(art[1], "right")}
              </div>
            }
            tokenId={0}
            name={child.name}
            sub="Their child"
            pct={child.edgePct}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "baseline", gap: 16 }}>
          <div style={{ display: "flex", fontSize: 36, fontWeight: 600, color: C.fg }}>{result.verdict.text}</div>
          <div style={{ display: "flex", fontSize: 24, color: C.muted }}>vs just holding $CHOG</div>
        </div>
      </div>
    </Frame>
  );
}

function Generic() {
  return (
    <Frame section="BREED · TRADING DNA" note={SIM_NOTE}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: "100%" }}>
        <div style={{ display: "flex", fontSize: 84, fontWeight: 600, letterSpacing: -2 }}>Breed two Chogs</div>
        <div style={{ display: "flex", marginTop: 18, fontSize: 34, color: C.muted }}>
          Their child gets its own Trading DNA and trades the real $CHOG chart.
        </div>
      </div>
    </Frame>
  );
}

export async function GET(request: Request) {
  await connection();
  const query = Object.fromEntries(new URL(request.url).searchParams);
  const { a, b } = breedPair(query);
  const hidden = a === b || (await isHiddenChog(a)) || (await isHiddenChog(b));
  if (hidden) return new ImageResponse(<Generic />, ogOptions(600));
  try {
    const [result, artA, artB] = await Promise.all([breed(a, b), chogArt(a), chogArt(b)]);
    // A card missing art is retried soon; a complete one is good for an hour (the candles move hourly).
    return new ImageResponse(<Card result={result} art={[artA, artB]} />, ogOptions(artA && artB ? 3600 : 120));
  } catch (error) {
    console.error("[animr] /api/breed/og:", error);
    return new ImageResponse(<Generic />, ogOptions(120));
  }
}
