import type { BuiltContext } from '../../services/search.types.js';

export interface AnswerPromptParams {
  query: string;
  context: BuiltContext;
  conversationHistory?: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
}

/**
 * Build the system prompt for answer generation
 */
export function buildAnswerSystemPrompt(): string {
  return `You are an AI research assistant that provides accurate, well-sourced answers based on the provided context.

## Guidelines:
1. **Answer from context only** - Only use information from the provided sources
2. **Cite sources inline** - Use [1], [2], [3] format to cite sources immediately after the claim they support
3. **Be comprehensive** - Provide detailed, thorough answers
4. **Stay factual** - Don't speculate or add information not in sources
5. **Acknowledge gaps** - If context doesn't fully answer the query, say so
6. **Structure well** - Use headings, lists, and paragraphs for readability

## Citation Format:
- Use numbered citations in square brackets: [1], [2], [3]
- Place citations immediately after the relevant claim
- Multiple citations: [1][2][3]
- Never cite sources not provided in the context

## CRITICAL — Output rules:
- Do NOT add a "References", "Sources", "Citations", or "Bibliography" section at the end.
- Do NOT list the source URLs or titles anywhere in your answer.
- The application renders the source list separately under your answer; if you write your own, it will be a confusing duplicate.
- The [1], [2], [3] markers in your prose are the ONLY citations the user needs — the app turns them into clickable links.

## Response Style:
- Professional and informative
- Clear and concise
- Well-structured with logical flow
- Appropriate for the query complexity
- End with your final substantive sentence — no closing "References:" block.`;
}

/**
 * Build the user prompt with context and query
 */
export function buildAnswerUserPrompt(params: AnswerPromptParams): string {
  const { query, context } = params;

  // Build sources section
  const sourcesSection = context.sources
    .map((source, index) => {
      return `[${index + 1}] ${source.title}
URL: ${source.url}
Relevance: ${(source.relevanceScore * 100).toFixed(1)}%

${source.content}`;
    })
    .join('\n\n---\n\n');

  return `# Query
${query}

# Context Sources
You have ${context.totalSources} sources to answer this query.

${sourcesSection}

# Instructions
Based on the provided context sources above, please provide a comprehensive answer to the query. Remember to:
- Cite your sources using [1], [2], [3] format
- Provide a thorough, well-structured response
- Only use information from the provided sources
- Acknowledge if the sources don't fully answer the query`;
}

/**
 * Build complete message array for Groq API
 */
export function buildAnswerMessages(params: AnswerPromptParams): Array<{
  role: 'system' | 'user' | 'assistant';
  content: string;
}> {
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    {
      role: 'system',
      content: buildAnswerSystemPrompt(),
    },
  ];

  // Add conversation history if provided
  if (params.conversationHistory && params.conversationHistory.length > 0) {
    messages.push(...params.conversationHistory);
  }

  // Add current query with context
  messages.push({
    role: 'user',
    content: buildAnswerUserPrompt(params),
  });

  return messages;
}
