export interface CitationPromptParams {
  answer: string;
  sources: Array<{
    index: number;
    url: string;
    title: string;
  }>;
}

/**
 * Build system prompt for citation extraction and validation
 */
export function buildCitationSystemPrompt(): string {
  return `You are a citation validation assistant. Your task is to extract and validate citations from an AI-generated answer.

## Rules:
1. Extract ALL citation markers ([1], [2], [3], etc.) from the answer
2. Map each citation to its corresponding source
3. Identify which claims are supported by which sources
4. Flag any citations that don't match provided sources
5. Return structured citation data

## Output Format:
Return a JSON object with:
- citations: Array of { marker, sourceIndex, sourceUrl, sourceTitle, claims }
- uncitedClaims: Array of claims without citations
- invalidCitations: Array of citation markers that don't match any source

Be thorough and accurate.`;
}

/**
 * Build user prompt for citation extraction
 */
export function buildCitationUserPrompt(params: CitationPromptParams): string {
  const { answer, sources } = params;

  const sourcesList = sources
    .map((s) => `[${s.index}] ${s.title} - ${s.url}`)
    .join('\n');

  return `# Answer Text
${answer}

# Available Sources
${sourcesList}

# Task
Extract and validate all citations from the answer text. Map each citation marker to its source and identify the claims it supports.

Return a JSON object with the citation analysis.`;
}

/**
 * Build messages for citation extraction
 */
export function buildCitationMessages(params: CitationPromptParams): Array<{
  role: 'system' | 'user' | 'assistant';
  content: string;
}> {
  return [
    {
      role: 'system',
      content: buildCitationSystemPrompt(),
    },
    {
      role: 'user',
      content: buildCitationUserPrompt(params),
    },
  ];
}
