// API Client
export { apiClient, ApiClient } from './client.js';
export type { ApiResponse, ApiError } from './client.js';

// API Services
export { searchApi, SearchApiService } from './search.api.js';
export { chatApi, ChatApiService } from './chat.api.js';
export { conversationApi, ConversationApiService } from './conversation.api.js';
export { conversationsApi, ConversationListService } from './conversations.api.js';

// Types
export type {
  SearchRequest,
  SearchResult,
  SearchContext,
  SearchResponse,
} from './types.js';

export type {
  ChatRequest,
  ChatResponse,
  Citation,
  CitationAnalysis,
  SourceAttribution,
  StreamChunk,
  PipelineStage,
} from './chat.api.js';

export type { Message, Conversation } from './conversation.api.js';
export type {
  ConversationListItem,
  ConversationListResponse,
  ConversationPagination,
  ConversationDetail,
  ConversationMessage,
} from './conversations.api.js';
