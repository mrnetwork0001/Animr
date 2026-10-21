import { rideBell } from "@/lib/bell/fans";
import { PRIVATE_HEADERS, errorResponse, fanIdentity, jsonBody, newFanLimit, rateLimit } from "@/lib/bell/http";
import type { FanResponse } from "@/lib/bell/types";

/**
 * Body { tokenId }: ride that Chog, one ride per Bell. Inside the open Bell's ride window the ride is on that Bell;
 * after it closes (or before the first live Bell) the ride books the next Bell (FanResponse.next). Never a 409 for
 * a closed window: 409 only means this Bell already has your ride.
 */
export async function POST(request: Request) {
  const limited = await rateLimit(request, "ride", 10);
  if (limited) return limited;
  try {
    const body = await jsonBody(request);
    const raw = body.tokenId;
    const tokenId = typeof raw === "number" ? raw : typeof raw === "string" && /^\d{1,5}$/.test(raw) ? Number(raw) : NaN;
    const fanId = await fanIdentity();
    const capped = await newFanLimit(request, fanId);
    if (capped) return capped;
    return Response.json((await rideBell(fanId, tokenId)) satisfies FanResponse, { headers: PRIVATE_HEADERS });
  } catch (error) {
    return errorResponse(error, "Couldn't take that ride.");
  }
}
