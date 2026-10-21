import type { Metadata, Viewport } from "next";
import { AnimrHero } from "@/components/hero/animr-hero";
import { brand, meta } from "@/components/landing/content";
import { Faq } from "@/components/landing/faq";
import { FinalCta } from "@/components/landing/final-cta";
import { Gate } from "@/components/landing/gate";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingMotion } from "@/components/landing/landing-motion";
import { Minds } from "@/components/landing/minds";
import { Receipts } from "@/components/landing/receipts";
import { Safety } from "@/components/landing/safety";
import { Verbs } from "@/components/landing/verbs";
import "@/app/design-v2.css";
import "@/components/landing/landing.css";

export const metadata: Metadata = {
  // Absolute: the root layout's "%s · Animr" template would repeat the brand.
  title: { absolute: meta.title },
  description: meta.description,
  openGraph: {
    // Replaces the root layout's openGraph object wholesale, so its fields are restated here.
    type: "website",
    siteName: brand.name,
    locale: "en_US",
    title: meta.title,
    description: meta.description,
    images: [meta.ogImage],
  },
  twitter: {
    card: "summary_large_image",
    title: meta.title,
    description: meta.description,
    images: [meta.ogImage],
  },
};

export const viewport: Viewport = {
  themeColor: "#0d0c11",
};

/**
 * The landing page: the approved hero (components/hero) as the first screen, then the four ways in
 * (League, Versus, Daily Bell, Rob this Chog), why the NFT is the app, Trading DNA, safety, 0G receipts, the FAQ and the
 * final call, all in the v2 language (app/design-v2.css + components/landing/landing.css) on the
 * hero's near-black and grid. Static and server-rendered: every Chog, name and League number on it is
 * computed from committed data when the page is built (components/landing/showcase.ts). The client code
 * is the hero's motion and menu, the body's scroll reveals (components/landing/landing-motion.tsx), Random Chog, the
 * House Chog's live status and the image fallbacks.
 */
export default function LandingPage() {
  return (
    <AnimrHero className="v2-page lp-root" footer={<LandingFooter />}>
      <div className="lp-body">
        <Verbs />
        <Gate />
        <Minds />
        <Safety />
        <Receipts />
        <Faq />
        <FinalCta />
        <LandingMotion />
      </div>
    </AnimrHero>
  );
}
