"use client";

import { type FormEvent, type ReactNode, useState } from "react";
import type { HallOfFameEntry, WallCheck } from "@/lib/heist/types";
import { EmptyState, MaskIcon, PillLink, SectionTitle, Toast, pillClass } from "@/components/v2";
import { heistErrorMessage, useSubmitToWall } from "./api";
import { chogText, utcTime } from "./bits";
import type { WallTicket } from "./chat";

const NICKNAME_MAX = 20;

/**
 * Con artists whose House Chog said yes. The wall only ever shows the AI's own reply (addresses redacted; an LLM's
 * only once a moderator approved it) and a sanitized nickname, never what the visitor typed. What Monad said is shown
 * exactly as the check stored it.
 */
export function HallOfFame({ entries }: { entries: HallOfFameEntry[] }) {
  return (
    <section aria-labelledby="heist-wall" className="v2-section">
      <SectionTitle
        id="heist-wall"
        kicker="Hall of Fame"
        title="AIs that said yes"
        description="Only the AI's own reply and a nickname, never what the visitor typed. What Monad said about each one is shown exactly as the check stored it."
      />
      {entries.length === 0 ? (
        <EmptyState
          icon={<MaskIcon />}
          title="No House Chog has caved yet."
          body="Be the first name on the wall: talk its AI into a yes."
          actions={<PillLink href="#heist-chat" variant="glass" size="sm">Start a heist</PillLink>}
        />
      ) : (
        <div className="v2-table-wrap">
          <table className="v2-table">
            <thead>
              <tr>
                <th scope="col">The AI said</th>
                <th scope="col" className="v2-hide-sm">
                  Conned by
                </th>
                <th scope="col" className="v2-hide-sm">
                  What Monad said
                </th>
                <th scope="col" className="v2-hide-sm">
                  When (UTC)
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="sm:min-w-[16rem]">
                    {entry.reply !== null ? (
                      <blockquote className="heist-wall-reply">“{entry.reply}”</blockquote>
                    ) : (
                      <p className="heist-wall-reply italic text-[var(--v2-nav)]">
                        {entry.replyHeld ? "Its AI-written reply shows once a moderator has read it." : "No reply on record."}
                      </p>
                    )}
                    <div className="v2-show-sm mt-2 grid gap-1">
                      <p className="v2-note">
                        by {entry.nickname} · {utcTime(entry.at)}
                      </p>
                      <div className="text-[length:var(--v2-fs-xs)] text-[var(--v2-nav)]">{checkCaption(entry.check)}</div>
                    </div>
                    {(entry.source === "template" || (entry.source === "0g" && entry.model)) && (
                      <p className="v2-note mt-1">{entry.source === "template" ? "template reply" : entry.model}</p>
                    )}
                  </td>
                  <td className="v2-hide-sm">
                    <span className="font-medium">{entry.nickname}</span>
                    {entry.amountChog !== null && (
                      <span className="v2-note block">
                        <span className="v2-num">{chogText(entry.amountChog, 2)}</span> $CHOG promised
                      </span>
                    )}
                  </td>
                  <td className="v2-hide-sm text-[length:var(--v2-fs-sm)] text-[var(--v2-nav)]">{checkCaption(entry.check)}</td>
                  <td className="v2-hide-sm whitespace-nowrap text-[var(--v2-faint)]">{utcTime(entry.at).replace(/ UTC$/, "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** What the check said when that AI caved, exactly as stored: never more than it found. */
function checkCaption(check: WallCheck | null): ReactNode {
  if (!check) return "No check on record";
  if (check.kind === "live") {
    if (!check.refused) return "Monad did not refuse it";
    return (
      <>
        <span className="heist-decoded">{check.error ?? "NO"}</span>
        {check.blockNumber && (
          <span className="v2-note mt-1 block">
            at block <span className="v2-num">{Number(check.blockNumber).toLocaleString("en-US")}</span>
          </span>
        )}
      </>
    );
  }
  switch (check.reason) {
    case "house-unset":
    case "tba-none":
    case "tba-uninitialized":
    case "vault-empty":
      return "Before the House Chog moved in (no live check)";
    case "busy":
      return "Not checked (too many checks at once)";
    case "inconclusive":
      return "The live check was inconclusive";
    case "rpc-error":
      return "The live check couldn't reach Monad";
    default:
      return "No live check";
  }
}

/** "It said yes!": put the caving reply on the wall (shown right under the verdict). */
export function WallForm({ ticket, onSubmitted }: { ticket: WallTicket; onSubmitted: () => void }) {
  const submit = useSubmitToWall();
  const [nickname, setNickname] = useState("");

  if (!ticket.eligible) {
    return (
      <Toast title="It said yes!" tone="warning">
        {ticket.reason ?? "This reply can't go on the wall."}
      </Toast>
    );
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    submit.mutate({ sessionId: ticket.sessionId, nickname: nickname.trim() }, { onSuccess: onSubmitted });
  }

  return (
    <form onSubmit={onSubmit} className="v2-card heist-pop heist-wall-form">
      <div>
        <label htmlFor="heist-nickname" className="v2-h3 block">
          It said yes! Put its reply on the wall
        </label>
        <p className="v2-note mt-1 text-pretty">
          Only the AI&apos;s reply and your nickname are shown, never your messages. A reply an AI model wrote appears once a
          moderator has read it.
        </p>
      </div>
      <div className="v2-input-group max-w-xl">
        <input
          id="heist-nickname"
          value={nickname}
          onChange={(event) => setNickname(event.target.value.slice(0, NICKNAME_MAX))}
          maxLength={NICKNAME_MAX}
          placeholder="Nickname (optional)"
          autoComplete="nickname"
          className="v2-input min-w-0 flex-1"
        />
        <button type="submit" className={pillClass("primary")} disabled={submit.isPending}>
          {submit.isPending ? "Adding…" : "Add to the wall"}
        </button>
      </div>
      {submit.isError && (
        <p role="alert" className="text-[length:var(--v2-fs-sm)] text-[var(--v2-danger)]">
          {heistErrorMessage(submit.error)}
        </p>
      )}
    </form>
  );
}
