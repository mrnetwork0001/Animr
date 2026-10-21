import Link from "next/link";
import { maxUint256 } from "viem";
import { appConfig } from "@/lib/config";

/**
 * The 404 body, shared by app/not-found.tsx (unmatched URLs and the proxy's rewrite for invalid
 * Chog IDs) and app/(app)/not-found.tsx (notFound() inside the app), so the two can't drift.
 * Both ways back lead into the app: the dashboard and the League.
 */
export function NotFoundContent() {
  const { min, max } = appConfig.tokenIdRange;
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <p className="eyebrow">404</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Nothing lives here</h1>
      <p className="mt-3 text-pretty text-muted">
        This page doesn&apos;t exist.
        {max < maxUint256 && ` Looking for a Chog? Token IDs run from ${min} to ${max}.`}
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/app" className="btn btn-primary px-5 py-2.5">
          Look up a Chog
        </Link>
        <Link href="/league" className="btn btn-secondary px-5 py-2.5">
          Browse the League
        </Link>
      </div>
    </div>
  );
}
