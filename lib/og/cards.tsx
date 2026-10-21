import type { ReactNode } from "react";
import { formatDay, formatUtcTime } from "@/components/bell/format";
import { formatInt, signedPct } from "@/components/dna/shared";
import type { TradingStyle } from "@/lib/agent/types";
import { nameNumberOf } from "@/lib/chog-id";
import type {
  BellCardData,
  BellOracle,
  BellSide,
  BellSpot,
  CardGene,
  ChogBellBrief,
  ChogCardCore,
  LeagueCardData,
  ShowcaseChog,
} from "./data";
import { C, toneOf } from "./theme";
import { ChogFace, Chip, Eyebrow, FaceStrip, Frame, HerdChart, POINTS_NOTE, SIM_NOTE, SplitBar } from "./ui";

// The share cards (1200x630, next/og). Pure layouts over lib/og/data.ts: every card renders whatever
// data it gets, so a missing piece shrinks the card instead of breaking it. Same metric everywhere:
// $CHOG stacked vs just holding, labelled simulated; Bell numbers are points, never money.

const CHOGS = "1,969";
const STYLE_TONE: Record<TradingStyle, string> = { aggressive: C.warning, balanced: C.accentStrong, cautious: "#7DD3FC" };
const upper = (text: string) => text.toUpperCase();
/** "Oct 17" from "2026-10-17". */
const shortDay = (day: string) => formatDay(day).replace(/^\w+,\s*/, "");
/** "TUE, OCT 20 · 15:00 UTC" from an ISO time. */
const whenUtc = (iso: string) => `${formatDay(iso.slice(0, 10))} · ${formatUtcTime(iso)}`;

// --- /chog/[tokenId] ------------------------------------------------------------------------------

export function ChogCard({ core, bell }: { core: ChogCardCore; bell: ChogBellBrief | null }) {
  // "CHOG #1468 · token 7" (lib/chog-id.ts): the name marketplaces show, then the id the app uses. The
  // ten 1:1s carry long names ("CHOG #392 — Burning Skully"), so the title shrinks to fit its column.
  const nameNumber = nameNumberOf(core.metadataName);
  const title = nameNumber === null ? `Chog #${core.tokenId}` : core.metadataName;
  const titleSize = Math.min(58, Math.floor(520 / (0.6 * title.length)));
  // "Knife-Catching Breakout Chaser" and its style chip must share the column too.
  const archetypeSize = Math.min(34, Math.floor(470 / (0.58 * core.archetype.length)));
  const note = core.league ? `Simulated on real $CHOG candles, ${core.league.windowLabel} (1% fee + impact)` : SIM_NOTE;
  return (
    <Frame section="MEET · TRADING DNA" note={note}>
      <div style={{ display: "flex", alignItems: "center", gap: 44, width: "100%" }}>
        <ChogFace
          art={core.art}
          tokenId={core.tokenId}
          label={nameNumber === null ? undefined : `#${nameNumber}`}
          name={core.name}
          size={398}
          radius={40}
        />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1, height: 398 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
              <div
                style={{ display: "flex", flexShrink: 0, fontSize: titleSize, fontWeight: 600, letterSpacing: -1.5, lineHeight: 1, whiteSpace: "nowrap" }}
              >
                {title}
              </div>
              {nameNumber !== null && (
                <div style={{ display: "flex", flexShrink: 0, fontSize: 24, color: C.subtle, whiteSpace: "nowrap" }}>{`· token ${core.tokenId}`}</div>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 14 }}>
              <div
                style={{
                  display: "flex",
                  flexShrink: 0,
                  fontSize: archetypeSize,
                  fontWeight: 600,
                  color: C.accentStrong,
                  lineHeight: 1.1,
                  whiteSpace: "nowrap",
                }}
              >
                {core.archetype}
              </div>
              <Chip color={STYLE_TONE[core.style]} border={STYLE_TONE[core.style]} size={14}>
                {upper(core.style)}
              </Chip>
            </div>
            <div style={{ display: "flex", marginTop: 8, fontSize: 20, color: C.muted }}>{`AI trader “${core.name}”`}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {core.genes.map((gene) => (
              <GeneRow key={gene.key} gene={gene} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 16 }}>
            <LeagueTile league={core.league} />
            <BellTile bell={bell} />
          </div>
        </div>
      </div>
    </Frame>
  );
}

function GeneRow({ gene }: { gene: CardGene }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ display: "flex", flexShrink: 0, width: 92, fontSize: 15, fontWeight: 600, letterSpacing: 2, color: C.subtle }}>
        {upper(gene.label)}
      </div>
      <div style={{ display: "flex", flexShrink: 0, fontSize: 24, fontWeight: 600, whiteSpace: "nowrap" }}>{gene.display}</div>
      {gene.trait && (
        <div
          style={{
            display: "flex",
            minWidth: 0,
            overflow: "hidden",
            gap: 6,
            padding: "3px 10px",
            borderRadius: 8,
            background: "rgba(131,110,249,0.14)",
            border: "1.5px solid rgba(131,110,249,0.35)",
            fontSize: 16,
            whiteSpace: "nowrap",
          }}
        >
          <div style={{ display: "flex", color: C.subtle }}>{gene.trait.type}</div>
          <div style={{ display: "flex", color: C.accentStrong, fontWeight: 600 }}>{gene.trait.value}</div>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, tone, detail }: { label: string; value: string; tone: string; detail: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minWidth: 0,
        overflow: "hidden",
        padding: "14px 18px",
        borderRadius: 18,
        background: C.surface,
        border: `2px solid ${C.line}`,
      }}
    >
      <div style={{ display: "flex", fontSize: 14, fontWeight: 600, letterSpacing: 2, color: C.subtle, whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ display: "flex", marginTop: 6, fontSize: 40, fontWeight: 600, letterSpacing: -1, lineHeight: 1, color: tone }}>{value}</div>
      <div style={{ display: "flex", marginTop: 8, fontSize: 17, color: C.muted, whiteSpace: "nowrap" }}>{detail}</div>
    </div>
  );
}

