import { PRIVATE_HEADERS, clientIp, errorResponse, jsonBody } from "@/lib/heist/http";
import { chatTurn } from "@/lib/heist/service";
import type { ChatResponse } from "@/lib/heist/types";

/**
 * Body { sessionId?, message, recipient? }: one message to the House Chog's defender (no sessionId starts a new
 * heist). When it agrees to send $CHOG, the response carries the mainnet simulation (proof). Nothing is broadcast.
 */
export async function POST(request: Request) {
  try {
    const body = await jsonBody(request);
    const response = await chatTurn({
      ip: clientIp(request),
      sessionId: body.sessionId,
      message: body.message,
      recipient: body.recipient,
    });
    return Response.json(response satisfies ChatResponse, { headers: PRIVATE_HEADERS });
  } catch (error) {
    return errorResponse(error, "The House Chog lost its train of thought. Try again.");
  }
}
