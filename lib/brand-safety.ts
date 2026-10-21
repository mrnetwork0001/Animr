import data from "@/data/brand-safety.json";

// Brand safety for Chog Genesis trait values. Some values in the frozen collection metadata are
// slurs or sexual slang (the "Retard" eyes, the slogan caps and tees). data/brand-safety.json
// classifies every distinct (trait_type, value) pair of the 1,969 Chogs:
//   ok     - shown and sent to the LLM as is
//   rename - shown and sent only under its neutral `display` name
//   hide   - never shown or sent (safeTraits drops it)
// A value missing from the list (never the case for the frozen snapshot) is checked against a
// deny-list and hidden when it matches, so the filter fails closed.
//
// Apply it wherever a trait value becomes text: trait chips, gene explanations, Trait Alpha rows,
// OG cards, alt text and LLM prompts. Keep deriving genomes, seeds and persona names from the RAW
// traits: the gene table and the trait seed read raw values, and GENOME_VERSION must not move.
// Keep FLAGGED_TOKEN_IDS out of Random Chog, featured slots and the video: their art still shows
// the words.
//
// Pure and synchronous, with no Node APIs: safe in server and client components (~4 KB gzipped).
//
// After changing an entry's action, refresh flaggedTokenIds (run from the repo root):
//   node -e 'const fs=require("fs"),f="data/brand-safety.json",s=JSON.parse(fs.readFileSync(f,"utf8")),bad=new Set(s.values.filter(v=>v.action!=="ok").map(v=>v.type+"|"+v.value));s.flaggedTokenIds=require("./data/chogs.json").chogs.filter(c=>Object.entries(c.traits).some(([t,v])=>bad.has(t+"|"+v))).map(c=>c.id);fs.writeFileSync(f,JSON.stringify(s,null,1)+"\n")'

export type TraitSafetyAction = "ok" | "rename" | "hide";

/** One row of data/brand-safety.json. */
export type TraitSafetyEntry = {
  type: string;
  value: string;
  action: TraitSafetyAction;
  /** The neutral name shown and sent instead of `value` (rename only). */
  display?: string;
  /** Why; for maintainers only, never display it. */
  reason: string;
};

/** data/brand-safety.json */
export type BrandSafetyFile = {
  version: number;
  values: TraitSafetyEntry[];
  /** Token IDs (1-1969, not metadata numbers) of Chogs carrying any rename/hide value. */
  flaggedTokenIds: number[];
};

export type TraitVerdict = {
  action: TraitSafetyAction;
  /** What to show: the value itself (ok), its neutral name (rename) or HIDDEN_TRAIT_LABEL (hide). */
  display: string;
  /** False when the pair is not in data/brand-safety.json and the fallback deny-list decided. */
  listed: boolean;
};

const file = data as unknown as BrandSafetyFile;

export const BRAND_SAFETY_VERSION: number = file.version;

/** Shown where a hidden value must still render as one value; prefer dropping it (safeTraits). */
export const HIDDEN_TRAIT_LABEL = "Hidden";

const SEVERITY: Record<TraitSafetyAction, number> = { ok: 0, rename: 1, hide: 2 };

type Rule = { action: TraitSafetyAction; display?: string };

const str = (input: unknown): string => (typeof input === "string" ? input : input == null ? "" : String(input));

/** Case-, width- and whitespace-insensitive form used for lookups. */
function fold(text: string): string {
  return text.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

/** A malformed entry (unknown action, rename without a name) fails closed: hidden. */
function ruleOf(entry: TraitSafetyEntry): Rule {
  if (entry.action === "ok") return { action: "ok" };
  const display = typeof entry.display === "string" ? entry.display.trim() : "";
  if (entry.action === "rename" && display) return { action: "rename", display };
  return { action: "hide" };
}

const exact = new Map<string, Rule>();
const folded = new Map<string, Rule>();
for (const entry of Array.isArray(file.values) ? file.values : []) {
  if (!entry || typeof entry.type !== "string" || typeof entry.value !== "string") continue;
  const rule = ruleOf(entry);
  exact.set(`${entry.type}\u0000${entry.value}`, rule);
  const key = `${fold(entry.type)}\u0000${fold(entry.value)}`;
  const prev = folded.get(key);
  // Two spellings that fold together ("Boob Cap", "BOOB Cap"): the stricter rule wins.
  if (!prev || SEVERITY[rule.action] > SEVERITY[prev.action]) folded.set(key, rule);
}

/** Chogs whose traits include a renamed or hidden value. Keep them out of featured slots. */
export const FLAGGED_TOKEN_IDS: ReadonlySet<number> = new Set(
  (Array.isArray(file.flaggedTokenIds) ? file.flaggedTokenIds : []).filter((id) => Number.isInteger(id)),
);

// --- Fallback deny-list ---------------------------------------------------------------------------
// Only consulted for values outside data/brand-safety.json, and by hasBlockedTerm(). Whole words,
// after folding case, accents and digit/symbol look-alikes inside words ("r3tard").
const BLOCKED_TERMS = [
  // ableist
  "retard(?:s|ed|io|ation)?", "tards?", "spaz(?:zy|zes)?", "spastics?", "mongs?", "mongoloids?",
  // racial and ethnic
  "nigg(?:a|ah|as|az|er|ers|uh)", "chinks?", "gooks?", "spics?", "spiks?", "wetbacks?", "kikes?", "beaners?",
  "coons?", "pakis?", "ragheads?", "towelheads?", "japs?", "redskins?", "squaws?",
  // homophobic and transphobic
  "fags?", "faggots?", "faggy", "dykes?", "trann(?:y|ies)", "shemales?",
  // misogynistic and sexual
  "sluts?", "slutty", "whores?", "thots?", "hoes?", "bitch(?:es|y)?", "cunts?", "milfs?", "dilfs?", "gilfs?",
  "porn\\w*", "nsfw", "sex", "sexy", "sexual", "nudes?", "nudity", "boob(?:s|ies)?", "tits", "titty", "titties",
  "dicks?", "cocks?", "puss(?:y|ies)", "penis(?:es)?", "vaginas?", "boners?", "horny", "cum(?:shot|ming)?",
  "orgasms?", "dildos?", "hentai", "anal", "bbc", "virgins?", "rap(?:e|ed|es|ist|ists)", "pedos?",
  "p(?:a?e)dophil(?:e|es|ia)", "incest",
  // hate
  "nazis?", "hitler", "swastikas?", "kkk", "heil",
];
const BLOCKED = new RegExp(`\\b(?:${BLOCKED_TERMS.join("|")})\\b`, "i");

const LOOK_ALIKES: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s" };

function foldForMatch(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/₿/g, "b")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/[a-z0-9@$]+/g, (word) => (/[a-z]/.test(word) ? word.replace(/[013457@$]/g, (c) => LOOK_ALIKES[c]) : word));
}

