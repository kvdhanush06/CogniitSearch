import { logger } from '../config/logger.js';
import { groqChatClient } from '../integrations/groq/groq.chat.js';
import { env } from '../config/env.js';

const SYSTEM_PROMPT = `You generate ultra-short titles for chat conversations.

Rules:
- Exactly 3 to 5 words.
- Title Case (capitalize main words).
- No quotes, no punctuation at the end, no emojis.
- No preamble — return ONLY the title text, nothing else.
- Capture the topic, not the question form.

Examples:
Q: "What are the biggest AI breakthroughs of 2025?"
A: AI Breakthroughs Of 2025

Q: "perplexity latest ai news"
A: Perplexity AI News

Q: "How does pgvector work in Supabase?"
A: pgvector In Supabase`;

/**
 * Generate a short (3-5 word) conversation title from the user's first
 * query. Uses the cheap follow-up model so the call is fast and low-cost.
 *
 * Falls back to a trimmed slice of the query on any failure — the user
 * should never see a hard error for a cosmetic title.
 */
export class TitleService {
  async generate(query: string): Promise<string> {
    const fallback = this.fallbackTitle(query);
    const model = env.GROQ_FOLLOWUP_MODEL || 'llama-3.1-8b-instant';
    try {
      const response = await groqChatClient.complete({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: query },
        ],
        temperature: 0.3,
        maxTokens: 30,
      });
      const raw = (response.choices?.[0]?.message?.content ?? '').trim();
      // Strip surrounding quotes if the model added them anyway.
      const stripped = raw.replace(/^['"`]|['"`]$/g, '').trim();
      // Cap at 60 chars defensively — the sidebar truncates anyway, but
      // keep the DB value tidy.
      if (!stripped) return fallback;
      return stripped.slice(0, 60);
    } catch (err) {
      logger.warn({ err, query }, 'Title generation failed; using fallback');
      return fallback;
    }
  }

  private fallbackTitle(query: string): string {
    const trimmed = query.trim();
    if (trimmed.length <= 40) return trimmed;
    return `${trimmed.slice(0, 37).trim()}…`;
  }
}

export const titleService = new TitleService();
