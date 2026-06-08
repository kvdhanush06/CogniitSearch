import { Fragment, type ReactNode } from 'react';

interface Source {
  url: string;
  title: string;
}

interface CitedAnswerProps {
  /** The assistant's answer body (may include [1], [2], [1][2] markers). */
  content: string;
  /** The sources the markers should link to. sources[0] is [1], sources[1] is [2], etc. */
  sources?: Source[];
  className?: string;
}

// Matches one citation token like [1] or [12]. We process the run [1][2][3]
// by re-matching from the lastIndex each iteration.
const CITATION_RE = /\[(\d+)\]/g;

/**
 * Renders the assistant's plain-text answer with `[N]` citation markers
 * converted into clickable superscript links to the matching source URL.
 *
 * The model's "References" section (if any leaks through despite the
 * prompt) is stripped — the SourceList component below the answer is
 * the canonical source list.
 */
export function CitedAnswer({ content, sources = [], className }: CitedAnswerProps) {
  const cleaned = stripReferencesSection(content);
  return (
    <p className={className} style={{ whiteSpace: 'pre-wrap' }}>
      {renderWithCitations(cleaned, sources)}
    </p>
  );
}

function renderWithCitations(text: string, sources: Source[]): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  CITATION_RE.lastIndex = 0;
  for (let match = CITATION_RE.exec(text); match !== null; match = CITATION_RE.exec(text)) {
    const [token, numStr] = match;
    const start = match.index;
    if (start > lastIndex) {
      nodes.push(<Fragment key={`t-${key++}`}>{text.slice(lastIndex, start)}</Fragment>);
    }
    const num = Number(numStr);
    const source = sources[num - 1];
    if (source?.url) {
      nodes.push(
        <a
          key={`c-${key++}`}
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          title={source.title || source.url}
          className="mx-0.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded bg-secondary px-1 text-[10px] font-semibold text-secondary-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
        >
          {num}
        </a>,
      );
    } else {
      // Marker references a source we don't have — leave the raw token.
      nodes.push(<Fragment key={`c-${key++}`}>{token}</Fragment>);
    }
    lastIndex = start + token.length;
  }
  if (lastIndex < text.length) {
    nodes.push(<Fragment key={`t-${key++}`}>{text.slice(lastIndex)}</Fragment>);
  }
  return nodes;
}

/**
 * If the model still emits a "References:" / "Sources:" footer despite
 * the prompt telling it not to, cut it off. We keep everything before
 * the marker so the prose itself is preserved.
 */
function stripReferencesSection(text: string): string {
  // Common variants the model uses: "References:", "**References**",
  // "## References", "Sources:", etc. Match on its own line.
  const cutMatch = text.match(/(\n+(?:#{0,6}\s*\**\s*)(References|Sources|Citations|Bibliography)\b[:\s*]*[\s\S]*$)/i);
  if (cutMatch && cutMatch.index !== undefined) {
    return text.slice(0, cutMatch.index).trimEnd();
  }
  return text;
}
