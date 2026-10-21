import { getAddress, isAddress } from "viem";
import { rateLimit } from "@/lib/bell/http";
import { appConfig } from "@/lib/config";
import {
  type OptOutChallenge,
  OptOutError,
  type OptOutList,
  type OptOutStatus,
  applyOptOut,
  issueOptOutMessage,
  listHidden,
  parseOptOutTokenId,
  readOptOut,
  verifyOptOut,
} from "@/lib/optout";

// "Hide my Chog" (lib/optout.ts). Every response is JSON; errors are { error } with a 4xx/5xx status.
//   GET  /api/optout                                  -> OptOutList (every hidden Chog; CDN-cached 15 s)
//   GET  /api/optout?tokenId=7                        -> OptOutStatus { tokenId, hidden, since }
//   GET  /api/optout?tokenId=7&action=hide&owner=0x…  -> OptOutChallenge: the status plus the exact message to sign
//   POST /api/optout { tokenId, owner, message, signature } -> OptOutStatus (owner-signed, verified on-chain)

const NO_STORE: HeadersInit = { "Cache-Control": "private, no-store" };
const LIST_CACHE: HeadersInit = { "Cache-Control": "public, max-age=0, s-maxage=15, stale-while-revalidate=60" };

function fail(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: NO_STORE });
}

const badTokenId = () =>
  fail(400, `tokenId must be a Chog token id (${appConfig.tokenIdRange.min}-${appConfig.tokenIdRange.max}).`);

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const rawId = params.get("tokenId");
  try {
    if (rawId === null) return Response.json((await listHidden()) satisfies OptOutList, { headers: LIST_CACHE });
    const tokenId = parseOptOutTokenId(rawId);
    if (tokenId === null) return badTokenId();

    const action = params.get("action");
    const owner = params.get("owner");
    if (action === null && owner === null) {
      return Response.json((await readOptOut(tokenId)) satisfies OptOutStatus, { headers: NO_STORE });
    }
    if (action !== "hide" && action !== "show") return fail(400, "action must be hide or show.");
    if (!owner || !isAddress(owner, { strict: false })) return fail(400, "owner must be the holder's wallet address.");
    const status = await readOptOut(tokenId);
    const { message, expiresAt } = issueOptOutMessage({ tokenId, action, owner: getAddress(owner) });
    return Response.json({ ...status, action, message, expiresAt } satisfies OptOutChallenge, { headers: NO_STORE });
  } catch (error) {
    console.error("[animr] /api/optout:", error);
    return fail(500, "Couldn't read the hidden Chogs. Try again in a moment.");
  }
}

export async function POST(request: Request) {
  // Each attempt costs RPC reads (the holder, a smart-wallet signature check) even when the signature is bad.
  const limited = await rateLimit(request, "optout", 10);
  if (limited) return limited;
  // JSON only: a plain HTML form can't post here from another site.
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return fail(415, "Send a JSON body (Content-Type: application/json).");
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Expected a JSON body { tokenId, owner, message, signature }.");
  }

  try {
    const check = await verifyOptOut(body);
    if (!check.ok) return fail(check.status, check.error);
    return Response.json((await applyOptOut(check.optOut)) satisfies OptOutStatus, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof OptOutError) return fail(error.status, error.message);
    console.error("[animr] /api/optout:", error);
    return fail(500, "Couldn't save that. Try again in a moment.");
  }
}
