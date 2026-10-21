import { connection } from "next/server";
import { PRIVATE_HEADERS, clientIp, errorResponse } from "@/lib/heist/http";
import { HeistError, getHeistState } from "@/lib/heist/service";
import { hashIp, hitLimit } from "@/lib/heist/store";
import type { HeistState } from "@/lib/heist/types";

/** The heist page's data: the House Chog, its defender, today's counters, the nap state and the Hall of Fame. */
export async function GET(request: Request) {
  await connection();
  try {
    const limited = await hitLimit("state", hashIp(clientIp(request)), 60, 60_000);
    if (limited) throw new HeistError("Too many requests. Try again in a minute.", 429, limited);
    return Response.json((await getHeistState()) satisfies HeistState, { headers: PRIVATE_HEADERS });
  } catch (error) {
    return errorResponse(error, "Couldn't load the heist.");
  }
}
