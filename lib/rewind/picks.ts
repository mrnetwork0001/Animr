import { getFan, withFanLock } from "../bell/fans";
import { DAY_MS, utcDay } from "../bell/rules";
import { readFan, writeFans } from "../bell/store";
import type { FanState } from "../bell/types";
import { getKv } from "../kv";
import { VERSUS_DAILY_POINTS_CAP, VERSUS_POINTS_PER_WIN } from "./rules";
import type { VersusBout, VersusPickResponse, VersusRecord } from "./types";

// VERSUS picks of the Bell's cookie fans (lib/bell/fans.ts). A correct pick earns VERSUS_POINTS_PER_WIN (the same
// points as the Daily Bell; points only, never money), up to VERSUS_DAILY_POINTS_CAP a UTC day. Keys in lib/kv.ts:
//   animr:versus:pick:<fanId>:<boutId>  StoredPick, written once (SET NX: one pick per bout per fan), kept 90 days;
//                                       watching a bout first (?spectate=1 with the fan cookie) takes that slot, so a
//                                       later pick on it earns nothing
//   animr:versus:fan:<fanId>            StoredRecord, rewritten under the fan's lock (the one rides and settlement use)
// VERSUS never creates a fan card (FanState): only a first ride or nickname does, and those are capped per network
// (lib/bell/http.ts newFanLimit). Points a cookie earns before it has a card wait in its record (`pending`) and move
// onto the card when one exists (mergeVersusPoints). Bouts are public and shareable, so points are capped per day.

const PICK_TTL_MS = 90 * DAY_MS;
const RECORD_TTL_MS = 365 * DAY_MS;

type Side = "a" | "b";
type StoredPick = { fighter: Side | null; at: number; correct: boolean; watched?: true };
type StoredRecord = {
  picks: number;
  correct: number;
  points: number;
  day: string;
  dayPoints: number;
  /** Points earned before this cookie had a fan card, not on any card yet. */
  pending?: number;
};

export const VERSUS_PICK_KEYS = {
  pick: (fanId: string, boutId: string) => `animr:versus:pick:${fanId}:${boutId}`,
  record: (fanId: string) => `animr:versus:fan:${fanId}`,
} as const;

const count = (value: unknown) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Math.floor(Number(value)) : 0);

/** The stored record, with today's points reset on a new UTC day. */
function currentRecord(stored: Partial<StoredRecord> | null, day: string): StoredRecord {
  return {
    picks: count(stored?.picks),
    correct: count(stored?.correct),
    points: count(stored?.points),
    day,
    dayPoints: stored?.day === day ? count(stored.dayPoints) : 0,
    pending: count(stored?.pending),
  };
}

function publicRecord(record: StoredRecord): VersusRecord {
  const { picks, correct, points, dayPoints, pending = 0 } = record;
  return { picks, correct, points, pointsToday: dayPoints, dailyCap: VERSUS_DAILY_POINTS_CAP, pending };
}

/** The fan's VERSUS record (zeros before their first pick). */
export async function getVersusRecord(fanId: string, now = Date.now()): Promise<VersusRecord> {
  const stored = await getKv().get<StoredRecord>(VERSUS_PICK_KEYS.record(fanId));
  return publicRecord(currentRecord(stored, utcDay(now)));
}

/**
 * The fan watched `bout` (the whole result, real dates included) before picking it: takes the bout's pick slot, so
 * a later pick on it counts as a repeat and earns nothing. A no-op when the fan already picked or watched it.
 */
export async function markWatched(fanId: string, boutId: string, now = Date.now()): Promise<void> {
  await getKv().setNx(
    VERSUS_PICK_KEYS.pick(fanId, boutId),
    { fighter: null, at: now, correct: false, watched: true } satisfies StoredPick,
    PICK_TTL_MS,
  );
}

