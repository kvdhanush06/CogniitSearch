import { StatusCodes } from 'http-status-codes';
import type { Request, Response } from 'express';

import { logger } from '../config/logger.js';
import { env } from '../config/env.js';
import { searchService } from '../services/search.service.js';
import { answerService } from '../services/answer.service.js';
import { Orchestrator } from '../services/orchestrator.service.js';
import { followUpsService } from '../services/followups.service.js';
import { titleService } from '../services/title.service.js';
import { conversationRepository, messageRepository, userRepository } from '../repositories/index.js';
import type { ChatRequest } from '../controllers/validators/index.js';

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
    // Never accept a client-controlled identity header for authorization,
    // persistence, rate limiting, or ownership decisions.
    const userId = req.user?.id ?? 'anonymous';

    logger.info({ query, userId, stream, useBullMQ: env.USE_BULLMQ }, 'Chat request received');

    if (conversationId && userId === 'anonymous') {
      res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        error: { message: 'Authentication required for existing conversations', code: 'UNAUTHENTICATED' },
      });
      return;
    }

    if (conversationId && userId !== 'anonymous') {
      const ownedConversation = await conversationRepository.findByIdForUser(conversationId, userId);
      if (!ownedConversation) {
        res.status(StatusCodes.NOT_FOUND).json({
          success: false,
          error: { message: 'Conversation not found', code: 'CONVERSATION_NOT_FOUND' },
        });
        return;
      }
    }

    if (stream === false) {
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

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
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
    logger.error({ err: error instanceof Error ? error.message : String(error) }, 'Chat request failed');
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Chat failed' })}\n\n`);
      res.end();
      return;
    }
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { message: 'Chat failed', code: 'CHAT_ERROR' },
    });
  }
}

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

  let convId = conversationId;
  try {
    convId = await ensureConversation({ existingId: conversationId, userId, query });
  } catch (err) {
    logger.warn({ err }, 'Failed to ensure conversation');
    convId = undefined;
  }

  if (convId) {
    let userMessageId: string | undefined;
    try {
      const created = await messageRepository.createForUser(userId, {
        conversation_id: convId,
        role: 'user',
        content: query,
      });
      userMessageId = created.id;
    } catch (err) {
      logger.warn({ err }, 'Failed to persist user message');
    }
    write({ type: 'conversation', conversationId: convId, messageId: userMessageId });
    (opts as { _userMessageId?: string })._userMessageId = userMessageId;
  }

  const HISTORY_LIMIT = 12;
  let conversationHistory: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
  if (convId) {
    try {
      const prior = await messageRepository.findByConversationId(convId);
      conversationHistory = prior
        .filter((m) => (m.role as string) !== 'system')
        .filter((m) => m.content && m.content.trim().length > 0)
        .slice(0, -1)
        .slice(-HISTORY_LIMIT)
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content.length > 1500 ? `${m.content.slice(0, 1500)}…` : m.content,
        }));
    } catch (err) {
      logger.warn({ err }, 'Failed to load conversation history; continuing without memory');
    }
  }

  let streamedAnswer = '';
  const writeAndCapture = (payload: unknown): void => {
    if (payload && typeof payload === 'object' && (payload as { type?: string }).type === 'content') {
      const content = (payload as { content?: string }).content;
      if (typeof content === 'string') streamedAnswer += content;
    }
    write(payload);
  };

  const orchestrator = new Orchestrator(writeAndCapture, async (result) => {
    if (!convId || !result.ok) return;
    try {
      await messageRepository.createForUser(userId, {
        conversation_id: convId,
        role: 'assistant',
        content: streamedAnswer,
        sources: (result.sources ?? []).map((s) => ({ url: s.url, title: s.title, snippet: '' })),
        model: env.GROQ_MODEL,
      });
    } catch (err) {
      logger.warn({ err }, 'Failed to persist assistant message');
    }
  });

  let cancelled = false;
  res.on('close', () => {
    if (!cancelled) {
      cancelled = true;
      orchestrator.cancel();
      logger.info({ userId }, 'Client disconnected; cancelling orchestrator');
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
    logger.error({ err: err instanceof Error ? err.message : String(err) }, 'Orchestrator.run failed');
  });
  res.end();
}

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
    convId = undefined;
  }

  try {
    write({ type: 'progress', stage: 'search', message: 'Searching the web…', ratio: 0 });
    const pipeline = await searchService.executePipeline(query, userId);
    write({ type: 'progress', stage: 'rank', message: `Found ${pipeline.rankedResults.length} sources`, count: pipeline.rankedResults.length, ratio: 0.2 });
    write({ type: 'progress', stage: 'context', message: 'Composing context…', ratio: 0.4 });

    let fullAnswer = '';
    write({ type: 'progress', stage: 'answer', message: 'Generating answer…', ratio: 0.6 });
    for await (const chunk of answerService.generateAnswerStream(query, pipeline.context, {
      model,
      temperature,
      maxTokens,
      enableStreaming: true,
      enableCitationValidation: true,
    }, messages)) {
      if (chunk.type === 'content' && chunk.content) {
        fullAnswer += chunk.content;
        write({ type: 'content', content: chunk.content });
      } else if (chunk.type === 'done' && chunk.content) {
        write({ type: 'done', content: chunk.content });
      } else if (chunk.type === 'error') {
        write({ type: 'error', error: 'Answer failed' });
        res.end();
        return;
      }
    }
    write({ type: 'progress', stage: 'citation', message: 'Citations ready', ratio: 0.85 });

    try {
      const fu = await followUpsService.generate(query, fullAnswer, pipeline.context);
      if (fu.questions.length > 0) write({ type: 'follow_ups', questions: fu.questions });
    } catch (err) {
      logger.warn({ err }, 'Follow-up generation failed in sync path');
    }

    if (convId) {
      try {
        await messageRepository.createForUser(userId, { conversation_id: convId, role: 'user', content: query });
        await messageRepository.createForUser(userId, {
          conversation_id: convId,
          role: 'assistant',
          content: fullAnswer,
          sources: pipeline.context.sources.map((s) => ({ url: s.url, title: s.title, snippet: '' })),
          model: env.GROQ_MODEL,
        });
      } catch (err) {
        logger.warn({ err }, 'Persist messages failed in sync path');
      }
    }

    res.end();
  } catch (err) {
    logger.error({ err }, 'Sync streaming failed');
    write({ type: 'error', error: 'Stream failed' });
    res.end();
  }
}

async function ensureConversation(opts: { existingId?: string; userId: string; query: string }): Promise<string | undefined> {
  if (opts.existingId) {
    if (opts.userId === 'anonymous') return undefined;
    const existing = await conversationRepository.findByIdForUser(opts.existingId, opts.userId);
    return existing?.id;
  }

  if (opts.userId === 'anonymous') return undefined;

  try {
    const existingUser = await userRepository.findById(opts.userId);
    if (!existingUser) {
      await userRepository.create({ id: opts.userId, email: `${opts.userId}@unknown.local` });
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to ensure user record');
    return undefined;
  }

  const title = await titleService.generate(opts.query);
  const conv = await conversationRepository.create({
    user_id: opts.userId,
    title,
    query: opts.query,
    status: 'completed',
  });
  return conv.id;
}
