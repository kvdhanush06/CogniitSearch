import { z } from 'zod';

const strictObject = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();

export const searchRequestSchema = strictObject({
  query: z.string().trim().min(1, 'Query is required').max(500, 'Query too long'),
  maxResults: z.number().int().min(1).max(50).optional(),
  language: z.string().trim().max(20).optional(),
  region: z.string().trim().max(20).optional(),
  safeSearch: z.boolean().optional(),
  freshness: z.enum(['day', 'week', 'month', 'none']).optional(),
  enableCrawl: z.boolean().optional(),
  enableRanking: z.boolean().optional(),
});

export type SearchRequest = z.infer<typeof searchRequestSchema>;

export const chatMessageSchema = strictObject({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().trim().min(1).max(8000),
});

export const chatRequestSchema = strictObject({
  query: z.string().trim().min(1, 'Query is required').max(500, 'Query too long'),
  conversationId: z.string().uuid().optional(),
  model: z.string().trim().min(1).max(100).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(100).max(8192).optional(),
  stream: z.boolean().optional(),
  messages: z.array(chatMessageSchema).max(24).optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const conversationParamsSchema = strictObject({
  id: z.string().uuid('Invalid conversation ID format'),
});

export type ConversationParams = z.infer<typeof conversationParamsSchema>;

export const reattachStreamParamsSchema = strictObject({
  id: z.string().uuid('Invalid conversation ID format'),
  messageId: z.string().uuid('Invalid message ID format'),
});

export type ReattachStreamParams = z.infer<typeof reattachStreamParamsSchema>;

export const paginationQuerySchema = strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const errorResponseSchema = strictObject({
  success: z.literal(false),
  error: strictObject({
    message: z.string(),
    code: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
});
