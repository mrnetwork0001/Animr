import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { MiniAppReady } from "@/components/farcaster/miniapp-ready";
import { meta } from "@/components/landing/content";
import { miniAppEmbed } from "@/lib/farcaster/embed";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Absolute base for og:image and other URL metadata, from NEXT_PUBLIC_SITE_URL (e.g.
 * https://animr.example). Unset or invalid: Next falls back to the Vercel production URL on
 * Vercel, or localhost elsewhere.
 */
function siteUrl(): URL | undefined {
  const raw = process.env.NEXT_PUBLIC_SITE_URL;
  if (!raw) return undefined;
  try {
    return new URL(raw);
  } catch {
    return undefined;
  }
}

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: {
    default: meta.title,
    template: "%s · Animr",
  },
  description: meta.description,
  applicationName: "Animr",
  // No og:title / og:description here on purpose: Next fills them from each page's own title and
  // description, so a shared /leaderboard link previews as "Leaderboard · Animr", not the home title.
  // The image is the landing page's card, so every shared app link (a Chog's page included) gets a
  // large preview; Next mirrors it into twitter:image.
  openGraph: {
    type: "website",
    siteName: "Animr",
    locale: "en_US",
    images: [meta.ogImage],
  },
  // Farcaster Mini App embed (fc:miniapp + legacy fc:frame): a cast of any Animr link shows today's Bell card
  // with "Ride a Chog", opening /bell inside the client. A page that sets its own `other` replaces this.
  other: miniAppEmbed(),
};

export const viewport: Viewport = {
  themeColor: "#0e0b1e",
  colorScheme: "dark",
};

/**
 * Document shell only. Each route group's layout owns its chrome and the page's single <main>:
 * app/(site) for the landing page at /, app/(app) for /app, /leaderboard and /chog/[tokenId]. The
 * wallet and query providers live in app/(app)/layout.tsx, so the landing page doesn't ship them.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-scroll-behavior: the landing page scrolls smoothly (landing.css); this tells Next to
    // switch that off during route changes, so a navigation lands at the top of the new page.
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* Flex column: a group layout's header, <main className="flex-1"> and footer pin the footer down. */}
      <body className="flex min-h-full flex-col">
        {children}
        {/* Hides the splash inside Farcaster clients; a no-op (no SDK download) everywhere else. */}
        <MiniAppReady />
      </body>
    </html>
  );
}
