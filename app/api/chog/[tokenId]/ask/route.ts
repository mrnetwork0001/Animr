import { AskError, askChog } from "@/lib/chog-chat/service";
import type { AskResponse } from "@/lib/chog-chat/types";
import { HeistError } from "@/lib/heist/service";
import { PRIVATE_HEADERS, clientIp, jsonBody } from "@/lib/heist/http";

/**
 * "Ask this Chog". Body { sessionId?, message, viewer? }: one question to the Chog's AI (0G Compute, else quick
 * answers from its stats). Read-only: it answers in text and can't trade, sign or move anything.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/chog/[tokenId]/ask">) {
  const raw = (await ctx.params).tokenId;
  const tokenId = /^\d{1,5}$/.test(raw) ? Number(raw) : Number.NaN;
  if (!(tokenId >= 1 && tokenId <= 1969)) return error("Chog token ids run from 1 to 1969.", 404);
  try {
    const body = await jsonBody(request);
    const response = await askChog({
      tokenId,
      ip: clientIp(request),
      sessionId: body.sessionId,
      message: body.message,
      viewer: body.viewer,
    });
    return Response.json(response satisfies AskResponse, { headers: PRIVATE_HEADERS });
  } catch (e) {
    if (e instanceof AskError) return error(e.message, e.status, e.retryAfter);
    if (e instanceof HeistError) return error(e.message, e.status);
    console.error("[animr] chog-chat:", e);
    return error("This Chog lost its train of thought. Try again.", 500);
  }
}

function error(message: string, status: number, retryAfter?: number): Response {
  return Response.json(
    { error: message },
    { status, headers: { ...PRIVATE_HEADERS, ...(retryAfter !== undefined && { "Retry-After": String(retryAfter) }) } },
  );
}
