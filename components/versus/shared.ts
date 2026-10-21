import type { TradingStyle } from "@/lib/agent/types";
import { scrubTraitText } from "@/lib/brand-safety";
import type { Genome } from "@/lib/dna/types";
import { VERSUS_DAILY_POINTS_CAP, VERSUS_POINTS_PER_WIN } from "@/lib/rewind/rules";
import type { VersusBout, VersusFighter, VersusFrame } from "@/lib/rewind/types";
import { parseChogQuery } from "@/lib/chog-id";

// Shared by the Versus UI (components/versus/*, app/(app)/versus/*). Safe on server and client.
// The engine's own copy and rules (lib/rewind/rules.ts) are client-safe too: scoring numbers come from there.

/** What a correct pick earns, and the most Versus points a fan can earn per UTC day. */
export const PICK_POINTS = VERSUS_POINTS_PER_WIN;
export const DAILY_POINTS_CAP = VERSUS_DAILY_POINTS_CAP;
/** Chog Genesis token ids run 1–1969. */
export const VERSUS_CHOG_COUNT = 1969;

export type Side = "a" | "b";
export const SIDES = ["a", "b"] as const satisfies readonly Side[];
export const otherSide = (side: Side): Side => (side === "a" ? "b" : "a");

/** Fighter colors (v2): A in teal, B in violet (chart series 1 and 2). */
export const SIDE_COLOR: Record<Side, string> = { a: "var(--v2-chart-1)", b: "var(--v2-chart-2)" };
/** The same colors as hex, for the share card (Satori has no CSS variables). */
export const SIDE_HEX: Record<Side, string> = { a: "#9FF0EC", b: "#8B78EC" };

/** A trading style's badge tone (v2 badges: no new hues). */
export const STYLE_CHIP: Record<TradingStyle, string> = {
  aggressive: "v2-badge--violet",
  balanced: "",
  cautious: "v2-badge--teal",
};

export const boutPath = (id: string) => `/versus/${encodeURIComponent(id)}`;

/** % vs simply holding the starting $CHOG. */
export function edgeOf(value: number, startChog: number): number {
  return startChog > 0 && Number.isFinite(value) ? (value / startChog - 1) * 100 : 0;
}

/** "+9.1%" with a real minus sign. */
export function signedPct(pct: number, digits = 1): string {
  if (!Number.isFinite(pct)) return "—";
  const rounded = Math.abs(pct) < 0.5 * 10 ** -digits ? 0 : pct;
  return `${rounded > 0 ? "+" : rounded < 0 ? "−" : ""}${Math.abs(rounded).toFixed(digits)}%`;
}

export function edgeTone(pct: number): string {
  if (!Number.isFinite(pct) || Math.abs(pct) < 0.05) return "v2-muted";
  return pct > 0 ? "v2-up" : "v2-down";
}

/** "1,042" (or "1,042.5" below 100). */
export function formatChog(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: Math.abs(value) < 100 ? 1 : 0 }).format(value);
}

/** Fees are small: one decimal (two below 1 $CHOG). */
export function formatFee(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const digits = Math.abs(value) < 1 ? 2 : 1;
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

/** WMON per $CHOG: tiny fractions, so significant digits. */
export function formatPrice(value: number): string {
  return Number.isFinite(value) && value > 0
    ? new Intl.NumberFormat("en-US", { maximumSignificantDigits: 4 }).format(value)
    : "—";
}

const DAY_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const HOUR_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});

/** "Sep 30" (UTC) from epoch ms. */
export const formatDay = (ms: number) => (Number.isFinite(ms) ? DAY_FMT.format(ms) : "—");
/** "Sep 30, 14:00 UTC" from epoch ms. */
export const formatHour = (ms: number) => (Number.isFinite(ms) ? `${HOUR_FMT.format(ms)} UTC` : "—");

// ---------------------------------------------------------------------------------------------
// Names: a Chog goes by its persona name ("Rocket Ears"), then its marketplace name ("CHOG #1462", which is
// token 1). The token id only shows where a Chog is looked up (the pick form).