/**
 * Moves the points a cookie earned in VERSUS before it had a fan card onto its card, once it has one (after a first
 * ride or nickname). Takes the fan's lock; a no-op without a card or pending points.
 */
export async function mergeVersusPoints(fanId: string, now = Date.now()): Promise<boolean> {
  const kv = getKv();
  const recordKey = VERSUS_PICK_KEYS.record(fanId);
  const stored = await kv.get<StoredRecord>(recordKey);
  if (!count(stored?.pending)) return false;
  return withFanLock(fanId, async () => {
    const fan = await readFan(fanId);
    const record = currentRecord(await kv.get<StoredRecord>(recordKey), utcDay(now));
    if (!fan || !record.pending) return false;
    await writeFans([{ ...fan, points: fan.points + record.pending }]);
    await kv.set(recordKey, { ...record, pending: 0 }, RECORD_TTL_MS);
    return true;
  });
}

/**
 * Records the fan's pick on `bout` (built by lib/rewind/bout.ts). The first pick per bout counts: correct when its
 * fighter won (a draw has no correct side), +10 points while under the daily cap. A repeat pick changes nothing and
 * answers `correct: null` with the original side. `first` says whether this call recorded the pick.
 * Throws BellError 409 when the fan's card is busy; the pick is then released so a retry can count.
 */
export async function recordPick(
  fanId: string,
  bout: VersusBout,
  fighter: Side,
  now = Date.now(),
): Promise<{ first: boolean; response: VersusPickResponse }> {
  const kv = getKv();
  const pickKey = VERSUS_PICK_KEYS.pick(fanId, bout.id);
  const recordKey = VERSUS_PICK_KEYS.record(fanId);
  const correct = bout.result.winner === fighter;

  // Atomic: concurrent requests (or tabs) can't both take this bout's pick. A bout the fan already watched (its
  // result seen) holds the slot too, so the pick answers as a repeat: no points.
  if (!(await kv.setNx(pickKey, { fighter, at: now, correct } satisfies StoredPick, PICK_TTL_MS))) {
    const [earlier, fan, record] = await Promise.all([kv.get<StoredPick>(pickKey), getFan(fanId), getVersusRecord(fanId, now)]);
    const pick = earlier?.fighter === "a" || earlier?.fighter === "b" ? earlier.fighter : fighter;
    return { first: false, response: { bout, correct: null, fan, awarded: 0, pick, record } };
  }

  let awarded = 0;
  let record: StoredRecord;
  try {
    record = await withFanLock(fanId, async () => {
      const next = currentRecord(await kv.get<StoredRecord>(recordKey), utcDay(now));
      next.picks++;
      if (correct) {
        next.correct++;
        if (next.dayPoints + VERSUS_POINTS_PER_WIN <= VERSUS_DAILY_POINTS_CAP) {
          // Only an existing fan card is credited (VERSUS never creates one); otherwise the points wait in the record.
          const fan: FanState | null = await readFan(fanId);
          if (fan) {
            await writeFans([{ ...fan, points: fan.points + VERSUS_POINTS_PER_WIN + (next.pending ?? 0) }]);
            next.pending = 0;
          } else {
            next.pending = (next.pending ?? 0) + VERSUS_POINTS_PER_WIN;
          }
          awarded = VERSUS_POINTS_PER_WIN;
          next.points += awarded;
          next.dayPoints += awarded;
        }
      }
      // The points are already on the fan card: a failed record write only leaves the record (and cap) behind.
      await kv
        .set(recordKey, next, RECORD_TTL_MS)
        .catch((error) => console.warn("[animr] VERSUS: couldn't store a fan's record:", (error as Error).message));
      return next;
    });
  } catch (error) {
    // Nothing was credited: release the pick so the fan can try again.
    if (!awarded) await kv.del(pickKey).catch(() => {});
    throw error;
  }
  return { first: true, response: { bout, correct, fan: await getFan(fanId), awarded, pick: fighter, record: publicRecord(record) } };
}
