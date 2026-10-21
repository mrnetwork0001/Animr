"use client";

import { useRef, useState } from "react";
import { useAccount } from "wagmi";
import { EmptyState, MaskIcon, PillButton, Skeleton } from "@/components/v2";
import type { HeistProof } from "@/lib/heist/types";
import { useHeistState } from "./api";
import { Chat, type WallTicket } from "./chat";
import { HallOfFame, WallForm } from "./hall-of-fame";
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
      <div role="alert" className="v2-section">
        <EmptyState
          icon={<MaskIcon />}
          title="Couldn't reach the House Chog."
          body="The vault is fine; the page just couldn't load. Try again in a moment."
          actions={
            <PillButton variant="glass" onClick={() => state.refetch()} disabled={state.isFetching}>
              {state.isFetching ? "Retrying…" : "Retry"}
            </PillButton>
          }
        />
      </div>
    );
  }
  const data = state.data;

  function showVerdict(proof: HeistProof, origin: "chat" | "act") {
    setVerdict({ proof, origin, key: ++verdicts.current });
    if (proof.kind === "live") setLastLive(proof);
  }

  return (
    <>
      <section aria-label="The vault room" className="v2-section heist-room">
        <HouseCard house={data.house} defender={data.defender} />
        <Chat state={data} recipient={address} onVerdict={showVerdict} onCave={setTicket} />
      </section>
      {(verdict || ticket) && (
        <div className="mt-5 grid gap-4">
          {verdict && <Verdict key={verdict.key} view={verdict} />}
          {ticket && <WallForm ticket={ticket} onSubmitted={() => setTicket(null)} />}
        </div>
      )}
      <WhySafe house={data.house} guard={data.guard.address} proof={lastLive} />
      <HallOfFame entries={data.hallOfFame} />
    </>
  );
}

/** Same shapes as the room: the vault card, the tall chat, then the four locks. */
function HeistSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the heist">
      <div className="v2-section heist-room">
        <div className="v2-card v2-card--flush">
          <div className="grid place-items-center p-9">
            <Skeleton style={{ width: 168, height: 168, borderRadius: 26 }} />
          </div>
          <div className="grid gap-3 p-6">
            <Skeleton variant="text" style={{ width: 120 }} />
            <Skeleton variant="title" style={{ width: 200 }} />
            <Skeleton variant="text" />
            <Skeleton style={{ height: 56 }} />
            <Skeleton variant="text" />
            <Skeleton variant="text" style={{ width: "70%" }} />
          </div>
        </div>
        <div className="v2-card v2-card--flush">
          <div className="grid gap-2 p-6">
            <Skeleton variant="title" style={{ width: 280, maxWidth: "100%" }} />
            <Skeleton variant="text" style={{ width: 360, maxWidth: "100%" }} />
          </div>
          <div className="p-6 pt-0">
            <Skeleton style={{ height: 6 }} />
          </div>
          <div className="grid gap-3 p-6">
            <Skeleton style={{ height: 52, width: "60%" }} />
          </div>
          <div className="h-48" />
          <div className="p-6">
            <Skeleton style={{ height: 60, borderRadius: 22 }} />
          </div>
        </div>
      </div>
      <div className="v2-section v2-grid v2-grid--2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} variant="card" style={{ height: 240 }} />
        ))}
      </div>
    </div>
  );
}
