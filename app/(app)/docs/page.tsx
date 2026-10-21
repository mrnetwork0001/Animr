import type { Metadata, Viewport } from "next";
import { DOC_CONTENT } from "@/components/docs/content";
import { DocsFrame } from "@/components/docs/frame";
import { docEntry } from "@/components/docs/registry";

const entry = docEntry("")!;

export const metadata: Metadata = {
  title: { absolute: `${entry.title} · Animr Docs` },
  description: entry.description,
};

export const viewport: Viewport = { themeColor: "#0d0c11" };

/** The docs home. Static: every number on it is from code or a cached League headline. */
export default function DocsHome() {
  return <DocsFrame slug="" content={DOC_CONTENT[""]} />;
}
