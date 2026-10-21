/** A die showing five, for "Random Chog" buttons. */
export function DiceIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden fill="none">
      <rect x="2.5" y="2.5" width="15" height="15" rx="4" stroke="currentColor" strokeWidth="1.6" />
      {[
        [7, 7],
        [13, 7],
        [10, 10],
        [7, 13],
        [13, 13],
      ].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.3" fill="currentColor" />
      ))}
    </svg>
  );
}

/** Play (a rounded triangle), for Replay links and the Time Machine's play button. */
export function PlayIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden fill="currentColor">
      <path d="M6.5 4.6v10.8c0 .8.9 1.3 1.6.8l8-5.4a1 1 0 0 0 0-1.6l-8-5.4c-.7-.5-1.6 0-1.6.8Z" />
    </svg>
  );
}

/** Pause (two rounded bars). */
export function PauseIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden fill="currentColor">
      <rect x="5" y="4" width="3.6" height="12" rx="1.2" />
      <rect x="11.4" y="4" width="3.6" height="12" rx="1.2" />
    </svg>
  );
}

/** Restart (a circular arrow). */
export function RestartIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 10a5.5 5.5 0 1 0 1.7-4" />
      <path d="M4.2 3.8v3h3" />
    </svg>
  );
}

/** Back arrow for "The League" links. */
export function ArrowLeftIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 10H4.5M9 5.5 4.5 10 9 14.5" />
    </svg>
  );
}
