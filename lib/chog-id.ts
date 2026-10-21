// Two numbers name every Chog Genesis token: its token id (1-1969: the contract, its ERC-6551 wallet and this app's
// URLs use it) and the number in its metadata name ("CHOG #1462" is token 1: marketplaces and wallets show that one).
// They never coincide in this collection, so every lookup accepts both and shows both: "CHOG #1462 · token 1".
// Pure and dependency-free: safe in server and client components. `nameNumbers[id - 1]` is token `id`'s name number
// (0 when unknown); the server builds it from data/chogs.json (Number(chog.metadataId)).

/** Chog Genesis token ids run 1-1969. */
export const CHOG_SUPPLY = 1969;

/** The number in a metadata name: "CHOG #1462" -> 1462, "CHOG #53 — Blaze" -> 53, anything else -> null. */
export function nameNumberOf(name: string | null | undefined): number | null {
  const match = /^\s*chog\s*#\s*(\d{1,6})\b/i.exec(name ?? "");
  return match ? Number(match[1]) : null;
}

/**
 * "CHOG #1462 · token 1". Pass the metadata name to keep a 1:1's title ("CHOG #53 — Blaze · token 561"); with
 * neither a name nor a name number it is just "token 1".
 */
export function chogLabel(tokenId: number | string, name?: { number?: number | null; metadataName?: string | null }): string {
  const metadataName = name?.metadataName?.trim();
  const title = metadataName && nameNumberOf(metadataName) !== null ? metadataName : name?.number ? `CHOG #${name.number}` : "";
  return title ? `${title} · token ${tokenId}` : `token ${tokenId}`;
}

/** Token id of the Chog whose metadata name carries `n`, or 0. */
export function tokenOfName(n: number, nameNumbers: readonly number[]): number {
  return n > 0 ? nameNumbers.indexOf(n) + 1 : 0;
}

export type ChogQueryHit = {
  tokenId: number;
  /** Its name number (0 when unknown). */
  nameNumber: number;
};

export type ChogQuery =
  | { kind: "empty" }
  | { kind: "invalid"; message: string }
  | (ChogQueryHit & {
      kind: "ok";
      /** How the text was read: as a token id ("1", "token 1") or as a name ("CHOG #1462", "#1462"). */
      via: "token" | "name";
      /** The other reading of the same number, when it names a different Chog. */
      other?: ChogQueryHit & { via: "token" | "name" };
    });

const TOKEN_FORMS = [
  /^(\d{1,6})$/, // "1": a bare number is a token id
  /^(?:token|tokenid|token\s*id|id)\s*[#:]?\s*(\d{1,6})$/i, // "token 1", "token #1", "token id: 1", "id 1"
  /^(\d{1,6})\s*\(\s*(?:token|token\s*id|id)\s*\)$/i, // "1 (token)"
  /^chog\s*#?\s*\d{1,6}(?:\s*[—–-]\s*[^·|]*)?\s*[·|,(]\s*token\s*#?\s*(\d{1,6})\s*\)?$/i, // a pasted "CHOG #1462 · token 1"
];
const NAME_FORMS = [
  /^chog\s*#?\s*(\d{1,6})(?:\s*[—–-].*)?$/i, // "CHOG #1462", "chog 1462", "CHOG #53 — Blaze"
  /^#\s*(\d{1,6})$/, // "#1462", the way marketplaces abbreviate it
  /^(\d{1,6})\s*\(\s*name\s*\)$/i, // "1462 (name)"
  /^name\s*[#:]?\s*(\d{1,6})$/i, // "name 1462"
];

const firstNumber = (forms: readonly RegExp[], text: string): number | null => {
  for (const form of forms) {
    const match = form.exec(text);
    if (match) return Number(match[1]);
  }
  return null;
};

/**
 * A Chog from what someone typed: a token id ("1", "token 1") or a name number ("CHOG #1462", "#1462",
 * "1462 (name)"). A bare number is a token id; `other` offers the name reading when it names a different Chog
 * (and the token reading of a name, likewise).
 */
export function parseChogQuery(raw: string, nameNumbers: readonly number[], supply = CHOG_SUPPLY): ChogQuery {
  const text = raw.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!text) return { kind: "empty" };
  const nameOf = (tokenId: number) => nameNumbers[tokenId - 1] || 0;
  const asToken = (n: number): ChogQueryHit | null => (n >= 1 && n <= supply ? { tokenId: n, nameNumber: nameOf(n) } : null);
  const asName = (n: number): ChogQueryHit | null => {
    const tokenId = tokenOfName(n, nameNumbers);
    return tokenId > 0 ? { tokenId, nameNumber: n } : null;
  };

  const tokenNumber = firstNumber(TOKEN_FORMS, text);
  if (tokenNumber !== null) {
    const hit = asToken(tokenNumber);
    if (!hit) return { kind: "invalid", message: `Token ids run from 1 to ${supply.toLocaleString("en-US")}.` };
    const named = asName(tokenNumber);
    return { kind: "ok", via: "token", ...hit, ...(named && named.tokenId !== hit.tokenId && { other: { ...named, via: "name" } }) };
  }
  const nameNumber = firstNumber(NAME_FORMS, text);
  if (nameNumber !== null) {
    const hit = asName(nameNumber);
    if (!hit) return { kind: "invalid", message: `No Chog is named CHOG #${nameNumber}.` };
    const token = asToken(nameNumber);
    return { kind: "ok", via: "name", ...hit, ...(token && token.tokenId !== hit.tokenId && { other: { ...token, via: "token" } }) };
  }
  return { kind: "invalid", message: `Enter a token ID (1–${supply.toLocaleString("en-US")}) or a marketplace name like CHOG #1462.` };
}

/** The text that looks a hit up again the way it was found: "CHOG #1462" for a name, "1" for a token id. */
export function chogQueryText(hit: ChogQueryHit & { via: "token" | "name" }): string {
  return hit.via === "name" && hit.nameNumber ? `CHOG #${hit.nameNumber}` : String(hit.tokenId);
}
