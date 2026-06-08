import { apiClient } from './client.js';

// Chat-related types
export interface ChatRequest {
  query: string;
  conversationId?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  messages?: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
}

export interface Citation {
  marker: string;
  sourceIndex: number;
  sourceUrl: string;
  sourceTitle: string;
  claims: string[];
}

export interface CitationAnalysis {
  citations: Citation[];
  uncitedClaims: string[];
  invalidCitations: string[];
  totalCitations: number;
  uniqueSources: number;
  citationDensity: number;
}

export interface SourceAttribution {
  url: string;
  title: string;
  relevanceScore: number;
  citationCount: number;
  claims: string[];
}

export interface ChatResponse {
  query: string;
  answer: string;
  citations: CitationAnalysis;
  sources: SourceAttribution[];
  followUps?: string[];
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  searchMetadata: {
    totalResults: number;
    searchDuration: number;
    rankingDuration: number;
    crawlDuration: number;
    contextBuildDuration: number;
    totalDuration: number;
    config: Record<string, unknown>;
  };
  answerMetadata: {
    generateDuration: number;
    citationDuration: number;
    totalDuration: number;
    streamed: boolean;
  };
}

/**
 * Stream chunk types — extended for the new async pipeline.
 *
 *   content    — a piece of the assistant's answer (text delta)
 *   progress   — a pipeline stage transition with a user-facing message
 *   follow_ups — three suggested follow-up questions (sent near the end)
 *   done       — terminal chunk with citations, sources, follow-ups, timing
 *   error      — terminal chunk; the stream is unrecoverable
 */
export type PipelineStage = 'search' | 'rank' | 'crawl' | 'context' | 'answer' | 'citation';

export interface StreamChunkContent {
  type: 'content';
  content: string;
}

export interface StreamChunkProgress {
  type: 'progress';
  stage: PipelineStage;
  message: string;
  count?: number;
  ratio?: number;
}

export interface StreamChunkFollowUps {
  type: 'follow_ups';
  questions: string[];
}

export interface StreamChunkDone {
  type: 'done';
  content: string;
}

export interface StreamChunkError {
  type: 'error';
  error: string;
}

/** First chunk on every stream — carries the conversation row id (and
 *  the freshly-persisted user message id) so the SPA can thread
 *  follow-up queries into the same conversation and scope the
 *  reattach endpoint + the chat session store entry. */
export interface StreamChunkConversation {
  type: 'conversation';
  conversationId: string;
  messageId?: string;
}

export type StreamChunk =
  | StreamChunkContent
  | StreamChunkProgress
  | StreamChunkFollowUps
  | StreamChunkDone
  | StreamChunkError
  | StreamChunkConversation;

export class ChatApiService {
  /**
   * Send chat message (non-streaming)
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    return apiClient.post<ChatResponse>('/chat', { ...request, stream: false });
  }

  /**
   * Send chat message with streaming
   */
  async *chatStream(request: ChatRequest): AsyncIterableIterator<StreamChunk> {
    for await (const data of apiClient.stream('/chat', { ...request, stream: true })) {
      try {
        const chunk: StreamChunk = JSON.parse(data);
        yield chunk;
      } catch (error) {
        console.error('Failed to parse stream chunk:', error);
      }
    }
  }
}

export const chatApi = new ChatApiService();
