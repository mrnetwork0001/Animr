import { Chip } from "@/components/v2/primitives";

const LINKS = [
  { key: "league", href: "/league", label: "The League" },
  { key: "traits", href: "/traits", label: "Trait Alpha" },
  { key: "live", href: "/leaderboard", label: "Live agents" },
] as const;

/** The League's sibling views as quiet chips: every Chog's genome, which traits win, and the live agents. */
export function RankingsNav({ active }: { active: (typeof LINKS)[number]["key"] }) {
  return (
    <nav aria-label="Rankings" className="flex flex-wrap gap-2">
      {LINKS.map((link) => (
        <Chip key={link.key} href={link.href} active={link.key === active} className="h-9 px-4 text-[13.5px]">
          {link.label}
        </Chip>
      ))}
    </nav>
  );
}
