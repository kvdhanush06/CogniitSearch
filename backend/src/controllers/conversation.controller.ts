import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { logger } from '../config/logger.js';
import { conversationRepository, messageRepository } from '../repositories/index.js';
import type { CreateMessageData } from '../repositories/message.repository.js';
import type { PaginationQuery } from './validators/index.js';

export async function listConversations(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const { limit, offset } = req.query as unknown as PaginationQuery;

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

export async function getConversationDetail(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const id = req.params.id as string;
    const conversation = await conversationRepository.findByIdForUser(id, userId);
    if (!conversation) {
      res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        error: { message: 'Conversation not found', code: 'CONVERSATION_NOT_FOUND' },
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

export async function deleteConversation(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const id = req.params.id as string;
    const deleted = await conversationRepository.deleteForUser(id, userId);
    if (!deleted) {
      res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        error: { message: 'Conversation not found', code: 'CONVERSATION_NOT_FOUND' },
      });
      return;
    }

    res.status(StatusCodes.OK).json({ success: true, data: { ok: true } });
  } catch (err) {
    logger.error({ err, id: req.params.id }, 'deleteConversation failed');
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { message: 'Failed to delete conversation', code: 'CONVERSATION_ERROR' },
    });
  }
}

export async function persistMessage(
  userId: string,
  conversationId: string,
  message: Omit<CreateMessageData, 'conversation_id'>,
): Promise<void> {
  try {
    await messageRepository.createForUser(userId, { ...message, conversation_id: conversationId });
  } catch (err) {
    logger.error({ err, conversationId }, 'persistMessage failed');
  }
}