function LeagueTile({ league }: { league: ChogCardCore["league"] }) {
  if (!league) {
    return <Tile label="THE LEAGUE" value={`${CHOGS} traders`} tone={C.fg} detail="ranked vs just holding $CHOG" />;
  }
  return (
    <Tile
      label="LEAGUE · SIMULATED"
      value={signedPct(league.edgePct)}
      tone={toneOf(league.edgePct)}
      detail={`vs just holding · #${formatInt(league.rank)} of ${formatInt(league.total)}`}
    />
  );
}

function BellTile({ bell }: { bell: ChogBellBrief | null }) {
  if (!bell) return <Tile label="DAILY BELL" value="15:00 UTC" tone={C.fg} detail="it calls $CHOG every day" />;
  const label = bell.kind === "replay" ? `BELL REPLAY · ${upper(shortDay(bell.day))}` : `BELL · ${upper(formatDay(bell.day))}`;
  const value = signedPct(bell.forecastPct);
  if (bell.status === "settled" && bell.actualPct !== null) {
    const points = bell.points === null ? "" : ` · ${formatInt(bell.points)} pts`;
    return <Tile label={label} value={value} tone={toneOf(bell.forecastPct)} detail={`$CHOG did ${signedPct(bell.actualPct)}${points}`} />;
  }
  return (
    <Tile
      label={label}
      value={value}
      tone={toneOf(bell.forecastPct)}
      detail={`its 24h call · ${Math.round(bell.conviction * 100)}% conviction`}
    />
  );
}

// --- /bell and /bell/[day] ------------------------------------------------------------------------

/** `latest`: the /bell card (the newest Bell, next to the last settled Bell's verdict). */
export function BellCard({ data, latest }: { data: BellCardData; latest: boolean }) {
  if (data.state === "none") return <BellPlaceholder day={data.day} upcoming={data.upcoming} showcase={data.showcase} />;
  const { bell, verdict, bold } = data;
  const note = bell.kind === "replay" ? "Replayed Bell: genome calls rebuilt from real $CHOG candles · points only" : POINTS_NOTE;
  return (
    <Frame section={latest ? "RIDE · THE DAILY BELL" : "RIDE · DAILY BELL"} note={note}>
      <div style={{ display: "flex", gap: 40, width: "100%" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 600 }}>
          <BellHeadline bell={bell} />
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <SplitBar bull={bell.split.bull} flat={bell.split.flat} bear={bell.split.bear} exact={bell.split.exact} width={600} />
            <HerdChart
              herd={bell.herd}
              actualPct={bell.status === "settled" ? bell.actualPct : null}
              markerLabel={bell.actualPct === null ? undefined : `$CHOG ${signedPct(bell.actualPct)}`}
              width={600}
              height={128}
            />
          </div>
        </div>
        <div style={{ display: "flex", flex: 1 }}>
          {verdict ? (
            <OracleBox oracle={verdict} sameBell={verdict.day === bell.day} />
          ) : bold ? (
            <BoldBox bull={bold.bull} bear={bold.bear} horizonAt={bell.horizonAt} />
          ) : (
            <SettleBox bell={bell} />
          )}
        </div>
      </div>
    </Frame>
  );
}

