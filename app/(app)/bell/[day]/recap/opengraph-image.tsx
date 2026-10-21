import { ImageResponse } from "next/og";
import { connection } from "next/server";
import { signedPct } from "@/components/bell/format";
import { type BellRecap, getRecap, type RecapChog } from "@/lib/bell/recap";
import { parseDay } from "@/lib/bell/rules";
import { chogArt } from "@/lib/og/art";
import { C, ogOptions, toneOf } from "@/lib/og/theme";
import { ChogFace, Eyebrow, Frame, POINTS_NOTE } from "@/lib/og/ui";

// The share card of /bell/[day]/recap: the Bell's move and recap headline, two of its lines, and the quotes of the
// best call and the most rekt with their art. Written on request (the recap itself is written once and stored); a
// Bell without a recap gets a plain card.

export const alt = "A Daily Bell recap: what $CHOG did, the best call and the most rekt, in the Chogs' own words";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const shortDay = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
const upper = (text: string) => text.toUpperCase();
/** Real minus signs, like every other number on the cards. */
const minus = (text: string) => text.replace(/(^|[\s(])-(?=\d)/g, "$1−");

export default async function Image({ params }: { params: Promise<{ day: string }> }) {
  await connection();
  const day = parseDay((await params).day);
  const recap = day ? await getRecap(day).catch(() => null) : null;
  if (!recap) return new ImageResponse(<NoRecap />, ogOptions(300));
  const [winnerArt, rektArt] = await Promise.all([chogArt(recap.winner.tokenId), recap.rekt ? chogArt(recap.rekt.tokenId) : null]);
  return new ImageResponse(<RecapCard recap={recap} winnerArt={winnerArt} rektArt={rektArt} />, ogOptions(recap.writtenBy === "ai" ? 3600 : 300));
}

function RecapCard({ recap, winnerArt, rektArt }: { recap: BellRecap; winnerArt: string | null; rektArt: string | null }) {
  const when = upper(shortDay.format(Date.parse(`${recap.day}T00:00:00Z`)));
  const note = recap.kind === "replay" ? "Replayed Bell: rebuilt from real $CHOG candles · points only" : POINTS_NOTE;
  return (
    <Frame section="DAILY BELL · RECAP" note={note}>
      <div style={{ display: "flex", gap: 40, width: "100%" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
          <Eyebrow color={C.muted}>{`THE BELL OF ${when}${recap.kind === "replay" ? " · REPLAY" : ""}`}</Eyebrow>
          <div style={{ display: "flex", alignItems: "baseline", gap: 18, marginTop: 14 }}>
            <div style={{ display: "flex", fontSize: 84, fontWeight: 600, letterSpacing: -3, lineHeight: 0.95, color: toneOf(recap.actualPct) }}>
              {minus(signedPct(recap.actualPct))}
            </div>
            <div style={{ display: "flex", fontSize: 24, color: C.muted }}>$CHOG in 24 hours</div>
          </div>
          <div style={{ display: "flex", marginTop: 20, fontSize: 40, fontWeight: 600, letterSpacing: -1, lineHeight: 1.12 }}>
            {minus(recap.headline)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 20 }}>
            {recap.lines.slice(0, 2).map((line) => (
              <div key={line} style={{ display: "flex", fontSize: 22, color: C.muted, lineHeight: 1.35 }}>
                {minus(line)}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", flex: 1 }} />
          {recap.writtenBy === "ai" && (
            <div style={{ display: "flex", fontSize: 17, color: C.subtle }}>Written by AI on 0G Compute</div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, width: 430 }}>
          <QuoteBox chog={recap.winner} art={winnerArt} heading="BEST CALL" color={C.success} />
          {recap.rekt && <QuoteBox chog={recap.rekt} art={rektArt} heading="MOST REKT" color={C.warning} />}
        </div>
      </div>
    </Frame>
  );
}

function QuoteBox({ chog, art, heading, color }: { chog: RecapChog; art: string | null; heading: string; color: string }) {
  const quote = chog.quote.length > 120 ? `${chog.quote.slice(0, 117).trimEnd()}…` : chog.quote;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        padding: "18px 20px",
        borderRadius: 22,
        background: C.surface,
        border: `2px solid ${C.line}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <ChogFace art={art} tokenId={chog.tokenId} label={chog.tag.replace("CHOG ", "") || "Chog"} size={64} radius={14} border={2} />
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ display: "flex", fontSize: 14, fontWeight: 600, letterSpacing: 2, color }}>
            {`${heading} · CALLED ${minus(signedPct(chog.forecastPct))}`}
          </div>
          <div style={{ display: "flex", fontSize: 24, fontWeight: 600, marginTop: 2 }}>{chog.name}</div>
          {chog.tag && <div style={{ display: "flex", fontSize: 16, color: C.subtle }}>{chog.tag}</div>}
        </div>
      </div>
      <div style={{ display: "flex", marginTop: 12, fontSize: 19, lineHeight: 1.35, color: C.fg }}>{`“${minus(quote)}”`}</div>
    </div>
  );
}

function NoRecap() {
  return (
    <Frame section="DAILY BELL · RECAP" note={POINTS_NOTE}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: "100%" }}>
        <Eyebrow color={C.muted}>EVERY DAY · 15:00 UTC</Eyebrow>
        <div style={{ display: "flex", marginTop: 14, fontSize: 64, fontWeight: 600, letterSpacing: -2.5, lineHeight: 1.05 }}>
          The Daily Bell recap
        </div>
        <div style={{ display: "flex", marginTop: 18, maxWidth: 980, fontSize: 28, color: C.muted, lineHeight: 1.35 }}>
          All 1,969 Chogs call $CHOG for the next 24 hours, and the real market settles every call. The recap is written once a Bell settles.
        </div>
      </div>
    </Frame>
  );
}
