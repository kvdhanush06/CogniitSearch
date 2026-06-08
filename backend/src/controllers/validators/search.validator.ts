import { z } from 'zod';

// Search request validation
export const searchRequestSchema = z.object({
  query: z.string().min(1, 'Query is required').max(500, 'Query too long'),
  maxResults: z.number().int().min(1).max(50).optional(),
  language: z.string().optional(),
  region: z.string().optional(),
  safeSearch: z.boolean().optional(),
  freshness: z.enum(['day', 'week', 'month', 'none']).optional(),
  enableCrawl: z.boolean().optional(),
  enableRanking: z.boolean().optional(),
});

export type SearchRequest = z.infer<typeof searchRequestSchema>;

// Chat request validation
export const chatRequestSchema = z.object({
  query: z.string().min(1, 'Query is required').max(500, 'Query too long'),
  conversationId: z.string().uuid().optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(100).max(8192).optional(),
  stream: z.boolean().optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(['system', 'user', 'assistant']),
        content: z.string(),
      }),
    )
    .optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

// Conversation params validation
export const conversationParamsSchema = z.object({
  id: z.string().uuid('Invalid conversation ID format'),
});

export type ConversationParams = z.infer<typeof conversationParamsSchema>;

// Reattach stream params: nested resource /conversations/:id/messages/:messageId/stream.
// `id` is the conversation (uuid), `messageId` is the user message id. We accept
// any non-empty string for messageId to match the Supabase `id` column type
// (uuid in the standard migration, but the schema is not validated here).
export const reattachStreamParamsSchema = z.object({
  id: z.string().uuid('Invalid conversation ID format'),
  messageId: z.string().min(1, 'messageId is required'),
});

export type ReattachStreamParams = z.infer<typeof reattachStreamParamsSchema>;

// Common response schemas
export const paginationSchema = z.object({
  page: z.number().int().min(1),
  limit: z.number().int().min(1).max(100),
  total: z.number(),
  hasMore: z.boolean(),
});

export const errorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    message: z.string(),
    code: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
});