function BellHeadline({ bell }: { bell: BellSide }) {
  const settled = bell.status === "settled" && bell.actualPct !== null;
  const herdUp = bell.split.bull >= bell.split.bear;
  const herdShare = Math.round(((herdUp ? bell.split.bull : bell.split.bear) / Math.max(1, bell.calls)) * 100);
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Eyebrow color={C.muted}>{`THE BELL OF ${upper(formatDay(bell.day))} · 15:00 UTC`}</Eyebrow>
        <Chip size={13} color={settled ? C.fg : C.warning} border={settled ? C.lineStrong : C.warning}>
          {settled ? "SETTLED" : "OPEN"}
        </Chip>
      </div>
      {settled ? (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 22, marginTop: 12 }}>
          <div
            style={{
              display: "flex",
              flexShrink: 0,
              fontSize: 92,
              fontWeight: 600,
              letterSpacing: -3,
              lineHeight: 0.9,
              color: toneOf(bell.actualPct),
            }}
          >
            {signedPct(bell.actualPct!)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, paddingBottom: 4 }}>
            <div style={{ display: "flex", fontSize: 24, color: C.fg, fontWeight: 600 }}>$CHOG in 24 hours</div>
            <div style={{ display: "flex", fontSize: 20, color: C.muted }}>
              {Math.abs(bell.actualPct!) < 0.05
                ? `Flat close · ${herdShare}% called it ${herdUp ? "up" : "down"}`
                : `${(bell.actualPct! > 0) === herdUp ? "The herd nailed it" : "The herd got it wrong"}: ${herdShare}% called it ${herdUp ? "up" : "down"}`}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", marginTop: 12 }}>
          <div style={{ display: "flex", fontSize: 46, fontWeight: 600, letterSpacing: -1.5, lineHeight: 1.05 }}>
            {`${formatInt(bell.calls)} Chogs called $CHOG`}
          </div>
          <div style={{ display: "flex", marginTop: 8, fontSize: 22, color: C.muted }}>
            {`for the next 24 hours · settles ${whenUtc(bell.horizonAt)}`}
          </div>
        </div>
      )}
    </div>
  );
}

function SpotBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        padding: "22px 24px",
        borderRadius: 24,
        background: C.surface,
        border: `2px solid ${C.line}`,
      }}
    >
      <Eyebrow color={C.accentStrong}>{title}</Eyebrow>
      {children}
    </div>
  );
}

/** "0.02 pts", "2.1 pts", "11 pts" (components/bell/format.ts formatErrorPts). */
const pts = (value: number) => `${value.toFixed(value < 1 ? 2 : value < 10 ? 1 : 0)} pts`;

function OracleBox({ oracle, sameBell }: { oracle: BellOracle; sameBell: boolean }) {
  const title = sameBell
    ? "ORACLE OF THE DAY"
    : `LAST ORACLE · ${upper(shortDay(oracle.day))}${oracle.kind === "replay" ? " · REPLAY" : ""}`;
  const off = oracle.errorPts === null ? "" : ` · off by ${pts(oracle.errorPts)}`;
  return (
    <SpotBox title={title}>
      <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 16 }}>
        <ChogFace art={oracle.art} tokenId={oracle.tokenId} size={140} radius={22} border={2} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 32, fontWeight: 600, letterSpacing: -0.5 }}>{`Chog #${oracle.tokenId}`}</div>
          <div style={{ display: "flex", fontSize: 19, color: C.muted, marginTop: 2 }}>{oracle.name}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 10 }}>
            <div style={{ display: "flex", fontSize: 19, color: C.muted }}>called</div>
            <div style={{ display: "flex", fontSize: 36, fontWeight: 600, color: toneOf(oracle.forecastPct) }}>{signedPct(oracle.forecastPct)}</div>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", marginTop: 14, fontSize: 19, color: C.muted }}>{`$CHOG did ${signedPct(oracle.actualPct)}${off}`}</div>
      <div style={{ display: "flex", marginTop: 10, fontSize: 20, color: C.fg, lineHeight: 1.35 }}>{`“${oracle.line}”`}</div>
      <div style={{ display: "flex", flex: 1 }} />
      {oracle.rekt && (
        <div style={{ display: "flex", alignItems: "center", gap: 14, paddingTop: 14, borderTop: `2px solid ${C.line}` }}>
          <ChogFace art={oracle.rekt.art} tokenId={oracle.rekt.tokenId} size={58} radius={12} border={2} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 14, fontWeight: 600, letterSpacing: 2, color: C.warning }}>
              {oracle.rekt.errorPts === null ? "MOST REKT" : `MOST REKT · OFF BY ${upper(pts(oracle.rekt.errorPts))}`}
            </div>
            <div style={{ display: "flex", gap: 8, fontSize: 19, marginTop: 2 }}>
              <div style={{ display: "flex", color: C.fg }}>{`Chog #${oracle.rekt.tokenId} called`}</div>
              <div style={{ display: "flex", fontWeight: 600, color: toneOf(oracle.rekt.forecastPct) }}>{signedPct(oracle.rekt.forecastPct)}</div>
            </div>
          </div>
        </div>
      )}
    </SpotBox>
  );
}

