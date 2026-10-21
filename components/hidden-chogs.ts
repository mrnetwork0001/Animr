import { useQuery } from "@tanstack/react-query";
import type { OptOutList } from "@/lib/optout";

// The Chogs their holders hid ("Hide my Chog", lib/optout.ts), for random picks made in the browser (Random Chog,
// a random rival, VERSUS's random fighter). The server applies the same rule everywhere else (lib/visibility.ts).

const NONE: ReadonlySet<number> = new Set();

async function fetchHiddenChogs(): Promise<ReadonlySet<number>> {
  const res = await fetch("/api/optout");
  if (!res.ok) throw new Error(`Couldn't read the hidden Chogs (HTTP ${res.status}).`);
  const body = (await res.json().catch(() => null)) as Partial<OptOutList> | null;
  const ids = Array.isArray(body?.hiddenIds) ? body.hiddenIds : [];
  return new Set(ids.filter((id): id is number => Number.isSafeInteger(id)));
}

/**
 * Token ids of the Chogs their holders hid (GET /api/optout, CDN-cached ~15 s). Empty until it loads, or if it
 * can't: a random pick may then land on a hidden Chog, whose pages say so. Needs the app's QueryClientProvider.
 */
export function useHiddenChogs(): ReadonlySet<number> {
  const { data } = useQuery({
    queryKey: ["optout", "hidden-list"],
    queryFn: fetchHiddenChogs,
    staleTime: 60_000,
    retry: 1,
  });
  return data ?? NONE;
}
