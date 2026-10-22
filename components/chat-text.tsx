import type { ReactNode } from "react";

// Models sometimes answer with light markdown even when told not to: "*gasp*", "**no**", "_really_". Chat bubbles
// render those marks as emphasis instead of printing the asterisks; a lone "*" or "_" stays as typed.
const MARKS = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|_[^_\n]+_)/g;

/** A model's reply as inline React: **bold** and *italic* marks become <strong> and <em>; everything else is text. */
export function ChatText({ text }: { text: string }): ReactNode {
  return text.split(MARKS).map((part, index) => {
    if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.length > 2 && ((part.startsWith("*") && part.endsWith("*")) || (part.startsWith("_") && part.endsWith("_")))) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}