function BoldRow({ spot, side }: { spot: BellSpot | null; side: "bull" | "bear" }) {
  const color = side === "bull" ? C.success : C.danger;
  if (!spot) {
    return (
      <div style={{ display: "flex", alignItems: "center", height: 112, fontSize: 20, color: C.subtle }}>
        {side === "bull" ? "▲ No Chog called it up" : "▼ No Chog called it down"}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <ChogFace art={spot.art} tokenId={spot.tokenId} size={112} radius={18} border={2} />
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontSize: 15, fontWeight: 600, letterSpacing: 2, color }}>{side === "bull" ? "▲ BOLDEST BULL" : "▼ BOLDEST BEAR"}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 4 }}>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 600, color }}>{signedPct(spot.forecastPct)}</div>
          <div style={{ display: "flex", fontSize: 17, color: C.muted }}>{`${Math.round(spot.conviction * 100)}% conviction`}</div>
        </div>
        <div style={{ display: "flex", fontSize: 19, color: C.fg, marginTop: 2 }}>{`Chog #${spot.tokenId} · ${spot.name}`}</div>
      </div>
    </div>
  );
}

function BoldBox({ bull, bear, horizonAt }: { bull: BellSpot | null; bear: BellSpot | null; horizonAt: string }) {
  return (
    <SpotBox title="THE BOLDEST CALLS">
      <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 18 }}>
        <BoldRow spot={bull} side="bull" />
        <BoldRow spot={bear} side="bear" />
      </div>
      <div style={{ display: "flex", flex: 1 }} />
      <div style={{ display: "flex", paddingTop: 14, borderTop: `2px solid ${C.line}`, fontSize: 18, color: C.muted, lineHeight: 1.35 }}>
        {`Settles on the real price at ${whenUtc(horizonAt)}. The closest call is the Oracle of the Day.`}
      </div>
    </SpotBox>
  );
}

function SettleBox({ bell }: { bell: BellSide }) {
  return (
    <SpotBox title="HOW IT SETTLES">
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16, fontSize: 21, color: C.muted, lineHeight: 1.35 }}>
        <div style={{ display: "flex" }}>{`Every call is scored on the real CHOG/WMON price at ${whenUtc(bell.horizonAt)}.`}</div>
        <div style={{ display: "flex" }}>The closest Chog is the Oracle of the Day.</div>
      </div>
    </SpotBox>
  );
}

/** No Bell for the card: an upcoming day, a day before the history, or the Bell store unreachable. */
function BellPlaceholder({ day, upcoming, showcase }: { day: string | null; upcoming: boolean; showcase: ShowcaseChog[] }) {
  const title = day && upcoming ? `The Bell of ${formatDay(day)}` : day ? `No Bell rang on ${formatDay(day)}` : "The Daily Bell";
  return (
    <Frame section="RIDE · THE DAILY BELL" note={POINTS_NOTE}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: "100%" }}>
        <Eyebrow color={C.muted}>EVERY DAY · 15:00 UTC</Eyebrow>
        <div style={{ display: "flex", marginTop: 14, fontSize: 68, fontWeight: 600, letterSpacing: -2.5, lineHeight: 1 }}>{title}</div>
        <div style={{ display: "flex", marginTop: 18, maxWidth: 980, fontSize: 28, color: C.muted, lineHeight: 1.35 }}>
          {day && upcoming
            ? `It rings at 15:00 UTC: all ${CHOGS} Chogs call $CHOG for the next 24 hours, and the real market settles every call.`
            : `All ${CHOGS} Chogs call $CHOG for the next 24 hours at 15:00 UTC, and the real market settles every call. Ride one for points.`}
        </div>
        <div style={{ display: "flex", marginTop: 30 }}>
          <FaceStrip faces={showcase} size={144} />
        </div>
      </div>
    </Frame>
  );
}