/** The number in a metadata name: "CHOG #1462" -> 1462, "CHOG #53 — Blaze" -> 53. */
function metadataNumberOf(name: string): number | null {
  const match = /^CHOG\s*#(\d+)/i.exec(name.trim());
  return match ? Number(match[1]) : null;
}

export type FighterLabel = {
  /** Display name: its persona name ("Rocket Ears") when the engine sends one, else its marketplace name. */
  title: string;
  /** Its marketplace name, "CHOG #1462" ("token 1" when unknown). */
  ids: string;
  /** For buttons and screen readers: "Rocket Ears (CHOG #1462)". */
  spoken: string;
};

/** `metadataIds[id - 1]` is token #id's marketplace number (from the server page; 0 when unknown). */
export function fighterLabel(fighter: Pick<VersusFighter, "tokenId" | "name">, metadataIds?: readonly number[]): FighterLabel {
  const { tokenId } = fighter;
  const name = (fighter.name ?? "").trim();
  const fromName = metadataNumberOf(name);
  const metadataNumber = metadataIds?.[tokenId - 1] || fromName;
  const ids = metadataNumber ? `CHOG #${metadataNumber}` : `token ${tokenId}`;
  const title = name && fromName === null ? name : ids;
  return { title, ids, spoken: title === ids ? title : `${title} (${ids})` };
}

export type ParsedFighter =
  | { kind: "empty" }
  | { kind: "invalid"; message: string }
  | {
      kind: "ok";
      tokenId: number;
      /** How the text was read: a token id ("7") or a metadata name ("CHOG #1462"). */
      via: "token" | "name";
      /** The other reading of the same number, when it names another Chog, and how to offer it. */
      alternative?: { tokenId: number; hint: string };
    };

/**
 * A fighter input, read like every Chog field (lib/chog-id.ts parseChogQuery): "7" or "token 7" is token #7; "CHOG
 * #1462" or "#1462" (the way marketplaces abbreviate it) is the Chog whose metadata name carries 1462. Either way the
 * other reading is offered when it names another Chog.
 */
export function parseFighterInput(raw: string, metadataIds: readonly number[]): ParsedFighter {
  const query = parseChogQuery(raw, metadataIds, VERSUS_CHOG_COUNT);
  if (query.kind === "empty") return { kind: "empty" };
  if (query.kind === "invalid") return { kind: "invalid", message: query.message };
  const other = query.other;
  return {
    kind: "ok",
    tokenId: query.tokenId,
    via: query.via,
    ...(other && {
      alternative: {
        tokenId: other.tokenId,
        hint:
          other.via === "name"
            ? `Meant CHOG #${other.nameNumber}? That's token ${other.tokenId} →`
            : `Meant token ${other.tokenId}, not CHOG #${query.nameNumber}? Use it →`,
      },
    }),
  };
}

// ---------------------------------------------------------------------------------------------
// House style for engine text shown here: exhibition language, never wagering words. The genome's own words
// are already trading words (lib/dna/genome.ts: "Big trades", "I trade the other way"); this is a safety net
// for any engine text that slips one in.

export function tasteText(text: string): string {
  return text
    .replace(/\bI bet\b/g, "I go")
    .replace(/\b(Royal|Standard|Big|Small) bets\b/gi, "$1 size")
    .replace(/\bbetting\b/gi, "going")
    .replace(/\bbets?\b/gi, "call")
    .replace(/\bwager(?:s|ed|ing)?\b/gi, "pick")
    .replace(/\bpayouts?\b/gi, "points")
    .replace(/\bodds\b/gi, "chances");
}

// ---------------------------------------------------------------------------------------------
// Genome lines for the tale of the tape

/**
 * One line from a genome, in plain words: its signal gene's explanation without the lead-in that
 * names the trait ("Laser eyes: it chases…" -> "It chases…"). Flagged trait values are scrubbed.
 */
