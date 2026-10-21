import Link from "next/link";

/**
 * Shown in place of a Chog's DNA, replays, Bell call and cards once its holder has hidden it (lib/optout.ts). No hooks
 * and no server imports: safe in server and client components. Never names or blames the holder. `label` names the
 * Chog the way its page does ("CHOG #1463 · token 2"); without it, "Token 2".
 */
export function HiddenChogNotice({ tokenId, label, className = "" }: { tokenId: number; label?: string; className?: string }) {
  return (
    <div className={`card p-5 sm:p-6 ${className}`}>
      <p className="eyebrow">Hidden by its holder</p>
      <h2 className="mt-1.5 text-lg font-semibold tracking-tight">{label ?? `Token ${tokenId}`} is sitting this one out</h2>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-pretty text-muted">
        Its holder chose to keep it out of Animr&apos;s public pages, so its trading DNA, replays, Bell calls and share
        cards don&apos;t show here. The other Chogs still play.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/league" className="btn btn-secondary">
          Meet the League
        </Link>
        <Link href="/stats#hide" className="btn btn-ghost">
          Hold it? Show it again
        </Link>
      </div>
    </div>
  );
}
