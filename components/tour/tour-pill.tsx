"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { pillClass } from "@/components/v2";
import { TOUR_STEP_COUNT, parseTourStep } from "./steps";
import "./tour.css";

function TourPillInner() {
  const step = parseTourStep(useSearchParams().get("tour"));
  if (step === null) return null;
  const next = Math.min(TOUR_STEP_COUNT, step + 1);
  return (
    <div className="tour-pill-wrap">
      <Link href={`/tour?step=${next}`} className={`${pillClass("glass", "sm")} v2-glass--strong tour-pill`}>
        Back to the tour · step {step} of {TOUR_STEP_COUNT}
      </Link>
    </div>
  );
}

/**
 * "Back to the tour · step N of M": a small floating pill for pages opened from /tour (their URL carries ?tour=N).
 * Renders nothing otherwise. Reads the query on the client inside its own Suspense, so a prerendered page keeps its
 * static shell (the fallback is nothing). Returning lands on step N+1.
 */
export function TourPill() {
  return (
    <Suspense fallback={null}>
      <TourPillInner />
    </Suspense>
  );
}
