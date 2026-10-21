import { hasBlockedTerm } from "../brand-safety";

// Text hygiene for the heist: what the defender may say, what the Hall of Fame may show, and which nicknames pass.
// Visitors' own words are never stored on the wall; the AI's caving reply is, after these checks (and a reply an LLM
// wrote only shows there once a moderator approves it, see store.ts).
//
// Every check runs on NFKC text with invisible characters removed, on a copy with digit look-alikes folded ("sc4m")
// and on words spelled out letter by letter ("s c a m"). Free LLM output is never rewritten to look clean: a reply
// that fails any check is replaced as a whole by a template line (defender.ts).

/** Gambling vocabulary the app never uses. */
const WAGER = /\b(bets?|betting|bettors?|wager\w*|odds|payouts?|gambl\w*|jackpots?|casinos?|bookies?|parlays?)\b/i;

/** Put-downs the defender must never aim at anyone (it teases the con, never the person). */
const INSULT =
  /\b(idiots?|stupid|dumb|morons?|losers?|pathetic|ugly|trash|garbage|noobs?|fools?|peasants?|brainless|imbeciles?|dumm(?:y|ies)|dorks?|clowns? like you|shut up|get lost|cringe|poor people|brokie)\b/i;

/** Digs at holders and communities, and crypto put-downs a holder reads as one ("never roast holders"). */
const HOLDER_DIG =
  /\b(?:jeets?|ngmi|paper[\s-]*hand(?:s|ed)?|weak[\s-]*hands?|bag[\s-]*holders?|exit[\s-]*liquidity|(?:holders?|communit(?:y|ies)|frens|degens|nads)\s+(?:are|is))\b/i;

/** Self-harm and threats. */
const THREAT = /\b(?:kys|kms|kill\s+(?:your|ur)\s*self|kill\s+yourselves|neck\s+yourself|go\s+die|drop\s+dead)\b/i;

/** Mild profanity (slurs and sexual terms are hasBlockedTerm's job). */
const PROFANITY = /\b(fuck\w*|shit\w*|damn|crap|asshole|bastard|wtf|stfu)\b/i;

/** Brand harm: never call Chog, $CHOG, Monad or anyone's project a scam or dead (and the wall never shows it). */
const BRAND_HARM =
  /\b(scam\w*|rug(?:s|ged|ging)?|rug ?pull\w*|ponzi|fraud\w*|worthless|exit scam|honeypot|to\s+(?:zero|0)|is\s+dead|dead\s+(?:coin|project|chain|token|nft)s?)\b/i;

/** "site.lol", "site dot lol", "site[.]lol", "site (dot) lol", ideographic full stops. */
const DOT = String.raw`(?:\s*[\[(]\s*(?:dot|\.)\s*[\])]\s*|\s+dot\s+|[.。．｡])`;

/** Links, host names (any TLD), emails and @handles: never repeated by the AI, never on the wall. */
const LINK = new RegExp(
  String.raw`https?:|www\.|[\w.+-]+@[\w-]+\.\w+|(?:^|\s)@\w{3,}|\b[a-z0-9][a-z0-9-]*${DOT}[a-z]{2,}(?![a-z0-9])`,
  "i",
);

/** Other tokens' tickers: the defender never shills anything ($CHOG and its MON pair aside). */
const OTHER_TICKER = /\$(?!(?:chog|mon|wmon|usd)s?\b)[a-z][a-z0-9]{1,9}\b/i;

/** Secrets the AI must never ask for or talk about handing over. */
const SECRETS = /\b(private keys?|seed phrases?|mnemonic|recovery phrase|passwords?|secret phrase)\b/i;

/** Claims that tokens already moved, and transaction details: the AI has no keys, the chain decides. */
const SETTLEMENT =
  /\b(?:tx(?:n|id|s)?|(?:transaction|transfer)\s+(?:hash|id|receipt)|hash(?:es)?|(?:block\s*)?explorer|etherscan|monadscan|monadvision|confirmed|confirmations?|sent|transferred|deposited|airdropped|wired|check\s+your\s+wallet|already\s+(?:moved|done|yours|in\s+your\s+wallet))\b|\b0x[0-9a-f]{41,}/i;

