import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { logger } from '../config/logger.js';
import {
  conversationRepository,
  messageRepository,
} from '../repositories/index.js';
import type { CreateMessageData } from '../repositories/message.repository.js';

/**
 * GET /conversations
 * List the authenticated user's conversations (most recent first).
 */
export async function listConversations(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const limit = Math.min(parseInt((req.query.limit as string) ?? '20', 10) || 20, 100);
    const offset = Math.max(parseInt((req.query.offset as string) ?? '0', 10) || 0, 0);

    const [conversations, total] = await Promise.all([
      conversationRepository.findByUserId(userId, { limit, offset }),
      conversationRepository.countByUserId(userId),
    ]);

    res.status(StatusCodes.OK).json({
      success: true,
      data: {
        conversations,
        pagination: {
          page: Math.floor(offset / limit) + 1,
          limit,
          total,
          hasMore: offset + conversations.length < total,
        },
      },
    });
  } catch (err) {
    logger.error({ err }, 'listConversations failed');
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { message: 'Failed to list conversations', code: 'CONVERSATION_ERROR' },
    });
  }
}

/**
 * GET /conversations/:id
 * Fetch a single conversation with its messages.
 */
export async function getConversationDetail(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const conversation = await conversationRepository.findById(id);
    if (!conversation) {
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
    const messages = await messageRepository.findByConversationId(id);
    res.status(StatusCodes.OK).json({
      success: true,
      data: {
        id: conversation.id,
        title: conversation.title,
        query: conversation.query,
        status: conversation.status,
        createdAt: conversation.created_at,
        updatedAt: conversation.updated_at,
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          sources: m.sources,
          model: m.model,
          createdAt: m.created_at,
        })),
      },
    });
  } catch (err) {
    logger.error({ err, id: req.params.id }, 'getConversationDetail failed');
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { message: 'Failed to fetch conversation', code: 'CONVERSATION_ERROR' },
    });
  }
}

/**
 * DELETE /conversations/:id
 * Delete a conversation and its messages.
 */
export async function deleteConversation(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const conversation = await conversationRepository.findById(id);
    if (!conversation) {
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
    await messageRepository.deleteByConversationId(id);
    await conversationRepository.delete(id);
    res.status(StatusCodes.OK).json({ success: true, data: { ok: true } });
  } catch (err) {
    logger.error({ err, id: req.params.id }, 'deleteConversation failed');
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { message: 'Failed to delete conversation', code: 'CONVERSATION_ERROR' },
    });
  }
}

/**
 * Persist a single message to the messages table. Used by the chat
 * controller after the answer stream completes. The caller is
 * responsible for ensuring the conversation exists.
 */
export async function persistMessage(
  conversationId: string,
  message: Omit<CreateMessageData, 'conversation_id'>,
): Promise<void> {
  try {
    await messageRepository.create({ ...message, conversation_id: conversationId });
  } catch (err) {
    logger.error({ err, conversationId }, 'persistMessage failed');
  }
}
