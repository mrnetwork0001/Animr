import { PRIVATE_HEADERS, clientIp, errorResponse, jsonBody } from "@/lib/heist/http";
import { actAsAi } from "@/lib/heist/service";
import type { ProofResponse } from "@/lib/heist/types";

/**
 * "Act as the AI". JSON body { recipient? } ({} for the demo address): simulates the House Chog's AI key sending the
 * whole vault to the recipient against Monad mainnet at the latest block. Read-only: nothing is ever broadcast. A JSON
 * body is required, so a cross-site form post can't spend the proof budget.
 */
export async function POST(request: Request) {
  try {
    const body = await jsonBody(request);
    const response = await actAsAi({ ip: clientIp(request), recipient: body.recipient });
    return Response.json(response satisfies ProofResponse, { headers: PRIVATE_HEADERS });
  } catch (error) {
    return errorResponse(error, "Couldn't run the check. Try again.");
  }
}
