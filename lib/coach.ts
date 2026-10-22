// The in-app guide (components/tour/coach-marks.tsx): the names its pieces share with the header. Plain constants
// and two tiny dispatchers, safe in server and client components.

/** localStorage flag: "done" once the guide has shown in this browser (a per-viewer convenience only). */
export const COACH_STORAGE_KEY = "animr:coach";

/** Fired on window to start the guide again (the header's "?" button, the hamburger's "Replay the guide"). */
export const COACH_REPLAY_EVENT = "animr:coach-replay";

/** Fired on window by the guide to open or close the hamburger panel, with detail { open }. */
export const COACH_MENU_EVENT = "animr:coach-menu";

/** The guide's root carries data-coach-root: the panel's outside-click handler leaves clicks inside it alone. */
export const COACH_ROOT_SELECTOR = "[data-coach-root]";

export type CoachMenuDetail = { open: boolean };

export function requestCoachReplay(): void {
  window.dispatchEvent(new CustomEvent(COACH_REPLAY_EVENT));
}

export function setCoachMenu(open: boolean): void {
  window.dispatchEvent(new CustomEvent<CoachMenuDetail>(COACH_MENU_EVENT, { detail: { open } }));
}

/** Whether the guide has already shown in this browser. */
export function coachSeen(): boolean {
  try {
    return window.localStorage.getItem(COACH_STORAGE_KEY) === "done";
  } catch {
    return false;
  }
}

export function markCoachSeen(): void {
  try {
    window.localStorage.setItem(COACH_STORAGE_KEY, "done");
  } catch {
    // Private mode or blocked storage: the guide still runs, it just shows again next time.
  }
}
