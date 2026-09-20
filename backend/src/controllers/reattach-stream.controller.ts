import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';

import { logger } from '../config/logger.js';
import { conversationRepository, messageRepository } from '../repositories/index.js';
import { streamSessionRegistry } from '../services/stream-session.registry.js';
import { StreamSubscriber } from '../services/stream.subscriber.js';
import type { StreamChunk } from '../services/stream.types.js';
import '../middleware/auth.middleware.js';

export async function reattachStream(req: Request, res: Response): Promise<void> {
  const { id: conversationId, messageId } = req.params as { id: string; messageId: string };
  const userId = req.user!.id;

  try {
    const conversation = await conversationRepository.findByIdForUser(conversationId, userId);
    if (!conversation) {
      res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        error: { message: 'Conversation not found', code: 'CONVERSATION_NOT_FOUND' },
      });
      return;
    }

    const messages = await messageRepository.findByConversationId(conversationId);
    const userMessageIndex = messages.findIndex((message) => message.id === messageId && message.role === 'user');
    if (userMessageIndex < 0) {
      res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        error: { message: 'Message not found', code: 'MESSAGE_NOT_FOUND' },
      });
      return;
    }

    let assistantMessage: (typeof messages)[number] | null = null;
    if (userMessageIndex + 1 < messages.length && messages[userMessageIndex + 1].role === 'assistant') {
      assistantMessage = messages[userMessageIndex + 1];
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const write = (payload: StreamChunk): void => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    const liveJobId = await streamSessionRegistry.lookup(conversationId, messageId);
    if (liveJobId) {
      logger.info({ conversationId, messageId, userId }, 'Reattaching to live answer stream');
      if (assistantMessage) write({ type: 'content', content: assistantMessage.content });

      const subscriber = new StreamSubscriber();
      let closed = false;
      const cleanup = async (): Promise<void> => {
        if (closed) return;
        closed = true;
        try {
          await subscriber.close();
        } catch (err) {
          logger.debug({ err, conversationId, messageId }, 'Stream subscriber cleanup failed');
        }
        if (!res.writableEnded) res.end();
      };

      res.on('close', () => void cleanup());
      try {
        await subscriber.subscribe(liveJobId, (chunk) => {
          write(chunk);
          if (chunk.type === 'done' || chunk.type === 'error') void cleanup();
        });
      } catch (err) {
        logger.error({ err, liveJobId, conversationId, messageId }, 'Live stream subscription failed');
        write({ type: 'error', error: 'Reattach failed' });
        void cleanup();
      }
      return;
    }

    if (assistantMessage) {
      write({ type: 'content', content: assistantMessage.content });
      if (assistantMessage.sources && assistantMessage.sources.length > 0) {
        const sources = assistantMessage.sources.map((source) => ({
          url: source.url,
          title: source.title,
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
  } catch (err) {
    logger.error({ err, conversationId, messageId }, 'Reattach stream failed');
    if (!res.headersSent) {
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: { message: 'Reattach failed', code: 'REATTACH_ERROR' },
      });
    } else if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Reattach failed' })}\n\n`);
      res.end();
    }
  }
}
