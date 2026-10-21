import { connection } from "next/server";
import { PRIVATE_HEADERS, clientIp, errorResponse, isHeistAdmin, jsonBody } from "@/lib/heist/http";
import {
  HeistError,
  listHallOfFame,
  listHallOfFameForAdmin,
  removeHallOfFame,
  reviewHallOfFame,
  submitHallOfFame,
} from "@/lib/heist/service";
import { hashIp, hitLimit } from "@/lib/heist/store";
import type { AdminHallOfFameEntry, HallOfFameEntry } from "@/lib/heist/types";

/**
 * The newest AIs that caved: their own replies (redacted; an LLM-written one only once a moderator approved it) and
 * the con artists' sanitized nicknames. With the admin bearer: every kept entry, held replies included.
 */
export async function GET(request: Request) {
  await connection();
  try {
    if (isHeistAdmin(request)) {
      return Response.json({ entries: await listHallOfFameForAdmin() } satisfies { entries: AdminHallOfFameEntry[] }, {
        headers: PRIVATE_HEADERS,
      });
    }
    const limited = await hitLimit("hof-read", hashIp(clientIp(request)), 60, 60_000);
    if (limited) throw new HeistError("Too many requests. Try again in a minute.", 429, limited);
    return Response.json({ entries: await listHallOfFame() } satisfies { entries: HallOfFameEntry[] }, {
      headers: PRIVATE_HEADERS,
    });
  } catch (error) {
    return errorResponse(error, "Couldn't load the Hall of Fame.");
  }
}

/** Body { sessionId, nickname }: puts that session's caving reply on the wall (never the visitor's words). */
export async function POST(request: Request) {
  try {
    const body = await jsonBody(request);
    const entry = await submitHallOfFame({ ip: clientIp(request), sessionId: body.sessionId, nickname: body.nickname });
    return Response.json({ entry } satisfies { entry: HallOfFameEntry }, { status: 201, headers: PRIVATE_HEADERS });
  } catch (error) {
    return errorResponse(error, "Couldn't put that on the wall.");
  }
}

/** Moderation. Body { id, approved }, Authorization: Bearer $HEIST_ADMIN_SECRET: shows or holds an LLM's reply. */
export async function PATCH(request: Request) {
  try {
    if (!isHeistAdmin(request)) throw new HeistError("Not allowed.", 403);
    const body = await jsonBody(request);
    if (typeof body.id !== "string" || !body.id || typeof body.approved !== "boolean") {
      throw new HeistError("Send a JSON body { id, approved }.");
    }
    return Response.json({ updated: await reviewHallOfFame(body.id, body.approved) }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    return errorResponse(error, "Couldn't update that entry.");
  }
}

/** Moderation. Body { id }, Authorization: Bearer $HEIST_ADMIN_SECRET. */
export async function DELETE(request: Request) {
  try {
    if (!isHeistAdmin(request)) throw new HeistError("Not allowed.", 403);
    const body = await jsonBody(request);
    if (typeof body.id !== "string" || !body.id) throw new HeistError("Send a JSON body { id }.");
    return Response.json({ removed: await removeHallOfFame(body.id) }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    return errorResponse(error, "Couldn't remove that entry.");
  }
}
