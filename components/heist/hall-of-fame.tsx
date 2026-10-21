"use client";

import { type FormEvent, type ReactNode, useState } from "react";
import type { HallOfFameEntry, WallCheck } from "@/lib/heist/types";
import { heistErrorMessage, useSubmitToWall } from "./api";
import { chogText, utcTime } from "./bits";
import type { WallTicket } from "./chat";

const NICKNAME_MAX = 20;

/**
 * Con artists whose House Chog said yes. The wall only ever shows the AI's own reply (addresses redacted; an LLM's
 * only once a moderator approved it) and a sanitized nickname, never what the visitor typed. What Monad said is shown
 * exactly as the check stored it.
 */
export function HallOfFame({ entries, ticket, onSubmitted }: { entries: HallOfFameEntry[]; ticket: WallTicket | null; onSubmitted: () => void }) {
  return (
    <section aria-labelledby="heist-wall" className="card p-5">
      <h2 id="heist-wall" className="text-lg font-semibold tracking-tight">
        Hall of Fame
      </h2>
      <p className="mt-1 text-xs text-pretty text-subtle">
        AIs that said yes, and what Monad said about each one.
      </p>

      {ticket && <WallForm ticket={ticket} onSubmitted={onSubmitted} />}

      {entries.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-line-strong px-4 py-5 text-center text-sm text-muted">
          No House Chog has caved yet. Be the first name on the wall.
        </p>
      ) : (
        <ol className="mt-4 space-y-3">
          {entries.map((entry) => (
            <li key={entry.id} className="heist-pop rounded-xl border border-line bg-surface-2/60 p-3.5">
              {entry.reply !== null ? (
                <blockquote className="text-sm text-pretty">“{entry.reply}”</blockquote>
              ) : (
                <p className="text-sm text-pretty text-muted italic">
                  {entry.replyHeld ? "Its AI-written reply shows once a moderator has read it." : "No reply on record."}
                </p>
              )}
              <p className="mt-2 text-xs text-muted">
                conned by <span className="font-semibold text-foreground">{entry.nickname}</span>
                {entry.amountChog !== null && <> · {chogText(entry.amountChog, 2)} $CHOG promised</>}
              </p>
              <p className="mt-1 text-[11px] text-subtle">
                {utcTime(entry.at)}
                {checkCaption(entry.check)}
                {entry.source === "0g" && entry.model ? ` · ${entry.model}` : entry.source === "template" ? " · template reply" : ""}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** What the check said when that AI caved, exactly as stored: never more than it found. */
function checkCaption(check: WallCheck | null): ReactNode {
  if (!check) return " · no check on record";
  if (check.kind === "live") {
    if (!check.refused) return " · Monad did not refuse it";
    return (
      <>
        {" "}
        · Monad said <span className="font-mono text-danger">{check.error ?? "no"}</span>
        {check.blockNumber && <> at block {Number(check.blockNumber).toLocaleString("en-US")}</>}
      </>
    );
  }
  switch (check.reason) {
    case "house-unset":
    case "tba-none":
    case "tba-uninitialized":
    case "vault-empty":
      return " · before the House Chog moved in (no live check)";
    case "busy":
      return " · not checked (too many checks at once)";
    case "inconclusive":
      return " · the live check was inconclusive";
    case "rpc-error":
      return " · the live check couldn't reach Monad";
    default:
      return " · no live check";
  }
}

function WallForm({ ticket, onSubmitted }: { ticket: WallTicket; onSubmitted: () => void }) {
  const submit = useSubmitToWall();
  const [nickname, setNickname] = useState("");

  if (!ticket.eligible) {
    return (
      <p className="mt-4 rounded-xl border border-line bg-surface-2/60 px-4 py-3 text-sm text-pretty text-muted">
        It said yes! {ticket.reason ?? "This reply can't go on the wall."}
      </p>
    );
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    submit.mutate({ sessionId: ticket.sessionId, nickname: nickname.trim() }, { onSuccess: onSubmitted });
  }

  return (
    <form onSubmit={onSubmit} className="heist-pop mt-4 rounded-xl border border-warning/40 bg-warning/10 p-4">
      <label htmlFor="heist-nickname" className="text-sm font-semibold">
        It said yes! Put its reply on the wall
      </label>
      <p className="mt-0.5 text-xs text-muted">
        Only the AI&apos;s reply and your nickname are shown, never your messages. A reply an AI model wrote appears once a
        moderator has read it.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          id="heist-nickname"
          value={nickname}
          onChange={(event) => setNickname(event.target.value.slice(0, NICKNAME_MAX))}
          maxLength={NICKNAME_MAX}
          placeholder="Nickname (optional)"
          autoComplete="nickname"
          className="input min-w-0 flex-1"
        />
        <button type="submit" className="btn btn-primary" disabled={submit.isPending}>
          {submit.isPending ? "Adding…" : "Add"}
        </button>
      </div>
      {submit.isError && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {heistErrorMessage(submit.error)}
        </p>
      )}
    </form>
  );
}
