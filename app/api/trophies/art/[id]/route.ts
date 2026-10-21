import { trophyImageSvg } from "@/lib/trophies/art";
import { parseTrophyId, trophyInfo } from "@/lib/trophies/config";

/** The badge image of a trophy kind (the ERC-1155 metadata `image`), as SVG. */
export async function GET(_request: Request, ctx: RouteContext<"/api/trophies/art/[id]">) {
  const kind = parseTrophyId((await ctx.params).id.replace(/\.svg$/i, ""));
  if (kind === null || !trophyInfo(kind)) return Response.json({ error: "Unknown trophy." }, { status: 404 });
  return new Response(trophyImageSvg(kind), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=604800",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}
