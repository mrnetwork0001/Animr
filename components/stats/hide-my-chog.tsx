"use client";

import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useId, useState } from "react";
import { type Address, erc721Abi, isAddressEqual } from "viem";
import { useConnection, useSignMessage } from "wagmi";
import { ConnectButton, useIsClient } from "@/components/connect-button";
import { publicClient } from "@/lib/clients";
import { type ChogQueryHit, chogLabel, parseChogQuery } from "@/lib/chog-id";
import { appConfig } from "@/lib/config";
import { shortAddress } from "@/lib/format";
import type { OptOutAction, OptOutChallenge, OptOutStatus } from "@/lib/optout";
import { isContractRevert, walletErrorMessage } from "@/lib/wagmi";
import { Badge, Kicker, pillClass } from "@/components/v2";
import { formatDay } from "./format";
import "./stats.css";

// "Hide my Chog": the holder signs one free message (no transaction) to take their Chog out of Animr's public pages,
// or to bring it back. The server dates the message (GET /api/optout?tokenId=&action=&owner=), checks the signature
// and ownerOf on-chain (POST /api/optout). Mount it with `tokenId` on a Chog's page, or without to show an id field.

const { min, max } = appConfig.tokenIdRange;

/** A bare token id ("7", "token 7"), inside the collection's range; else null. For collections without name numbers. */
function parseId(raw: string): number | null {
  const text = raw.trim().replace(/^token\s*/i, "");
  if (!/^\d{1,16}$/.test(text)) return null;
  const id = Number(text);
  return Number.isSafeInteger(id) && BigInt(id) >= min && BigInt(id) <= max ? id : null;
}

type Lookup = { tokenId: number | null; other?: ChogQueryHit & { via: "token" | "name" }; problem?: string };

/**
 * What the visitor typed, read the way every Chog field reads it (lib/chog-id.ts): a bare number is a token id,
 * "CHOG #1462" or "#1462" is the number in a Chog's marketplace name. The other reading is offered when it differs.
 */
function lookup(raw: string, nameNumbers: readonly number[] | undefined): Lookup {
  if (!nameNumbers?.length) return { tokenId: parseId(raw) };
  const query = parseChogQuery(raw, nameNumbers);
  if (query.kind === "empty") return { tokenId: null };
  if (query.kind === "invalid") return { tokenId: null, problem: query.message };
  return { tokenId: query.tokenId, other: query.other };
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const error = body && typeof body === "object" ? (body as { error?: unknown }).error : undefined;
    throw new Error(typeof error === "string" ? error : `Request failed (HTTP ${res.status}).`);
  }
  return body as T;
}

const statusKey = (tokenId: number | null) => ["optout", tokenId] as const;

/** A Chog's hide status (GET /api/optout?tokenId=), sharing HideMyChog's cache: `data?.hidden`. */
export function useOptOutStatus(tokenId: number | null) {
  return useQuery({
    queryKey: statusKey(tokenId),
    queryFn: tokenId !== null ? () => api<OptOutStatus>(`/api/optout?tokenId=${tokenId}`) : skipToken,
    staleTime: 10_000,
  });
}

