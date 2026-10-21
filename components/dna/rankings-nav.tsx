"use client";

import { Chip } from "@/components/v2/primitives";
import { useIsClient } from "../connect-button";
import { usePopulation } from "./api";
import { DEFAULT_WINDOW } from "./shared";

const LINKS = [
  { key: "league", href: "/league", label: "League" },
  { key: "traits", href: "/traits", label: "Traits" },
  { key: "live", href: "/leaderboard", label: "Claimed AIs" },
] as const;

/**
 * The League's sibling views as quiet chips: every Chog ranked, which traits win, and the Chogs whose holders claimed
 * their AI. That last tab only shows once any Chog is claimed (both pages already load the league, so it's cached).
 */
export function RankingsNav({ active }: { active: (typeof LINKS)[number]["key"] }) {
  const hydrated = useIsClient();
  const { data } = usePopulation(DEFAULT_WINDOW);
  const anyClaimed = hydrated && (data?.rows.some((row) => row.claimed) ?? false);
  return (
    <nav aria-label="Rankings" className="flex flex-wrap gap-2">
      {LINKS.filter((link) => link.key !== "live" || anyClaimed || active === "live").map((link) => (
        <Chip key={link.key} href={link.href} active={link.key === active} className="h-9 px-4 text-[13.5px]">
          {link.label}
        </Chip>
      ))}
    </nav>
  );
}
