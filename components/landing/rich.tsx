import { Fragment } from "react";

const MARKUP = /(\*\*[^*]+\*\*|`[^`]+`)/g;

/** Renders the two inline marks content.ts may use: **bold** and `code`. Everything else is plain text. */
export function Rich({ text }: { text: string }) {
  return text.split(MARKUP).map((part, index) => {
    if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="lp-strong">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={index} className="lp-code">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}
