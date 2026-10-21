import { getFan, withFanLock } from "../bell/fans";
import { DAY_MS, utcDay } from "../bell/rules";
import { readFan, writeFans } from "../bell/store";
import type { FanState } from "../bell/types";
import { getKv } from "../kv";
import { VERSUS_DAILY_POINTS_CAP, VERSUS_POINTS_PER_WIN } from "./rules";
import type { VersusBout, VersusPickResponse, VersusRecord } from "./types";

// VERSUS picks of the Bell's cookie fans (lib/bell/fans.ts). A correct pick adds VERSUS_POINTS_PER_WIN to the
// fan's FanState points (the same points as the Daily Bell; points only, never money), up to
// VERSUS_DAILY_POINTS_CAP a UTC day. Keys in lib/kv.ts:
//   animr:versus:pick:<fanId>:<boutId>  StoredPick, written once (SET NX: one pick per bout per fan), kept 90 days
//   animr:versus:fan:<fanId>            StoredRecord, rewritten under the fan's lock (the one rides and settlement use)
// Anyone may spectate a bout before picking it (bouts are public and shareable), so VERSUS points are capped per day.

const PICK_TTL_MS = 90 * DAY_MS;
const RECORD_TTL_MS = 365 * DAY_MS;

type Side = "a" | "b";
type StoredPick = { fighter: Side; at: number; correct: boolean };
type StoredRecord = { picks: number; correct: number; points: number; day: string; dayPoints: number };

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
  };
}

function publicRecord(record: StoredRecord): VersusRecord {
  const { picks, correct, points, dayPoints } = record;
  return { picks, correct, points, pointsToday: dayPoints, dailyCap: VERSUS_DAILY_POINTS_CAP };
}

/** The fan's VERSUS record (zeros before their first pick). */
export async function getVersusRecord(fanId: string, now = Date.now()): Promise<VersusRecord> {
  const stored = await getKv().get<StoredRecord>(VERSUS_PICK_KEYS.record(fanId));
  return publicRecord(currentRecord(stored, utcDay(now)));
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

  // Atomic: concurrent requests (or tabs) can't both take this bout's pick.
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
          const fan: FanState = (await readFan(fanId)) ?? { fanId, points: 0, streak: 0, history: [] };
          await writeFans([{ ...fan, points: fan.points + VERSUS_POINTS_PER_WIN }]);
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
