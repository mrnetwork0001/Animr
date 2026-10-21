import { connection } from "next/server";
import { fanIdentity, rateLimit } from "@/lib/bell/http";
import { getVersusRecord } from "@/lib/rewind/picks";
import type { VersusRecord } from "@/lib/rewind/types";
import { LIMITS, NO_STORE, json, versusErrorResponse } from "../http";

/** The cookie fan's VERSUS record (zeros before a first pick; the first visit sets the animr_fan cookie). */
export async function GET(request: Request) {
  await connection();
  const limited = await rateLimit(request, "versus-view", LIMITS.view);
  if (limited) return limited;
  try {
    return json((await getVersusRecord(await fanIdentity())) satisfies VersusRecord, NO_STORE);
  } catch (error) {
    return versusErrorResponse(error, "Couldn't load your VERSUS record.");
  }
}
