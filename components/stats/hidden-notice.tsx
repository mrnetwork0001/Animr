import { GlassCard, Kicker, PillLink } from "@/components/v2";

/**
 * Shown in place of a Chog's DNA, replays, Bell call and cards once its holder has hidden it (lib/optout.ts). No hooks
 * and no server imports: safe in server and client components. Never names or blames the holder. `label` names the
 * Chog the way its page does ("CHOG #1463 · token 2"); without it, "Token 2".
 */
export function HiddenChogNotice({ tokenId, label, className = "" }: { tokenId: number; label?: string; className?: string }) {
  return (
    <GlassCard padding="roomy" className={className}>
      <Kicker>Hidden by its holder</Kicker>
      <h2 className="v2-h3 mt-2">{label ?? `Token ${tokenId}`} is sitting this one out</h2>
      <p className="v2-body mt-2 max-w-prose text-pretty">
        Its holder chose to keep it out of Animr&apos;s public pages, so its trading DNA, replays, Bell calls and share
        cards don&apos;t show here. The other Chogs still play.
      </p>
      <div className="v2-row mt-5">
        <PillLink href="/league" variant="glass">
          Meet the League
        </PillLink>
        <PillLink href="/stats#hide" variant="ghost">
          Hold it? Show it again
        </PillLink>
      </div>
    </GlassCard>
  );
}
