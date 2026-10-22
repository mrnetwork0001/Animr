import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { DOC_CONTENT } from "@/components/docs/content";
import { DocsFrame } from "@/components/docs/frame";
import { DOC_PAGES, docEntry } from "@/components/docs/registry";

export const viewport: Viewport = { themeColor: "#0d0c11" };

/** Every doc page is prerendered at build time. */
export function generateStaticParams() {
  return DOC_PAGES.filter((page) => page.slug).map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: PageProps<"/docs/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const entry = slug ? docEntry(slug) : undefined;
  if (!entry) return { title: { absolute: "Not found · Animr Docs" } };
  return { title: { absolute: `${entry.title} · Animr Docs` }, description: entry.description };
}

export default async function DocPage({ params }: PageProps<"/docs/[slug]">) {
  const { slug } = await params;
  const content = slug ? DOC_CONTENT[slug] : undefined;
  if (!content || !docEntry(slug)) notFound();
  return <DocsFrame slug={slug} content={content} />;
}
