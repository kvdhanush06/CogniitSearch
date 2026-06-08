import { z } from 'zod';
import { logger } from '../config/logger.js';
import { groqChatClient } from '../integrations/groq/groq.chat.js';
import { env } from '../config/env.js';
import type { BuiltContext } from './search.types.js';

const followUpsSchema = z.object({
  questions: z.array(z.string().min(5).max(160)).min(3).max(5),
});

export interface FollowUpsResult {
  questions: string[];
  duration: number;
  model: string;
}

const SYSTEM_PROMPT = `You generate short, focused follow-up questions for an AI answer engine.

Rules:
- Exactly 3 questions, each a single line, no bullet markers.
- Each question is a natural follow-up a curious user would type next.
- The question must be answerable by the same kind of web search that produced the source material.
- No preamble, no numbering, no quotes — return ONLY the JSON object.

Output format (JSON only, no markdown fence):
{"questions":["...","...","..."]}`;

function buildUserPrompt(query: string, answer: string): string {
  // Truncate to keep the follow-up prompt small (it costs tokens).
  const trimmed = answer.length > 1200 ? `${answer.slice(0, 1200)}…` : answer;
  return `Original question: ${query}

Answer that was given:
${trimmed}

Return 3 follow-up questions as JSON.`;
}

/**
 * Generate 3 follow-up questions after the main answer.
 *
 * Uses a small, cheap model (`llama-3.1-8b-instant`) with low max_tokens
 * and `response_format: { type: 'json_object' }` to keep latency and
 * cost low. Falls back to a deterministic empty list on any parse error
 * — the user should never see a hard failure for follow-ups.
 */
export class FollowUpsService {
  async generate(query: string, answer: string, _context: BuiltContext): Promise<FollowUpsResult> {
    const start = Date.now();
    const model = env.GROQ_FOLLOWUP_MODEL || 'llama-3.1-8b-instant';
    try {
      const response = await groqChatClient.complete({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(query, answer) },
        ],
        temperature: 0.7,
        maxTokens: 200,
        // OpenAI-compatible JSON mode.
        responseFormat: { type: 'json_object' },
      });
      const text = response.choices[0]?.message.content ?? '';
      let parsed: { questions: string[] };
      try {
        parsed = followUpsSchema.parse(JSON.parse(text));
      } catch (parseErr) {
        logger.warn(
          { err: parseErr, model, raw: text.slice(0, 200) },
          'Follow-up response failed validation; returning empty list',
        );
        return { questions: [], duration: Date.now() - start, model };
      }
      return { questions: parsed.questions, duration: Date.now() - start, model };
    } catch (err) {
      logger.warn({ err, model }, 'Follow-up generation failed; returning empty list');
      return { questions: [], duration: Date.now() - start, model };
    }
  }
}

export const followUpsService = new FollowUpsService();
