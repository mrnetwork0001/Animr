import type { ReactNode } from "react";

// Decorative line icons for the Daily Bell; they inherit currentColor and are hidden from screen readers.

function Icon({ className = "size-5", children }: { className?: string; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {children}
    </svg>
  );
}

export function BellIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.6 1.8H4.4L6 16.5Z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
      <path d="M12 3V2" />
    </Icon>
  );
}

export function CrownIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M3.5 8.5 8 12.5l4-7 4 7 4.5-4-2 10.5h-13l-2-10.5Z" />
      <path d="M6 21.5h12" />
    </Icon>
  );
}

export function SkullIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M12 3a8 8 0 0 0-8 8c0 2.6 1.2 4.5 3 5.6V20.5h10v-3.9c1.8-1.1 3-3 3-5.6a8 8 0 0 0-8-8Z" />
      <circle cx="9" cy="11.5" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="15" cy="11.5" r="1.6" fill="currentColor" stroke="none" />
      <path d="M10.5 20.5v-2M13.5 20.5v-2" />
    </Icon>
  );
}

export function CoinIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M14.8 9.4c-.5-.9-1.6-1.4-2.8-1.4-1.6 0-2.8.8-2.8 2s1.1 1.7 2.8 2 2.8.8 2.8 2-1.2 2-2.8 2c-1.3 0-2.4-.6-2.9-1.5" />
      <path d="M12 6.5v1.5M12 16v1.5" />
    </Icon>
  );
}

export function FlameIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M12 2.8c1 3.6 5.2 5.6 5.2 10.4a5.2 5.2 0 0 1-10.4 0c0-2.1 1-3.7 2.1-4.7.3 1.7 1.2 2.6 2.1 2.6-1-3.1 0-6.2 1-8.3Z" />
    </Icon>
  );
}