// --- /league --------------------------------------------------------------------------------------

/** `showcase`: faces for when the league couldn't be computed (no podium to show). */
export function LeagueCard({ data, showcase = [] }: { data: LeagueCardData | null; showcase?: ShowcaseChog[] }) {
  return (
    <Frame section="MEET · THE LEAGUE" note={SIM_NOTE}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: "100%" }}>
        <div style={{ display: "flex", fontSize: data ? 60 : 68, fontWeight: 600, letterSpacing: -2, lineHeight: 1 }}>
          {`${CHOGS} Chogs, ${CHOGS} AI traders`}
        </div>
        <div style={{ display: "flex", marginTop: 14, fontSize: data ? 24 : 28, color: C.muted, lineHeight: 1.35 }}>
          Every Chog’s traits compile into a trading genome, ranked by $CHOG stacked vs just holding.
        </div>
        {data ? (
          <div style={{ display: "flex", gap: 22, marginTop: 32 }}>
            {data.podium.map((row) => (
              <Podium key={row.tokenId} row={row} />
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", marginTop: 30 }}>
            <FaceStrip faces={showcase} size={144} />
          </div>
        )}
        {data && (
          <div style={{ display: "flex", marginTop: 24, fontSize: 21, color: C.muted }}>
            {`${data.windowLabel} · ${Math.round(data.stats.beatHoldPct)}% of the ${formatInt(data.total)} beat holding · median ${signedPct(data.stats.medianEdgePct)} · worst ${signedPct(data.stats.worstEdgePct)}`}
          </div>
        )}
      </div>
    </Frame>
  );
}

const MEDAL = ["#F5C451", "#C9CEDB", "#D9925B"];

function Podium({ row }: { row: LeagueCardData["podium"][number] }) {
  const medal = MEDAL[row.rank - 1] ?? C.lineStrong;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flex: 1,
        gap: 18,
        padding: 16,
        borderRadius: 24,
        background: C.surface,
        border: `2px solid ${C.line}`,
      }}
    >
      <div style={{ display: "flex", position: "relative" }}>
        <ChogFace art={row.art} tokenId={row.tokenId} size={150} radius={20} border={2} />
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: -6,
            top: -6,
            padding: "2px 10px",
            borderRadius: 10,
            background: medal,
            color: C.bg,
            fontSize: 20,
            fontWeight: 600,
          }}
        >
          {`#${row.rank}`}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", fontSize: 24, fontWeight: 600, letterSpacing: -0.5, whiteSpace: "nowrap" }}>{`Chog #${row.tokenId}`}</div>
        <div style={{ display: "flex", marginTop: 4, fontSize: 18, color: C.accentStrong, lineHeight: 1.2 }}>{row.archetype}</div>
        <div style={{ display: "flex", marginTop: 12, fontSize: 40, fontWeight: 600, letterSpacing: -1, lineHeight: 1, color: toneOf(row.edgePct) }}>
          {signedPct(row.edgePct)}
        </div>
        <div style={{ display: "flex", marginTop: 6, fontSize: 16, color: C.subtle }}>vs just holding</div>
      </div>
    </div>
  );
}

// --- Fallback -------------------------------------------------------------------------------------

/** For an unknown Chog id: the pitch and five real Chogs, no numbers. */
export function GenericCard({ showcase }: { showcase: ShowcaseChog[] }) {
  return (
    <Frame section="MEET · EVERY CHOG IS A TRADER" note={SIM_NOTE}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: "100%" }}>
        <div style={{ display: "flex", fontSize: 68, fontWeight: 600, letterSpacing: -2.5, lineHeight: 1 }}>Every Chog is a trader</div>
        <div style={{ display: "flex", marginTop: 18, maxWidth: 980, fontSize: 28, color: C.muted, lineHeight: 1.35 }}>
          {`${CHOGS} Chog NFTs, ${CHOGS} AI traders: each one’s traits compile into a trading genome, replayed on the real $CHOG chart against just holding.`}
        </div>
        <div style={{ display: "flex", marginTop: 30 }}>
          <FaceStrip faces={showcase} size={144} />
        </div>
      </div>
    </Frame>
  );
}
