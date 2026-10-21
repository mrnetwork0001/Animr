import { parseTrophyId, trophyInfo } from "@/lib/trophies/config";

/**
 * ERC-1155 metadata for AnimrTrophies (uri() = "<site>/api/trophies/meta/{id}"). Clients substitute {id} with the
 * 64-character hex id; a plain decimal id and a ".json" suffix work too.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/trophies/meta/[id]">) {
  const kind = parseTrophyId((await ctx.params).id);
  const info = kind === null ? undefined : trophyInfo(kind);
  if (!info) return Response.json({ error: "Unknown trophy." }, { status: 404 });
  const origin = siteOrigin(request);
  return Response.json(
    {
      name: info.name,
      description: `${info.description} Minted into the Chog's own ERC-6551 wallet, so it moves with the NFT. Non-transferable.`,
      image: `${origin}/api/trophies/art/${info.kind}`,
      external_url: origin,
      attributes: [
        { trait_type: "Awarded", value: info.scope === "daily" ? "At most once per UTC day" : "Once per Chog" },
        { trait_type: "Transferable", value: "No (moves with the Chog)" },
      ],
    },
    { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } },
  );
}

function siteOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  if (configured && /^https?:\/\//.test(configured)) return configured;
  return new URL(request.url).origin;
}