export function genomeLine(genome: Genome | undefined): string | null {
  const gene = genome?.genes.find((g) => g.key === "signal") ?? genome?.genes[0];
  if (!gene) return null;
  const text = gene.explanation.trim();
  const cut = text.indexOf(": ");
  const rest = cut > 0 && cut <= 60 ? text.slice(cut + 2) : text;
  const line = rest.charAt(0).toUpperCase() + rest.slice(1);
  return tasteText(scrubTraitText(line));
}

/** The gene rows of the tape, in the genome's display order (labels and short values only). */
export function tapeRows(a: Genome | undefined, b: Genome | undefined): { key: string; label: string; a?: string; b?: string }[] {
  const keys: { key: string; label: string }[] = [];
  for (const genome of [a, b]) {
    for (const gene of genome?.genes ?? []) {
      if (!keys.some((k) => k.key === gene.key)) keys.push({ key: gene.key, label: gene.label });
    }
  }
  const display = (genome: Genome | undefined, key: string) => {
    const text = genome?.genes.find((g) => g.key === key)?.display;
    return text === undefined ? undefined : tasteText(text);
  };
  return keys.map(({ key, label }) => ({ key, label, a: display(a, key), b: display(b, key) }));
}

// ---------------------------------------------------------------------------------------------
// The race

/** A frame field interpolated at a fractional position (frames are hourly, 0-based). */
export function frameAt(frames: readonly VersusFrame[], pos: number, field: "a" | "b" | "priceIndex"): number {
  if (frames.length === 0) return 0;
  const clamped = Math.max(0, Math.min(frames.length - 1, pos));
  const i = Math.floor(clamped);
  const k = clamped - i;
  const lo = frames[i][field];
  const hi = frames[Math.min(frames.length - 1, i + 1)][field];
  return lo + (hi - lo) * k;
}

/** Epoch ms of frame `pos` once the window is revealed (frames are spread evenly from `from` to `to`). */
export function frameTime(bout: Pick<VersusBout, "frames" | "reveal">, pos: number): number {
  const from = Date.parse(bout.reveal.from);
  const to = Date.parse(bout.reveal.to);
  const steps = Math.max(1, bout.frames.length - 1);
  return from + ((to - from) * pos) / steps;
}

/** Hours the bout covers (48 for a standard bout). */
export const boutHours = (bout: Pick<VersusBout, "frames">) => Math.max(1, bout.frames.length - 1);

export type BoutLine = { i: number; side: Side; text: string; kind: "moment" | "trade"; tradeSide?: "buy" | "sell" };

/** What each fighter says during the race: its key moments, plus its trades' reasons where it has no moment. */
export function boutLines(bout: Pick<VersusBout, "moments" | "trades">): BoutLine[] {
  const lines: BoutLine[] = bout.moments
    .filter((m) => m.text?.trim())
    .map((m) => ({ i: m.i, side: m.fighter, text: tasteText(m.text.trim()), kind: "moment" as const }));
  for (const trade of bout.trades) {
    if (!trade.reason?.trim()) continue;
    if (lines.some((line) => line.side === trade.fighter && Math.abs(line.i - trade.i) < 1)) continue;
    lines.push({ i: trade.i, side: trade.fighter, text: tasteText(trade.reason.trim()), kind: "trade", tradeSide: trade.side });
  }
  return lines.sort((x, y) => x.i - y.i);
}

/** The KO line, e.g. "Rocket Ears stacks more $CHOG: +4.2% vs −1.3% against holding." */
export function koLine(bout: Pick<VersusBout, "result">, labels: Record<Side, FighterLabel>): string {
  const { winner, aEdgePct, bEdgePct } = bout.result;
  if (winner === "draw") return `Dead heat: both end ${signedPct(aEdgePct)} against holding.`;
  const loser = otherSide(winner);
  const edge = { a: aEdgePct, b: bEdgePct };
  return `${labels[winner].title} stacks more $CHOG: ${signedPct(edge[winner])} vs ${signedPct(edge[loser])} against holding.`;
}