export function HideMyChog({ tokenId: fixedId, nameNumbers }: { tokenId?: number; nameNumbers?: readonly number[] }) {
  const inputId = useId();
  const [draft, setDraft] = useState("");
  const typed = fixedId === undefined ? lookup(draft, nameNumbers) : { tokenId: fixedId };
  const tokenId = typed.tokenId;
  // "CHOG #1462 · token 1": both numbers, so a holder never signs for the wrong Chog.
  const name = (id: number) => chogLabel(id, { number: nameNumbers?.[id - 1] || null });
  const queryClient = useQueryClient();
  const isClient = useIsClient();
  const connection = useConnection();
  // The server renders "disconnected"; only trust wallet state once hydrated.
  const viewer = isClient && connection.status === "connected" ? connection.address : undefined;
  const nft = appConfig.chogNft;

  const status = useOptOutStatus(tokenId);

  // Same key as the Chog profile's holder lookup, so the two share one read.
  const owner = useQuery({
    queryKey: ["nft-owner", nft, String(tokenId)],
    queryFn:
      nft && tokenId !== null && viewer
        ? () => publicClient.readContract({ address: nft, abi: erc721Abi, functionName: "ownerOf", args: [BigInt(tokenId)] })
        : skipToken,
    staleTime: 30_000,
    retry: 1,
  });

  const [phase, setPhase] = useState<"sign" | "submit">("sign");
  const { mutateAsync: signMessage } = useSignMessage();
  const toggle = useMutation({
    mutationFn: async ({ id, action, holder }: { id: number; action: OptOutAction; holder: Address }) => {
      setPhase("sign");
      // The server writes and dates the message, so the wallet's clock never matters.
      const query = new URLSearchParams({ tokenId: String(id), action, owner: holder });
      const challenge = await api<OptOutChallenge>(`/api/optout?${query}`);
      const signature = await signMessage({ account: holder, message: challenge.message });
      setPhase("submit");
      return api<OptOutStatus>("/api/optout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tokenId: id, owner: holder, message: challenge.message, signature }),
      });
    },
    onSuccess: (next) => queryClient.setQueryData(statusKey(next.tokenId), next),
  });

  const hidden = status.data?.hidden ?? false;
  const action: OptOutAction = hidden ? "show" : "hide";
  const isOwner = Boolean(viewer && owner.data && isAddressEqual(viewer, owner.data));
  const done = toggle.isSuccess && toggle.data.tokenId === tokenId ? toggle.data : null;

  let step: ReactNode = null;
  if (tokenId === null) {
    step = typed.problem ? (
      <Hint>
        <span className="text-[var(--v2-danger)]">{typed.problem}</span>
      </Hint>
    ) : (
      <Hint>Type your Chog&apos;s token ID or its name (like CHOG #1462) to see whether it plays in Animr.</Hint>
    );
  } else if (!nft) {
    step = <Hint>Hiding a Chog isn&apos;t available on this network yet.</Hint>;
  } else if (!isClient) {
    step = null;
  } else if (!viewer) {
    step = (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Hint>
          Hold {name(tokenId)}? Connect that wallet to {hidden ? "show it again" : "hide it"}.
        </Hint>
        <ConnectButton className="ml-auto" />
      </div>
    );
  } else if (owner.isPending) {
    step = <Hint>Checking who holds {name(tokenId)}…</Hint>;
  } else if (owner.isError) {
    step = isContractRevert(owner.error) ? (
      <Hint>{name(tokenId)} hasn&apos;t been minted, so there&apos;s nothing to hide.</Hint>
    ) : (
      <Hint>
        <span className="text-[var(--v2-danger)]">Couldn&apos;t read the holder of {name(tokenId)}: {walletErrorMessage(owner.error)}</span>{" "}
        <button type="button" onClick={() => owner.refetch()} className={`${pillClass("glass", "sm")} ml-1`}>
          Retry
        </button>
      </Hint>
    );
  } else if (!isOwner) {
    step = (
      <Hint>
        Only the holder of {name(tokenId)} can {hidden ? "show it again" : "hide it"}. The connected wallet (
        <span className="v2-mono text-[var(--v2-ink)]">{shortAddress(viewer)}</span>) doesn&apos;t hold it.
      </Hint>
    );
  } else if (status.isSuccess) {
    const label = toggle.isPending
      ? phase === "sign"
        ? "Confirm in your wallet…"
        : "Saving…"
      : hidden
        ? `Sign & show ${name(tokenId)} again`
        : `Sign & hide ${name(tokenId)}`;
    step = (
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => toggle.mutate({ id: tokenId, action, holder: viewer })}
          disabled={toggle.isPending}
          className={`${pillClass(hidden ? "primary" : "glass")} disabled:cursor-wait`}
        >
          {toggle.isPending && (
            <span aria-hidden className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          )}
          {label}
        </button>
        <span className="v2-note v2-mono">signing as {shortAddress(viewer)}</span>
      </div>
    );
  }

  return (
    <div className="v2-card v2-card--roomy stats-hide">
      <div>
        <Kicker>Your Chog, your call</Kicker>
        <h2 className="v2-h2 mt-3">Hide my Chog</h2>
        <p className="v2-body mt-3 text-pretty">
          Every Chog Genesis NFT plays in Animr by default. If you hold one and would rather it didn&apos;t, hide it: it
          leaves the League, the Daily Bell&apos;s calls and showcases, Versus, replays and share cards. It takes one free
          signature (no transaction, no gas, no approval), and you can show it again any time.
        </p>
      </div>

      <div className="stats-hide-form">
        {fixedId === undefined && (
          <div className="v2-field">
            <label htmlFor={inputId} className="v2-label">
              {nameNumbers?.length ? "Token ID or name" : "Chog token ID"}
            </label>
            <input
              id={inputId}
              autoComplete="off"
              placeholder={nameNumbers?.length ? "7 or CHOG #1462" : `${min}–${max}`}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                toggle.reset();
              }}
              aria-invalid={typed.problem ? true : undefined}
              className="v2-input v2-mono max-w-72"
            />
          </div>
        )}

        {tokenId !== null && fixedId === undefined && (
          <p className="text-[length:var(--v2-fs-sm)] text-[var(--v2-nav)]">
            Checking <span className="font-medium text-[var(--v2-ink)]">{name(tokenId)}</span>
            {typed.other && (
              <>
                {" · "}
                <button
                  type="button"
                  onClick={() => {
                    setDraft(typed.other!.via === "name" ? `CHOG #${typed.other!.nameNumber}` : String(typed.other!.tokenId));
                    toggle.reset();
                  }}
                  className="v2-link"
                >
                  Meant {chogLabel(typed.other.tokenId, { number: typed.other.nameNumber || null })}?
                </button>
              </>
            )}
          </p>
        )}
        {tokenId !== null && (
          <div aria-live="polite" className="text-[length:var(--v2-fs-sm)]">
            {status.isPending ? (
              <span className="text-[var(--v2-faint)]">Checking {name(tokenId)}…</span>
            ) : status.isError ? (
              <span className="text-[var(--v2-danger)]">
                Couldn&apos;t check {name(tokenId)}: {status.error.message}{" "}
                <button type="button" onClick={() => status.refetch()} className="v2-link">
                  Retry
                </button>
              </span>
            ) : hidden ? (
              <Badge tone="warning" dot>
                Hidden by its holder{status.data.since ? ` since ${formatDay(status.data.since.slice(0, 10))}` : ""}
              </Badge>
            ) : (
              <Badge tone="success" dot>
                Plays in Animr
              </Badge>
            )}
          </div>
        )}

        {step}

        <div aria-live="polite">
          {toggle.isError && <p className="stats-alert stats-alert--danger">{walletErrorMessage(toggle.error)}</p>}
          {done && (
            <p className="stats-alert stats-alert--success">
              {done.hidden
                ? `Done: ${name(done.tokenId)} is hidden. Animr's pages drop it as their caches refresh, usually within minutes.`
                : `Done: ${name(done.tokenId)} plays in Animr again.`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="text-[length:var(--v2-fs-sm)] leading-relaxed text-pretty text-[var(--v2-nav)]">{children}</p>;
}
