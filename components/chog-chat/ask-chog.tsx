"use client";

import { ChatText } from "@/components/chat-text";
import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { useChogName, useGenome } from "@/components/dna/api";
import { chogThumbUrl } from "@/components/dna/thumb-url";
import { pillClass } from "@/components/v2";
import { ASK_LIMITS, type AskRequest, type AskResponse } from "@/lib/chog-chat/types";
import "./chog-chat.css";

const SUGGESTIONS = ["Why do you trade like that?", "What was your best trade?", "What's your call for today?"];

type Line = { id: number; role: "you"; text: string } | { id: number; role: "chog"; text: string; source: AskResponse["source"] };

class AskApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function ask(tokenId: number, body: AskRequest): Promise<AskResponse> {
  const res = await fetch(`/api/chog/${tokenId}/ask`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const error = (data as { error?: unknown } | null)?.error;
    throw new AskApiError(typeof error === "string" ? error : "Couldn't reach this Chog. Try again.", res.status);
  }
  return data as AskResponse;
}

/**
 * "Ask this Chog": anyone can ask a Chog about its Trading DNA, its Time Machine replay, its Daily Bell call and,
 * once claimed, its real decisions. Its AI on 0G Compute answers in its voice (quick answers from its stats when the
 * AI is resting). Read-only: nothing here can trade, sign or move anything. `viewer` is the connected wallet: a
 * verified holder gets greeted as one.
 */
export function AskChog({ tokenId, viewer }: { tokenId: number; viewer?: string }) {
  const titleId = useId();
  const inputId = useId();
  const name = useChogName(tokenId);
  const image = useGenome(tokenId).data?.chog.image;
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState("");
  const [turnsLeft, setTurnsLeft] = useState<number>(ASK_LIMITS.maxTurns);
  const [done, setDone] = useState(false);
  const nextId = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);
  const send = useMutation({ mutationFn: (body: AskRequest) => ask(tokenId, body) });

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [lines, send.isPending]);

  function submit(text: string) {
    const message = text.trim().slice(0, ASK_LIMITS.maxMessageChars);
    if (!message || send.isPending || done) return;
    const id = ++nextId.current;
    setLines((current) => [...current, { id, role: "you", text: message }]);
    setDraft("");
    send.mutate(
      { message, ...(sessionId && { sessionId }), ...(viewer && { viewer }) },
      {
        onSuccess: (response) => {
          setSessionId(response.sessionId);
          setLines((current) => [...current, { id: -id, role: "chog", text: response.reply, source: response.source }]);
          setTurnsLeft(response.turnsLeft);
          setDone(response.done);
        },
        onError: (error) => {
          // A finished chat (409) can't take the question; anything else gives the question back for a retry.
          setLines((current) => current.filter((line) => line.id !== id));
          if (error instanceof AskApiError && error.status === 409) setDone(true);
          else setDraft(message);
        },
      },
    );
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    submit(draft);
  }

  function restart() {
    setSessionId(null);
    setLines([]);
    setTurnsLeft(ASK_LIMITS.maxTurns);
    setDone(false);
    send.reset();
  }

  const asked = new Set(lines.filter((line) => line.role === "you").map((line) => line.text));
  const suggestions = SUGGESTIONS.filter((s) => !asked.has(s));
  const label = name || "this Chog";

  return (
    <section aria-labelledby={titleId} className="v2-card">
      <div className="ask-head">
        <div className="flex min-w-0 items-center gap-3">
          {image && (
            // eslint-disable-next-line @next/next/no-img-element -- a resized IPFS thumbnail (wsrv.nl), like the League's
            <img src={chogThumbUrl(image, 96)} alt="" width={40} height={40} className="ask-avatar" loading="lazy" />
          )}
          <div className="min-w-0">
            <h2 id={titleId} className="v2-h3">
              Ask {label}
            </h2>
            <p className="v2-note mt-0.5">About its Trading DNA, its trades and its Bell call.</p>
          </div>
        </div>
      </div>

      {(lines.length > 0 || send.isPending) && (
        <div ref={logRef} role="log" aria-live="polite" aria-label={`Conversation with ${label}`} className="ask-log">
          {lines.map((line) =>
            line.role === "you" ? (
              <div key={line.id} className="ask-msg ask-msg--you">
                <p className="ask-bubble">
                  <span className="v2-sr">You: </span>
                  <ChatText text={line.text} />
                </p>
              </div>
            ) : (
              <div key={line.id} className="ask-msg ask-msg--chog">
                <p className="ask-bubble">
                  <span className="v2-sr">{label}: </span>
                  <ChatText text={line.text} />
                </p>
                {line.source === "template" && <p className="ask-meta">Quick answer from its stats: its AI is resting</p>}
              </div>
            ),
          )}
          {send.isPending && (
            <div className="ask-msg ask-msg--chog">
              <p className="ask-bubble" role="status" aria-label={`${label} is typing`}>
                <span className="ask-typing" aria-hidden>
                  <span />
                  <span />
                  <span />
                </span>
              </p>
            </div>
          )}
        </div>
      )}

      {done ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[length:var(--v2-fs-sm)] text-[var(--v2-nav)]">That&apos;s all for this chat.</p>
          <button type="button" className={pillClass("glass", "sm")} onClick={restart}>
            Start over
          </button>
        </div>
      ) : (
        <>
          {suggestions.length > 0 && (
            <div className="ask-chips mt-5" role="group" aria-label="Suggested questions">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="v2-chip"
                  disabled={send.isPending}
                  onClick={() => submit(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
          <form onSubmit={onSubmit} className="mt-3">
            <label htmlFor={inputId} className="v2-sr">
              Your question for {label}
            </label>
            <div className="v2-input-group ask-composer">
              <input
                id={inputId}
                className="v2-input"
                value={draft}
                maxLength={ASK_LIMITS.maxMessageChars}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Ask it anything"
                autoComplete="off"
              />
              <button type="submit" className={pillClass("glass", "sm")} disabled={send.isPending || !draft.trim()}>
                Ask
              </button>
            </div>
          </form>
        </>
      )}

      {send.isError && !(send.error instanceof AskApiError && send.error.status === 409) && (
        <p role="alert" className="mt-3 text-[length:var(--v2-fs-sm)] text-[var(--v2-danger)]">
          {send.error.message}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="v2-note">
          {!done && lines.length > 0 && (
            <span className="v2-num">
              {turnsLeft} {turnsLeft === 1 ? "question" : "questions"} left.{" "}
            </span>
          )}
          Read-only: it can&apos;t trade or move anything.
        </p>
        <span className="v2-chip" title="Answers come from an LLM served by 0G Compute">
          <span aria-hidden className="size-1.5 rounded-full bg-[var(--v2-teal)]" />
          AI on 0G Compute
        </span>
      </div>
    </section>
  );
}
