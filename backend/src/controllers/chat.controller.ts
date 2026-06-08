import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';
import { searchService } from '../services/search.service.js';
import { answerService } from '../services/answer.service.js';
import { Orchestrator } from '../services/orchestrator.service.js';
import { followUpsService } from '../services/followups.service.js';
import { titleService } from '../services/title.service.js';
import { conversationRepository, messageRepository, userRepository } from '../repositories/index.js';
import type { ChatRequest } from '../controllers/validators/index.js';

/**
 * POST /chat
 *
 * Two paths, both producing the same SSE protocol:
 *   USE_BULLMQ=false → synchronous inline pipeline (legacy / fallback).
 *   USE_BULLMQ=true  → Orchestrator service fans out to search → crawl
 *                      → answer workers; progress + answer chunks are
 *                      forwarded to the SSE response.
 */
export async function chat(req: Request, res: Response): Promise<void> {
  try {
    const {
      query,
      conversationId,
      model,
      temperature,
      maxTokens,
      stream,
      messages,
    } = req.body as ChatRequest;
    const userId = req.user?.id ?? (req.headers['x-user-id'] as string) ?? 'anonymous';

    logger.info({ query, userId, stream, useBullMQ: env.USE_BULLMQ }, 'Chat request received');

    if (stream === false) {
      // Non-streaming JSON path. Always runs synchronously regardless of
      // USE_BULLMQ. The result shape matches the legacy contract.
      const searchResult = await searchService.executePipeline(query, userId);
      const answer = await answerService.generateAnswer(
        query,
        searchResult.context,
        { model, temperature, maxTokens, enableCitationValidation: true },
        messages,
      );
      const fu = await followUpsService
        .generate(query, answer.answer, searchResult.context)
        .catch(() => ({ questions: [] as string[], duration: 0, model: '' }));
      res.status(StatusCodes.OK).json({
        success: true,
        data: {
          query: answer.query,
          answer: answer.answer,
          citations: answer.citations,
          sources: answer.sources,
          followUps: fu.questions,
          model: answer.model,
          usage: answer.usage,
          searchMetadata: searchResult.metadata,
          answerMetadata: answer.metadata,
        },
      });
      return;
    }

    // Streaming path. Set SSE headers.
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
    res.flushHeaders();

    const write = (payload: unknown): void => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    if (env.USE_BULLMQ) {
      await runAsyncPipeline({
        res,
        write,
        userId,
        query,
        conversationId,
        model,
        temperature,
        maxTokens,
      });
    } else {
      await runSyncPipeline({
        res,
        write,
        userId,
        query,
        model,
        temperature,
        maxTokens,
        messages,
        conversationId,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Chat failed';
    logger.error({ err: message }, 'Chat request failed');
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: message })}\n\n`);
      res.end();
      return;
    }
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { message, code: 'CHAT_ERROR' },
    });
  }
}

// ---------------------------------------------------------------------------
// Async path: orchestrator drives the BullMQ pipeline.

async function runAsyncPipeline(opts: {
  res: Response;
  write: (payload: unknown) => void;
  userId: string;
  query: string;
  conversationId?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<void> {
  const { res, write, userId, query, conversationId, model, temperature, maxTokens } = opts;

  // Persist the user message immediately so the conversation is durable
  // even if the user disconnects mid-pipeline.
  let convId = conversationId;
  try {
    convId = await ensureConversation({ existingId: conversationId, userId, query });
  } catch (err) {
    logger.warn({ err }, 'Failed to ensure conversation; continuing anonymously');
    convId = conversationId;
  }
  if (convId) {
    // Emit the conversation id (and the freshly-persisted user message
    // id) as the very first SSE chunk. The SPA uses the conversation
    // id to thread follow-ups, and the message id to scope the
    // reattach endpoint + the frontend's chat session store entry.
    let userMessageId: string | undefined;
    try {
      const created = await messageRepository.create({
        conversation_id: convId,
        role: 'user',
        content: query,
      });
      userMessageId = created.id;
    } catch (err) {
      logger.warn({ err }, 'Failed to persist user message; continuing');
    }
    write({ type: 'conversation', conversationId: convId, messageId: userMessageId });
    // Stash the id on the closure so the orchestrator.run call below
    // (which lives further down) can read it. We attach it as a
    // side-channel rather than threading a new param to keep the
    // orchestrator's run() signature stable.
    (opts as { _userMessageId?: string })._userMessageId = userMessageId;
  }

  // Fetch prior messages so the LLM has memory of what was already
  // discussed in this conversation. Limit to the most recent N pairs
  // to keep the prompt under Groq's request size limit. The message
  // we just persisted is included so the LLM sees the current query
  // in chronological order with prior context.
  const HISTORY_LIMIT = 12; // ~6 user/assistant pairs
  let conversationHistory: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
  if (convId) {
    try {
      const prior = await messageRepository.findByConversationId(convId);
      conversationHistory = prior
        .filter((m) => m.role !== 'system')
        .filter((m) => m.content && m.content.trim().length > 0)
        // The current user message is already at the end of `prior`; the
        // answer worker re-appends the current query via the user prompt
        // builder, so drop the last entry to avoid duplication.
        .slice(0, -1)
        .slice(-HISTORY_LIMIT)
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          // Cap each historical turn to 1500 chars so a long prior
          // answer doesn't blow up the prompt size for follow-ups.
          content: m.content.length > 1500 ? `${m.content.slice(0, 1500)}…` : m.content,
        }));
    } catch (err) {
      logger.warn({ err }, 'Failed to load conversation history; continuing without memory');
    }
  }

  // Accumulate streamed answer text so we can persist the full body in
  // `onComplete` (so loading the conversation later replays correctly).
  let streamedAnswer = '';
  const writeAndCapture = (payload: unknown): void => {
    if (
      payload &&
      typeof payload === 'object' &&
      (payload as { type?: string }).type === 'content'
    ) {
      const content = (payload as { content?: string }).content;
      if (typeof content === 'string') streamedAnswer += content;
    }
    write(payload);
  };

  const orchestrator = new Orchestrator(writeAndCapture, async (result) => {
    if (!convId) return;
    if (!result.ok) return;
    // Persist the assistant's final message + sources.
    try {
      await messageRepository.create({
        conversation_id: convId,
        role: 'assistant',
        content: streamedAnswer,
        sources: (result.sources ?? []).map((s) => ({
          url: s.url,
          title: s.title,
          snippet: '',
        })),
        model: env.GROQ_MODEL,
      });
    } catch (err) {
      logger.warn({ err }, 'Failed to persist assistant message');
    }
  });

  // Cancel the orchestrator if the client disconnects.
  let cancelled = false;
  res.on('close', () => {
    if (!cancelled) {
      cancelled = true;
      orchestrator.cancel();
      logger.info({ userId, query }, 'Client disconnected; cancelling orchestrator');
    }
  });

  await orchestrator.run({
    userId,
    query,
    conversationId: convId,
    messageId: (opts as { _userMessageId?: string })._userMessageId,
    model,
    temperature,
    maxTokens,
    messages: conversationHistory,
  }).catch((err) => {
    const stack = err instanceof Error ? err.stack : undefined;
    logger.error({ err: err instanceof Error ? err.message : String(err), stack }, 'Orchestrator.run threw at chat controller boundary');
  });
  res.end();
}

// ---------------------------------------------------------------------------
// Sync path: legacy / fallback. Runs the pipeline inline.

async function runSyncPipeline(opts: {
  res: Response;
  write: (payload: unknown) => void;
  userId: string;
  query: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  messages?: ChatRequest['messages'];
  conversationId?: string;
}): Promise<void> {
  const { res, write, userId, query, model, temperature, maxTokens, messages, conversationId } = opts;

  let convId = conversationId;
  try {
    convId = await ensureConversation({ existingId: conversationId, userId, query });
  } catch (err) {
    logger.warn({ err }, 'ensureConversation failed in sync path');
  }

  try {
    write({ type: 'progress', stage: 'search', message: 'Searching the web…', ratio: 0 });
    const pipeline = await searchService.executePipeline(query, userId);
    write({
      type: 'progress',
      stage: 'rank',
      message: `Found ${pipeline.rankedResults.length} sources`,
      count: pipeline.rankedResults.length,
      ratio: 0.2,
    });
    write({ type: 'progress', stage: 'context', message: 'Composing context…', ratio: 0.4 });

    let fullAnswer = '';
    write({ type: 'progress', stage: 'answer', message: 'Generating answer…', ratio: 0.6 });
    for await (const chunk of answerService.generateAnswerStream(
      query,
      pipeline.context,
      {
        model,
        temperature,
        maxTokens,
        enableStreaming: true,
        enableCitationValidation: true,
      },
      messages,
    )) {
      if (chunk.type === 'content' && chunk.content) {
        fullAnswer += chunk.content;
        write({ type: 'content', content: chunk.content });
      } else if (chunk.type === 'done' && chunk.content) {
        write({ type: 'done', content: chunk.content });
      } else if (chunk.type === 'error') {
        write({ type: 'error', error: chunk.error ?? 'Answer failed' });
        res.end();
        return;
      }
    }
    write({ type: 'progress', stage: 'citation', message: 'Citations ready', ratio: 0.85 });

    // Follow-up generation (cheap small model).
    try {
      const fu = await followUpsService.generate(query, fullAnswer, pipeline.context);
      if (fu.questions.length > 0) {
        write({ type: 'follow_ups', questions: fu.questions });
      }
    } catch (err) {
      logger.warn({ err }, 'Follow-up generation failed in sync path');
    }

    // Persist both messages.
    if (convId) {
      try {
        await messageRepository.create({ conversation_id: convId, role: 'user', content: query });
        await messageRepository.create({
          conversation_id: convId,
          role: 'assistant',
          content: fullAnswer,
          sources: pipeline.context.sources.map((s) => ({
            url: s.url,
            title: s.title,
            snippet: '',
          })),
          model: env.GROQ_MODEL,
        });
      } catch (err) {
        logger.warn({ err }, 'Persist messages failed in sync path');
      }
    }

    res.end();
  } catch (err) {
    logger.error({ err }, 'Sync streaming failed');
    write({ type: 'error', error: err instanceof Error ? err.message : 'Stream failed' });
    res.end();
  }
}

// ---------------------------------------------------------------------------
// Shared helpers.

async function ensureConversation(opts: {
  existingId?: string;
  userId: string;
  query: string;
}): Promise<string> {
  if (opts.existingId) return opts.existingId;
  if (opts.userId !== 'anonymous') {
    try {
      const existing = await userRepository.findById(opts.userId);
      if (!existing) {
        await userRepository.create({
          id: opts.userId,
          email: `${opts.userId}@unknown.local`,
        });
      }
    } catch {
      // Supabase schema may not be migrated yet
    }
  }
  // Generate a short title (3-5 words) via a cheap LLM call. Falls
  // back to a truncated query if the call fails — so we never block
  // conversation creation on the title.
  const title = await titleService.generate(opts.query);
  const conv = await conversationRepository.create({
    user_id: opts.userId,
    title,
    query: opts.query,
    status: 'completed',
  });
  return conv.id;
}
