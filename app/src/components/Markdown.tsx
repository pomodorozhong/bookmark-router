import type { ReactNode } from "react";

// Enough Markdown for issue descriptions: headings, "- " lists, paragraphs,
// **bold**, and `code`. Everything renders as text, never as HTML.
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong>
      : part.startsWith("`") && part.endsWith("`") && part.length > 2 ? <code key={i}>{part.slice(1, -1)}</code>
        : part);
}
export function Markdown({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="markdown">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        const heading = /^#{1,6}\s+(.*)$/.exec(block);
        if (heading && lines.length === 1) return <h4 key={i}>{inline(heading[1])}</h4>;
        if (lines.every((l) => /^\s*[-*]\s+/.test(l)))
          return <ul key={i}>{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*[-*]\s+/, ""))}</li>)}</ul>;
        if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l)))
          return <ol key={i}>{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*\d+[.)]\s+/, ""))}</li>)}</ol>;
        return <p key={i}>{lines.flatMap((l, j) => (j ? [<br key={`b${j}`} />, ...inline(l)] : inline(l)))}</p>;
      })}
    </div>
  );
}
