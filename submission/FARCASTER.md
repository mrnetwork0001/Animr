# Animr as a Farcaster Mini App

When someone casts an Animr link, Farcaster clients (Warpcast and others) show today's Daily Bell card with a
**Ride a Chog** button. The button opens `/bell` inside the client.

## What ships in the code

| Piece | Where | Notes |
|---|---|---|
| Embed tags `fc:miniapp` (action `launch_miniapp`) and legacy `fc:frame` (action `launch_frame`) | `app/layout.tsx` metadata `other`, built by `lib/farcaster/embed.ts` `miniAppEmbed()` | Site-wide default: today's Bell card, "Ride a Chog", opens `/bell`. A page can set its own `other: miniAppEmbed({...})` to override it. |
| 3:2 embed image (1200x800 PNG) | `app/api/farcaster/embed-image/route.tsx` | The /bell share card (`lib/og/cards.tsx` BellCard) built from real Bell data. Before the first Bell it shows the plain Daily Bell card with no numbers. Cached 5 min, or 30 s for the no-Bell card. |
| Manifest | `app/.well-known/farcaster.json/route.ts` | Reads `FARCASTER_HEADER` / `FARCASTER_PAYLOAD` / `FARCASTER_SIGNATURE` at request time. URLs come from `NEXT_PUBLIC_SITE_URL`, falling back to Vercel's production domain. |
| Icon (1024x1024 PNG, no alpha) and splash (200x200) | `public/farcaster/icon.png`, `public/farcaster/splash.png` | The Animr mark. The splash background is `#0E0B1E`. |
| Splash dismissal | `components/farcaster/miniapp-ready.tsx`, mounted in the root layout | Calls `sdk.actions.ready()` only inside a Mini App. Normal visitors download a ~1 KB loader stub and never fetch the SDK. |
| Wallet | Same component | Loading the SDK makes Farcaster announce its wallet over EIP-6963, so wagmi's injected discovery lists it in the connect menu. No extra connector package is needed. |

## Owner steps (after the production deploy)

1. Set `NEXT_PUBLIC_SITE_URL` to the production origin, for example `https://animr.xyz`. It must be the exact
   domain you sign in step 3. Without it, URLs fall back to `VERCEL_PROJECT_PRODUCTION_URL`.
2. Deploy, then check `https://<domain>/.well-known/farcaster.json`. It should return JSON with a `miniapp`
   block whose URLs all use that domain.
3. Open the Mini App Manifest Tool in Warpcast at `https://farcaster.xyz/~/developers/new`. On the web,
   the developer tools are at `https://farcaster.xyz/~/developers/mini-apps/manifest`. Enable Developer
   Mode in Warpcast settings first if the tools don't show up. Enter the bare production domain
   (`animr.xyz`, with no `https://` and no path). Then **sign the account association** with your Farcaster
   account.
4. Copy the three values it produces into Vercel → Project → Settings → Environment Variables (Production):
   - `FARCASTER_HEADER`: the `header` string (secret-ish, server only)
   - `FARCASTER_PAYLOAD`: the `payload` string (server only)
   - `FARCASTER_SIGNATURE`: the `signature` string (server only)
5. Redeploy. Reload the Manifest tool and confirm it shows the account association as verified.
6. Test with the **Mini App Embed tool** in the same developer tools, usually at
   `https://farcaster.xyz/~/developers/mini-apps/embed`. Paste `https://<domain>/bell`. It should show
   the 3:2 Bell card, a "Ride a Chog" button, and a launch that opens /bell with the splash disappearing.
   Repeat for `/` and a Chog page.
7. Cast `https://<domain>/bell` from your account. Clients scrape a cast's embed once and keep it. Farcaster
   may also cache the manifest for up to 24 hours, so after changing a value, use the tool's refresh.

## Verify locally

```sh
curl -s localhost:3000/.well-known/farcaster.json | python3 -m json.tool   # manifest shape
curl -s localhost:3000/bell | grep -o 'name="fc:[a-z]*"'                  # fc:miniapp + fc:frame
curl -s -o /tmp/embed.png -w '%{http_code} %{content_type}\n' localhost:3000/api/farcaster/embed-image
```

## Known limits

- Pages with an async `generateMetadata` (for example `/chog/[tokenId]`) stream their metadata. A client
  that isn't on Next's known-bot list then gets the `fc:*` tags inside `<body>` instead of `<head>`. The tags
  are still in the raw HTML, and the usual scrapers read them there. `/bell`, `/` and the static pages keep
  them in `<head>`.
- Whether Farcaster's wallet can sign on Monad (chain 143) depends on the client. Reading data works either
  way. No trade is ever broadcast from the Mini App without the user's own approval in their wallet.
- The embed card shows the latest real Bell. Until the first Bell rings on a fresh store, it shows the no-number
  Daily Bell card.
