import { timingSafeEqual } from "node:crypto";
import { heistAdminSecret } from "./config";
import { HeistError } from "./service";

// Helpers for the heist route handlers (app/api/heist/*).

export const PRIVATE_HEADERS: HeadersInit = { "Cache-Control": "private, no-store" };

const MAX_BODY_BYTES = 4_096;

/** The client's address (Vercel sets x-forwarded-for); only ever stored hashed. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

/** A small JSON object body, or a HeistError (also keeps plain HTML form posts out). */
export async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    throw new HeistError("Send a JSON body (Content-Type: application/json).", 415);
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) throw new HeistError("That body is too big.", 413);
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new HeistError("That body is too big.", 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new HeistError("Expected a JSON object body.");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new HeistError("Expected a JSON object body.");
  return body as Record<string, unknown>;
}

export function errorResponse(error: unknown, fallback: string): Response {
  if (error instanceof HeistError) {
    return Response.json(
      { error: error.message },
      {
        status: error.status,
        headers: { ...PRIVATE_HEADERS, ...(error.retryAfter !== undefined && { "Retry-After": String(error.retryAfter) }) },
      },
    );
  }
  console.error("[animr] heist:", error);
  return Response.json({ error: fallback }, { status: 500, headers: PRIVATE_HEADERS });
}

/** `Authorization: Bearer $HEIST_ADMIN_SECRET`; always false while the secret is unset. */
export function isHeistAdmin(request: Request): boolean {
  const secret = heistAdminSecret();
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
