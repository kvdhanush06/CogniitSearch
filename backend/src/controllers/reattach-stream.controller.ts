import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { logger } from '../config/logger.js';
import { conversationRepository, messageRepository } from '../repositories/index.js';
import { streamSessionRegistry } from '../services/stream-session.registry.js';
import { StreamSubscriber } from '../services/stream.subscriber.js';
import type { StreamChunk } from '../services/stream.types.js';
// Side-effect import: the global `Express.Request.user` augmentation
// lives in this file. Without importing it, `req.user` is typed as
// `any` in this controller.
import '../middleware/auth.middleware.js';

/**
 * GET /conversations/:id/messages/:messageId/stream
 *
 * Reattach to a live or completed answer stream for a given user
 * message. Two paths:
 *
 *  1. The orchestrator's answer job is still running (Redis
 *     `cogniit:stream-key:<conv>:<msg>` is set). We subscribe to the
 *     per-job stream channel and pipe every chunk to this SSE
 *     response. When the worker emits `done`/`error` we close.
 *
 *  2. The live job is gone (orchestrator finished, TTL expired, or
 *     hard reload after the response). We re-emit the persisted
 *     assistant message as a single `content` chunk + a `done` chunk
 *     with the saved sources, so the client always sees a complete
 *     response — no spinner, no missing-message flash.
 *
 * The endpoint is auth-aware: if the conversation belongs to a user,
 * the caller must be that user.
 */
export async function reattachStream(req: Request, res: Response): Promise<void> {
  const { id: conversationId, messageId } = req.params as {
    id: string;
    messageId: string;
  };

  // Auth: only the conversation's owner can reattach. Anonymous
  // conversations (user_id = 'anonymous' on the conversation row)
  // can't be reached this way — the user must already hold the
  // conversation id, but we still 404 anonymous rows to avoid
  // leaking their existence to other anonymous callers.
  try {
    const conversation = await conversationRepository.findById(conversationId);
    if (!conversation || conversation.user_id === 'anonymous') {
      res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        error: { message: 'Conversation not found', code: 'CONVERSATION_NOT_FOUND' },
      });
      return;
    }
    if (req.user && conversation.user_id !== req.user.id) {
      res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        error: { message: 'Not your conversation', code: 'FORBIDDEN' },
      });
      return;
    }
  } catch (err) {
    logger.error({ err, conversationId }, 'reattachStream: conversation lookup failed');
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { message: 'Reattach failed', code: 'REATTACH_ERROR' },
    });
    return;
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const write = (payload: StreamChunk): void => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  // The user message id is the request's `messageId`. The persisted
  // assistant message is the one immediately after it.
  // We use findByConversationId and look up the pair locally — that
  // way we don't need a dedicated repository method.
  let assistantMessage: Awaited<ReturnType<typeof messageRepository.findByConversationId>>[number] | null =
    null;
  try {
    const all = await messageRepository.findByConversationId(conversationId);
    const idx = all.findIndex((m) => m.id === messageId);
    if (idx >= 0 && idx + 1 < all.length && all[idx + 1].role === 'assistant') {
      assistantMessage = all[idx + 1];
    }
  } catch (err) {
    logger.warn({ err, conversationId, messageId }, 'reattachStream: message lookup failed');
  }

  // Path 1: live answer job
  const liveJobId = await streamSessionRegistry.lookup(conversationId, messageId);
  if (liveJobId) {
    logger.info(
      { conversationId, messageId, liveJobId },
      'reattachStream: reattaching to live answer stream',
    );
    // Replay the persisted assistant message (if any) first so the
    // client sees whatever landed before the reattach. The live
    // stream below may emit the same content again — the client
    // appends. This is the "I reloaded at the 30% mark" path.
    if (assistantMessage) {
      write({ type: 'content', content: assistantMessage.content });
    }

    const subscriber = new StreamSubscriber();
    let closed = false;
    const cleanup = async (): Promise<void> => {
      if (closed) return;
      closed = true;
      try {
        await subscriber.close();
      } catch {
        // ignore
      }
      if (!res.writableEnded) res.end();
    };

    res.on('close', () => {
      void cleanup();
    });

    try {
      await subscriber.subscribe(liveJobId, (chunk) => {
        if (res.writableEnded) return;
        write(chunk);
        if (chunk.type === 'done' || chunk.type === 'error') {
          void cleanup();
        }
      });
    } catch (err) {
      logger.error({ err, liveJobId }, 'reattachStream: live subscribe failed');
      write({ type: 'error', error: 'Reattach failed' });
      void cleanup();
    }
    return;
  }

  // Path 2: completed/orchestrator-gone. Replay the persisted
  // assistant message and close. If there's no assistant message
  // (e.g. the user just submitted and the orchestrator hadn't
  // started yet), emit a `done` with no content so the client
  // stops its loading state.
  logger.info(
    { conversationId, messageId, hasPersisted: !!assistantMessage },
    'reattachStream: no live job; replaying persisted message',
  );
  if (assistantMessage) {
    write({ type: 'content', content: assistantMessage.content });
    if (assistantMessage.sources && assistantMessage.sources.length > 0) {
      const sources = assistantMessage.sources.map((s) => ({
        url: s.url,
        title: s.title,
        relevanceScore: 0,
        citationCount: 0,
        claims: [],
      }));
      write({ type: 'done', content: JSON.stringify({ sources }) });
    } else {
      write({ type: 'done', content: '' });
    }
  } else {
    write({ type: 'done', content: '' });
  }
  res.end();
}
