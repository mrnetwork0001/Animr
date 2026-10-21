"use client";

import { type ReactNode, createContext, useContext } from "react";

// A Chog is named by its persona ("Silver Whiskers") first and its marketplace number ("CHOG #1312") second, never by
// its token id. The Bell API carries the persona name; the marketplace numbers come down once from the server page
// (data/chogs.json), indexed by token id - 1 (0 when unknown).

const NameNumbers = createContext<readonly number[]>([]);

export function ChogNamesProvider({ nameNumbers, children }: { nameNumbers: readonly number[]; children: ReactNode }) {
  return <NameNumbers.Provider value={nameNumbers}>{children}</NameNumbers.Provider>;
}

/** "CHOG #1312" for a token id, or "" when its marketplace number isn't known. */
export function useChogTag(tokenId: number): string {
  const number = useContext(NameNumbers)[tokenId - 1];
  return number ? `CHOG #${number}` : "";
}

/** The one-line name: "Silver Whiskers · CHOG #1312", or whichever half is known ("a Chog" with neither). */
export function useChogTitle(tokenId: number, name?: string | null): string {
  const tag = useChogTag(tokenId);
  return [name?.trim(), tag].filter(Boolean).join(" · ") || "a Chog";
}
