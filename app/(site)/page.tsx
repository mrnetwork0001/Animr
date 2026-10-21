import type { Metadata } from "next";
import { brand, meta } from "@/components/landing/content";
import { Faq } from "@/components/landing/faq";
import { FinalCta } from "@/components/landing/final-cta";
import { Gate } from "@/components/landing/gate";
import { Hero } from "@/components/landing/hero";
import { Minds } from "@/components/landing/minds";
import { Receipts } from "@/components/landing/receipts";
import { Safety } from "@/components/landing/safety";
import { Verbs } from "@/components/landing/verbs";

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

/**
 * The landing page: the tagline and "Random Chog" in the first screen, the four verbs (Meet, Rewind,
 * Ride, Rob), then the why and the safety on scroll. Static and server-rendered: every Chog, name and
 * League number on it is computed from committed data when the page is built (components/landing/
 * showcase.ts). The only client code is Random Chog, the phone menu and the image fallbacks.
 */
export default function LandingPage() {
  return (
    <>
      <Hero />
      <Verbs />
      <Gate />
      <Minds />
      <Safety />
      <Receipts />
      <Faq />
      <FinalCta />
    </>
  );
}