const ADDRESS = /0x[0-9a-fA-F]{6,40}\b/g;

/** Zero-width and bidi controls, joiners, variation selectors, Hangul fillers, the braille blank... */
const INVISIBLE = /[\p{Cf}͏ᅟᅠ឴឵⠀ㅤﾠ︀-️\u{E0100}-\u{E01EF}]/gu;

const LOOK_ALIKES: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s" };

/** NFKC, invisible characters removed, control characters turned into spaces. */
export function normalizeText(raw: string): string {
  return raw.normalize("NFKC").replace(INVISIBLE, "").replace(/[\u0000-\u001f\u007f]/g, " ");
}

/** Trims, strips code fences, invisible and control characters, and caps the length. Never changes the words. */
export function cleanReply(raw: string, maxChars: number): string {
  const text = normalizeText(raw.replace(/```[\s\S]*?```/g, " "))
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .trim();
  return truncate(text, maxChars);
}

/** Cuts at a word boundary and adds an ellipsis when over `maxChars`. */
export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > maxChars * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.!?-]+$/, "")}…`;
}

/** The forms of a text every word list is checked against: as is, without accents, digits folded, spelled out. */
function forms(text: string): string[] {
  const plain = normalizeText(text).normalize("NFKD").replace(/\p{M}/gu, "").normalize("NFKC");
  const folded = plain.replace(/[\p{L}\p{N}@$]+/gu, (word) =>
    /\p{L}/u.test(word) ? word.replace(/[013457@$]/g, (c) => LOOK_ALIKES[c] ?? c) : word,
  );
  const spelled = (plain.match(/\b(?:[a-z][\s.\-_*•·]+){2,}[a-z]\b/gi) ?? []).map((run) => run.replace(/[^a-z]/gi, ""));
  return [plain, folded, ...spelled];
}

/** A word mixing Latin with Cyrillic or Greek letters: a look-alike spelling meant to slip past the lists. */
function mixesScripts(text: string): boolean {
  return text
    .split(/\s+/)
    .some((word) => /\p{Script=Latin}/u.test(word) && /[\p{Script=Cyrillic}\p{Script=Greek}]/u.test(word));
}

/** The word-list problem shared by replies and nicknames, or null. */
function wordProblem(text: string): string | null {
  const variants = forms(text);
  const hit = (re: RegExp) => variants.some((variant) => re.test(variant));
  if (variants.some((variant) => hasBlockedTerm(variant))) return "blocked term";
  if (hit(PROFANITY)) return "profanity";
  if (hit(THREAT)) return "threat";
  if (hit(WAGER)) return "wagering language";
  if (hit(INSULT)) return "insult";
  if (hit(HOLDER_DIG)) return "holder put-down";
  if (hit(BRAND_HARM)) return "brand harm";
  if (mixesScripts(normalizeText(text))) return "look-alike spelling";
  return null;
}

/** Why a defender reply can't be shown as is, or null when it's fine. */
export function replyProblem(reply: string): string | null {
  const text = normalizeText(reply);
  if (!text.trim()) return "empty";
  const words = wordProblem(text);
  if (words) return words;
  if (LINK.test(text)) return "link";
  if (OTHER_TICKER.test(text)) return "other ticker";
  if (SECRETS.test(text)) return "secrets";
  if (SETTLEMENT.test(text)) return "settlement claim";
  return null;
}

/** Replaces wallet addresses with a short placeholder (for anything public). */
export function redactAddresses(text: string): string {
  return text.replace(ADDRESS, "0x…");
}

/** The first EVM address in a visitor's message, if any (used as the simulated recipient). */
export function addressIn(text: string): `0x${string}` | null {
  const match = text.match(/\b0x[0-9a-fA-F]{40}\b/);
  return match ? (match[0] as `0x${string}`) : null;
}

const fold = (text: string) =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/**
 * True when the reply repeats a visitor's own words (5+ words in a row, or 24+ letters of one run), so the
 * Hall of Fame can't be used to publish what a visitor typed through the AI.
 */
export function echoesVisitor(reply: string, visitorMessages: string[]): boolean {
  const words = fold(reply).split(" ").filter(Boolean);
  for (const message of visitorMessages) {
    const said = ` ${fold(message)} `;
    if (said.trim().length === 0) continue;
    for (let i = 0; i + 5 <= words.length; i++) {
      if (said.includes(` ${words.slice(i, i + 5).join(" ")} `)) return true;
    }
    for (let i = 0; i < words.length; i++) {
      let run = "";
      for (let j = i; j < words.length; j++) {
        run = run ? `${run} ${words[j]}` : words[j];
        if (run.replace(/ /g, "").length >= 24 && said.includes(` ${run} `)) return true;
        if (!said.includes(` ${run}`)) break;
      }
    }
  }
  return false;
}

/** Why a caving reply can't go on the wall, or null when it can. */
export function wallProblem(reply: string, visitorMessages: string[]): string | null {
  const problem = replyProblem(reply);
  if (problem) return "This reply can't go on the wall.";
  if (echoesVisitor(reply, visitorMessages)) return "It repeats your own words, and the wall only shows the AI's.";
  return null;
}

export const NICKNAME_MAX = 20;

/** Letters, numbers, spaces, "_" and "-", at most 20 characters (same rule as Bell nicknames). */
export function sanitizeNickname(raw: string): string {
  return normalizeText(raw)
    .replace(/<[^>]*>/g, " ")
    .replace(/[^\p{L}\p{N} _-]+/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NICKNAME_MAX)
    .trim();
}

/** Words no nickname may be: the brands and anything that sounds like staff. */
const RESERVED_WORDS = new Set([
  "chog", "chogs", "monad", "nad", "nads", "animr", "chogathon",
  "official", "team", "admin", "admins", "administrator", "mod", "mods", "moderator", "moderators", "support",
  "dev", "devs", "developer", "developers", "staff", "founder", "founders", "cofounder", "ceo", "cto",
  "helpdesk", "security", "verified", "system", "bot",
]);
/** ...nor contain anywhere (also run together: "ChogTeamAdmin"). */
const RESERVED_INSIDE = /official|admin|moderator|support|animr|helpdesk|verified|giveaway|airdrop|claim/;
const BRAND_INSIDE = /chog|monad/;
const STAFF_INSIDE = /team|mod|dev|staff|ceo|founder/;

/** Sounds like Chog, Monad or Animr staff ("Chog team", "Official Monad", "admin", "ChogDev", "0fficial"). */
function impersonates(nickname: string): boolean {
  const words = nickname
    .replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2")
    .toLowerCase()
    .split(/[\s_-]+/)
    .map((word) => word.replace(/[013457]/g, (c) => LOOK_ALIKES[c] ?? c))
    .filter(Boolean);
  const compact = words.join("");
  return (
    words.some((word) => RESERVED_WORDS.has(word)) ||
    RESERVED_INSIDE.test(compact) ||
    (BRAND_INSIDE.test(compact) && STAFF_INSIDE.test(compact))
  );
}

/** A clean nickname, "Anonymous" for an empty one, or null when it isn't acceptable. */
export function moderateNickname(raw: unknown): string | null {
  if (raw === undefined || raw === null) return "Anonymous";
  if (typeof raw !== "string") return null;
  const nickname = sanitizeNickname(raw);
  if (!nickname) return raw.trim() ? null : "Anonymous";
  // Links and tickers first, on the raw text: sanitizing strips their dots and "$".
  const text = normalizeText(raw);
  if (LINK.test(text) || OTHER_TICKER.test(text)) return null;
  if (wordProblem(nickname)) return null;
  if (/0x[0-9a-f]{4,}/i.test(nickname) || impersonates(nickname)) return null;
  return nickname;
}