/** True when free text contains a slur or sexual term from the fallback deny-list (e.g. AI output). */
export function hasBlockedTerm(text: string): boolean {
  return BLOCKED.test(foldForMatch(str(text)));
}

// --- Lookups --------------------------------------------------------------------------------------

function ruleFor(type: string, value: string): { rule: Rule; listed: boolean } {
  const listed = exact.get(`${type}\u0000${value}`) ?? folded.get(`${fold(type)}\u0000${fold(value)}`);
  if (listed) return { rule: listed, listed: true };
  return { rule: { action: hasBlockedTerm(value) ? "hide" : "ok" }, listed: false };
}

/** The full verdict for one trait value: action, what to display, and whether the list decided. */
export function traitSafety(type: string, value: string): TraitVerdict {
  const raw = str(value);
  const { rule, listed } = ruleFor(str(type), raw);
  const display = rule.action === "ok" ? raw : rule.action === "rename" && rule.display ? rule.display : HIDDEN_TRAIT_LABEL;
  return { action: rule.action, display, listed };
}

/** True when the value must not be shown or sent as is (renamed or hidden). */
export function isFlaggedTraitValue(type: string, value: string): boolean {
  return ruleFor(str(type), str(value)).rule.action !== "ok";
}

/** The text to show for a trait value: itself, its neutral name, or HIDDEN_TRAIT_LABEL. */
export function displayTraitValue(type: string, value: string): string {
  return traitSafety(type, value).display;
}

/**
 * A copy of a trait map that is safe to show or send to an LLM: renamed values replaced by their
 * neutral names, hidden values removed, key order kept. Idempotent.
 */
export function safeTraits(traits: Readonly<Record<string, string>> | null | undefined): Record<string, string> {
  const pairs: [string, string][] = [];
  for (const [type, value] of Object.entries(traits ?? {})) {
    const verdict = traitSafety(type, value);
    if (verdict.action !== "hide") pairs.push([type, verdict.display]);
  }
  return Object.fromEntries(pairs);
}

/** True when any of the Chog's trait values is renamed or hidden. */
export function isFlaggedChog(traits: Readonly<Record<string, string>> | null | undefined): boolean {
  return Object.entries(traits ?? {}).some(([type, value]) => isFlaggedTraitValue(type, value));
}

/** FLAGGED_TOKEN_IDS.has() for a token ID in any common form (number, numeric string, bigint). */
export function isFlaggedTokenId(tokenId: number | string | bigint): boolean {
  const id = typeof tokenId === "number" ? tokenId : Number(str(tokenId).trim() || NaN);
  return Number.isInteger(id) && FLAGGED_TOKEN_IDS.has(id);
}

// --- Text built from trait values -----------------------------------------------------------------

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Flagged raw values, longest first so "Blue Retard" is replaced before "Retard". */
const SCRUBS: { re: RegExp; display: string }[] = (() => {
  const byValue = new Map<string, string>();
  for (const entry of Array.isArray(file.values) ? file.values : []) {
    if (!entry || typeof entry.value !== "string" || !entry.value.trim()) continue;
    const rule = ruleOf(entry);
    if (rule.action === "ok") continue;
    const value = fold(entry.value);
    if (!byValue.has(value)) byValue.set(value, rule.action === "rename" && rule.display ? rule.display : "");
  }
  return [...byValue.entries()]
    .sort((a, b) => b[0].length - a[0].length)
    .map(([value, display]) => ({
      re: new RegExp(`(^|[^0-9A-Za-z])${escapeRegExp(value).replace(/ /g, "\\s+")}(?=$|[^0-9A-Za-z])`, "gi"),
      display,
    }));
})();

/**
 * Replaces every flagged trait value inside free text with its neutral name (hidden ones are
 * dropped), e.g. a gene explanation "Retard eyes: it trades on vibes" -> "Googly eyes: ...".
 * Use it on text already built from raw traits (gene explanations, stored AI thoughts).
 */
export function scrubTraitText(text: string): string {
  let out = str(text);
  let hid = false;
  for (const { re, display } of SCRUBS) {
    out = out.replace(re, (_match, lead: string) => {
      if (!display) hid = true;
      return `${lead}${display}`;
    });
  }
  return hid ? out.replace(/[ \t]{2,}/g, " ").replace(/ +([.,:;!?])/g, "$1").trim() : out;
}
