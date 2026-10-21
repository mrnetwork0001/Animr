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
