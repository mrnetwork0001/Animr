import { connection } from "next/server";
import { getFan, setNickname } from "@/lib/bell/fans";
import { PRIVATE_HEADERS, errorResponse, fanIdentity, jsonBody, newFanLimit, rateLimit } from "@/lib/bell/http";
import type { FanResponse } from "@/lib/bell/types";

/** The visitor's fan card; the first visit sets the httpOnly animr_fan cookie (no wallet needed). */
export async function GET() {
  await connection();
  try {
    return Response.json((await getFan(await fanIdentity())) satisfies FanResponse, { headers: PRIVATE_HEADERS });
  } catch (error) {
    return errorResponse(error, "Couldn't load your fan card.");
  }
}

/** Body { nickname }: letters, numbers, spaces, _ and -, up to 20 characters ("" clears it). */
export async function POST(request: Request) {
  const limited = await rateLimit(request, "fan", 10);
  if (limited) return limited;
  try {
    const body = await jsonBody(request);
    const fanId = await fanIdentity();
    const capped = await newFanLimit(request, fanId);
    if (capped) return capped;
    return Response.json((await setNickname(fanId, body.nickname)) satisfies FanResponse, { headers: PRIVATE_HEADERS });
  } catch (error) {
    return errorResponse(error, "Couldn't save your nickname.");
  }
}
