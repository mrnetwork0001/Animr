"use client";

import { useRef, useState } from "react";
import { useAccount } from "wagmi";
import type { HeistProof } from "@/lib/heist/types";
import { useHeistState } from "./api";
import { Chat, type WallTicket } from "./chat";
import { Counters } from "./counters";
import { HallOfFame } from "./hall-of-fame";
import "./heist.css";
import { HouseCard } from "./house-card";
import { Verdict, type VerdictView } from "./verdict";
import { WhySafe } from "./why-safe";

/** Everything on /heist below the page header. All data comes from /api/heist (client-side). */
export function HeistRoom() {
  const state = useHeistState();
  const { address } = useAccount();
  const [verdict, setVerdict] = useState<VerdictView | null>(null);
  const [lastLive, setLastLive] = useState<HeistProof | null>(null);
  const [ticket, setTicket] = useState<WallTicket | null>(null);
  const verdicts = useRef(0);

  if (state.isPending) return <HeistSkeleton />;
  if (state.isError || !state.data) {
    return (
      <div role="alert" className="card p-6">
        <p className="font-semibold">Couldn&apos;t reach the House Chog.</p>
        <p className="mt-1 text-sm text-muted">The vault is fine; the page just couldn&apos;t load. Try again in a moment.</p>
        <button type="button" className="btn btn-secondary mt-4" onClick={() => state.refetch()} disabled={state.isFetching}>
          {state.isFetching ? "Retrying…" : "Retry"}
        </button>
      </div>
    );
  }
  const data = state.data;

  function showVerdict(proof: HeistProof, origin: "chat" | "act") {
    setVerdict({ proof, origin, key: ++verdicts.current });
    if (proof.kind === "live") setLastLive(proof);
  }

  return (
    <div className="space-y-6">
      <Counters counters={data.counters} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <HouseCard house={data.house} defender={data.defender} />
          <Chat state={data} recipient={address} onVerdict={showVerdict} onCave={setTicket} />
          {verdict && <Verdict key={verdict.key} view={verdict} />}
        </div>
        <aside className="min-w-0 space-y-6">
          <WhySafe house={data.house} guard={data.guard.address} proof={lastLive} />
          <HallOfFame entries={data.hallOfFame} ticket={ticket} onSubmitted={() => setTicket(null)} />
        </aside>
      </div>
    </div>
  );
}

function HeistSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading the heist">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card h-[4.5rem] animate-pulse" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <div className="card h-40 animate-pulse" />
          <div className="card h-96 animate-pulse" />
        </div>
        <div className="card h-80 animate-pulse" />
      </div>
    </div>
  );
}
