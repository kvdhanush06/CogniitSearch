import { logger } from '../config/logger.js';
import { groqChatClient } from '../integrations/groq/groq.chat.js';
import { env } from '../config/env.js';

const SYSTEM_PROMPT = `You rewrite a follow-up question into a self-contained web search query.

The recent turns of the conversation and the user's latest question follow this message. Resolve pronouns ("he", "she", "they", "it", "this", "that one", "the same"), demonstratives, and short references to the entity they refer to in the prior turns. Keep entity names exactly as the user used them — do not transliterate, translate, abbreviate, or substitute a variant. Preserve the user's original language.

If the latest question is already self-contained, return it unchanged. Output a single search query — no preamble, no quotes, no bullet list, no explanation. Do not add operators, site filters, or quotation marks unless they were in the original.

Respond with JSON in this exact shape:
{"query": "<the rewritten search query>"}`;

export interface RewriteResult {
  /** The query to hand to Tinyfish. Falls back to the original on error. */
  rewritten: string;
  /** Whether the model actually ran (false = fallback path was used). */
  used: boolean;
  /** Wall-clock time of the rewrite call (0 for fallback). */
  duration: number;
  /** Model id used. Empty for fallback. */
  model: string;
}

/**
 * Rewrite a user's follow-up query into a self-contained search query by
 * resolving pronouns and references against the recent conversation. Runs
 * on the cheap follow-up model so the per-turn latency hit is small.
 *
 * Falls back to the original query on any error so a misbehaving rewrite
 * never blocks the search pipeline.
 */
export class QueryRewriteService {
  async rewrite(
    query: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [],
  ): Promise<RewriteResult> {
    const fallback: RewriteResult = {
      rewritten: query,
      used: false,
      duration: 0,
      model: '',
    };
    // If there's no history to resolve, don't burn an LLM call.
    if (messages.length === 0) return fallback;

    const model = env.GROQ_FOLLOWUP_MODEL || 'llama-3.1-8b-instant';
    const started = Date.now();

    try {
      const response = await groqChatClient.complete({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          // The user/assistant history is appended verbatim — the system
          // prompt tells the model to use it as context, not as new turns.
          ...messages,
          { role: 'user', content: query },
        ],
        temperature: 0.2,
        maxTokens: 80,
        responseFormat: { type: 'json_object' },
      });
      const raw = response.choices?.[0]?.message?.content ?? '';
      const duration = Date.now() - started;
      const rewritten = this.parseRewritten(raw, query);
      logger.debug(
        { original: query, rewritten, model, duration },
        'Query rewrite completed',
      );
      return { rewritten, used: rewritten !== query, duration, model };
    } catch (err) {
      const duration = Date.now() - started;
      logger.warn(
        { err, query, duration },
        'Query rewrite failed; using original query',
      );
      return fallback;
    }
  }

  private parseRewritten(raw: string, original: string): string {
    // The model is asked to return JSON; accept either a {"query": "..."}
    // shape or a bare string. Fall back to the original on any parse issue.
    const trimmed = raw.trim();
    if (!trimmed) return original;
    try {
      const parsed = JSON.parse(trimmed) as { query?: unknown; rewritten?: unknown };
      const candidate =
        typeof parsed.query === 'string'
          ? parsed.query
          : typeof parsed.rewritten === 'string'
            ? parsed.rewritten
            : null;
      if (candidate && candidate.trim()) return candidate.trim();
    } catch {
      // not JSON — treat the whole string as the rewritten query
      if (trimmed.length > 0 && trimmed.length < 500) return trimmed;
    }
    return original;
  }
}

export const queryRewriteService = new QueryRewriteService();
