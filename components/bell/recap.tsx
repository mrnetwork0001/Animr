"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { type CSSProperties, useState } from "react";
import type { BellRecap, RecapChog } from "@/lib/bell/recap";
import { ChogAvatar, KindBadge, LABEL, Skeleton } from "./bits";
import { formatDay } from "./format";

// The recap of a settled Bell (GET /api/bell/recap/[day]): a headline, a few lines and one quote each from the best
// call and the most rekt. Written once by an LLM on 0G Compute (else from a template) the first time anyone asks.
// Renders nothing for a Bell that hasn't settled or has no recap.

class RecapMissing extends Error {}

async function fetchRecap(day: string): Promise<BellRecap> {
  const res = await fetch(`/api/bell/recap/${day}`);
  // 404: no Bell that day; 409: not settled yet. Neither has a recap, and neither is an error to show.
  if (res.status === 404 || res.status === 409) throw new RecapMissing();
  const body = (await res.json().catch(() => null)) as BellRecap | { error?: string } | null;
  if (!res.ok || !body || !("headline" in body)) throw new Error((body as { error?: string } | null)?.error ?? `HTTP ${res.status}`);
  return body;
}

export function useBellRecap(day: string | null | undefined) {
  return useQuery({
    queryKey: ["bell", "recap", day ?? ""],
    queryFn: () => fetchRecap(day as string),
    enabled: Boolean(day),
    staleTime: 10 * 60_000,
    retry: (failures, error) => failures < 1 && !(error instanceof RecapMissing),
  });
}

/**
 * `link`: adds "All calls" to the Bell's own page (on /bell, where the recap may be for an earlier Bell). `empty`:
 * shown when the Bell has no recap (not settled, or no Bell that day); nothing by default.
 */
export function BellRecapCard({ day, link = false, empty }: { day: string; link?: boolean; empty?: string }) {
  const query = useBellRecap(day);
  if (query.isPending) return <RecapSkeleton />;
  if (query.isError) return query.error instanceof RecapMissing && empty ? <p className="v2-note m-0">{empty}</p> : null;
  const recap = query.data;
  const title = `Recap of the Bell of ${formatDay(recap.day)}`;

  return (
    <section aria-label={title} className="v2-card flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className={`${LABEL} flex items-center gap-2`}>
          Recap · {formatDay(recap.day)} <KindBadge kind={recap.kind} />
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {link && (
            <Link href={`/bell/${recap.day}`} className="v2-btn-ghost v2-btn--sm">
              All calls
            </Link>
          )}
          <ShareRecap recap={recap} />
        </div>
      </div>

      <div>
        <h2 className="v2-h3 m-0">{recap.headline}</h2>
        <ul className="mt-3 grid list-none gap-1.5 p-0 text-[length:var(--v2-fs-sm)] text-[var(--v2-muted)]">
          {recap.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      <div className="grid gap-4 border-t border-[var(--v2-line-soft)] pt-5 md:grid-cols-2">
        <Quote chog={recap.winner} heading="Best call" line="var(--v2-line-teal)" />
        {recap.rekt && <Quote chog={recap.rekt} heading="Most rekt" line="rgb(169 155 243 / 0.5)" />}
      </div>

      {recap.writtenBy === "ai" && (
        <p className="v2-note m-0" title={recap.zg?.requestId ? `0G request ${recap.zg.requestId}` : undefined}>
          Written by AI on 0G Compute
          {recap.zg?.model && ` · ${recap.zg.model}`}
          {recap.zg?.providerName && ` · ${recap.zg.providerName}`}
          {recap.zg?.costUsdMicro && ` · ${formatCost(recap.zg.costUsdMicro)}`}
        </p>
      )}
    </section>
  );
}

/** "$0.002" from micro-USD. */
function formatCost(micro: string): string {
  const usd = Number(micro) / 1_000_000;
  if (!Number.isFinite(usd) || usd <= 0) return "";
  return `$${usd < 0.01 ? usd.toPrecision(1) : usd.toFixed(2)}`;
}

function Quote({ chog, heading, line }: { chog: RecapChog; heading: string; line: string }) {
  return (
    <figure className="m-0 flex flex-col gap-3">
      <figcaption className="flex items-center gap-3">
        <ChogAvatar src={chog.image} tokenId={chog.tokenId} className="size-10 rounded-[10px]" />
        <span className="min-w-0">
          <span className="block text-[12.5px] text-[var(--v2-faint)]">{heading}</span>
          <Link href={`/chog/${chog.tokenId}`} className="block truncate text-sm font-medium text-[var(--v2-ink)] hover:text-[var(--v2-kicker)]">
            {chog.name}
            {chog.tag && <span className="font-normal text-[var(--v2-faint)]"> · {chog.tag}</span>}
          </Link>
        </span>
      </figcaption>
      <blockquote className="bell-quote" style={{ "--bell-quote-line": line } as CSSProperties}>
        “{chog.quote}”
      </blockquote>
    </figure>
  );
}

function ShareRecap({ recap }: { recap: BellRecap }) {
  const [copied, setCopied] = useState(false);
  const url = () => `${window.location.origin}/bell/${recap.day}/recap`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link", url());
    }
  };
  const post = () => {
    const text = `${recap.headline}. The Daily Bell recap on Animr:`;
    const intent = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url())}`;
    window.open(intent, "_blank", "noopener,noreferrer");
  };
  return (
    <>
      <button type="button" onClick={copy} className="v2-btn-glass v2-btn--sm" aria-live="polite">
        {copied ? "Link copied" : "Copy link"}
      </button>
      <button type="button" onClick={post} className="v2-btn-glass v2-btn--sm">
        Share on X
      </button>
    </>
  );
}

/** The recap card's frame with the same rows and spacing as the card, so the recap lands without moving the page. */
export function RecapSkeleton() {
  const quote = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-[10px]" />
        <span className="flex flex-col gap-1.5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3.5 w-40" />
        </span>
      </div>
      <Skeleton className="h-[46px] w-full" />
    </div>
  );
  return (
    <div role="status" className="v2-card flex flex-col gap-5">
      <span className="v2-sr">Loading the recap…</span>
      <div className="flex min-h-9 items-center">
        <Skeleton className="h-4 w-40" />
      </div>
      <div>
        <Skeleton className="h-7 w-3/4" />
        <div className="mt-3 grid gap-1.5">
          {["w-full", "w-5/6", "w-4/6"].map((width) => (
            <Skeleton key={width} className={`h-5 ${width}`} />
          ))}
        </div>
      </div>
      <div className="grid gap-4 border-t border-[var(--v2-line-soft)] pt-5 md:grid-cols-2">
        {quote}
        {quote}
      </div>
      <Skeleton className="h-4 w-56" />
    </div>
  );
}
