import { Fragment } from "react";

const MARKUP = /(\*\*[^*]+\*\*|`[^`]+`)/g;

/** Renders the two inline marks content.ts may use: **bold** and `code`. Everything else is plain text. */
export function Rich({ text }: { text: string }) {
  return text.split(MARKUP).map((part, index) => {
    if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={index}
          className="rounded-md border border-line bg-surface-2 px-1.5 py-px font-mono text-[0.88em] text-accent-strong"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}
