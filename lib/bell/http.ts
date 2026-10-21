import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getKv } from "../kv";
import { BellError, FAN_COOKIE, FAN_COOKIE_MAX_AGE_S, fanIdFromToken, newFanToken } from "./fans";
import { DAY_MS } from "./rules";
import { readFan } from "./store";

// Helpers for the Bell and fan route handlers (app/api/bell/*, app/api/fan).

/**
 * New fan records per network (an IPv4 address or an IPv6 /64) per day: roomy enough for a judging room or a venue
 * Wi-Fi behind one address, while still capping a script that drops its cookie.
 */
const NEW_FANS_PER_IP_PER_DAY = 100;
const NEW_FANS_MESSAGE = "Too many new fans from this network today. Try another network, or come back tomorrow.";

/** Public Bell data: CDN-cacheable for a short while. */
export function cacheHeaders(seconds: number): HeadersInit {
  return { "Cache-Control": `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=${seconds * 4}` };
}

export const PRIVATE_HEADERS: HeadersInit = { "Cache-Control": "private, no-store" };

export function errorResponse(error: unknown, fallback: string): Response {
  if (error instanceof BellError) return Response.json({ error: error.message }, { status: error.status });
  console.error("[animr] Bell:", error);
  return Response.json({ error: fallback }, { status: 500 });
}

/** The visitor's fan id from the httpOnly animr_fan cookie; a first visit gets a new cookie. */
export async function fanIdentity(): Promise<string> {
  const jar = await cookies();
  const existing = fanIdFromToken(jar.get(FAN_COOKIE)?.value);
  if (existing) return existing;
  const token = newFanToken();
  jar.set(FAN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: FAN_COOKIE_MAX_AGE_S,
  });
  return fanIdFromToken(token) as string;
}

/** An IPv6 address's /64 (one household or server can rotate through all of it); IPv4 as is. */
export function networkOf(ip: string): string | null {
  const value = ip.trim().replace(/^\[|\](:\d+)?$/g, "").replace(/%.*$/, "");
  const v4 = /^(?:::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/i.exec(value);
  if (v4) return v4[1];
  if (!/^[0-9a-f:]+$/i.test(value) || !value.includes(":")) return null;
  const [head, tail = ""] = value.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = value.includes("::") ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right] : left;
  if (groups.length !== 8) return null;
  return `${groups.slice(0, 4).map((group) => (group || "0").toLowerCase().replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

/**
 * Who a rate limit counts: the client's network from the proxy's headers (on Vercel, x-vercel-forwarded-for
 * and x-real-ip are set by the platform and can't be spoofed), else the fan cookie. Never one bucket
 * shared by everyone: a request with neither (a host without a proxy, a first visit) isn't limited.
 */
function clientKey(request: Request): string | null {
  const headers = request.headers;
  const candidates = process.env.VERCEL
    ? [headers.get("x-vercel-forwarded-for"), headers.get("x-real-ip"), headers.get("x-forwarded-for")]
    : [headers.get("x-real-ip"), headers.get("x-forwarded-for")];
  for (const raw of candidates) {
    const network = raw ? networkOf(raw.split(",")[0]) : null;
    if (network) return network;
  }
  const cookie = /(?:^|;\s*)animr_fan=([^;]+)/.exec(headers.get("cookie") ?? "")?.[1];
  return fanIdFromToken(cookie);
}

/**
 * Per-network fixed-window limit: a 429 response once `limit` requests hit `bucket` within `windowMs`, else null.
 * `message` overrides the default "Try again in a minute" (say so when the window is longer). Retry-After always
 * matches the window.
 */
export async function rateLimit(request: Request, bucket: string, limit: number, windowMs = 60_000, message?: string) {
  const who = clientKey(request);
  if (!who) return null;
  const now = Date.now();
  const window = Math.floor(now / windowMs);
  const count = await getKv().incr(`animr:rl:${bucket}:${who}:${window}`, windowMs);
  if (count <= limit) return null;
  const retryAfter = Math.max(1, Math.ceil(((window + 1) * windowMs - now) / 1000));
  return Response.json(
    { error: message ?? "Too many requests. Try again in a minute." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

/** Fan records are stored on a first ride or nickname: cap how many one network (IPv4 or IPv6 /64) creates per day. */
export async function newFanLimit(request: Request, fanId: string) {
  if (await readFan(fanId)) return null;
  return rateLimit(request, "new-fan", NEW_FANS_PER_IP_PER_DAY, DAY_MS, NEW_FANS_MESSAGE);
}

/** JSON request body, or a BellError for anything else (also keeps plain HTML forms out). */
export async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    throw new BellError("Send a JSON body (Content-Type: application/json).", 415);
  }
  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new BellError("Expected a JSON object body.");
  return body as Record<string, unknown>;
}

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; without a secret only `next dev` is let in. */
export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV === "development";
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
