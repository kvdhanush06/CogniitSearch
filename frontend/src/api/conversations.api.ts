import { apiClient } from './client.js';

export interface ConversationListItem {
  id: string;
  user_id: string;
  title: string;
  query: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: string;
  updated_at: string;
}

export interface ConversationPagination {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export interface ConversationListResponse {
  conversations: ConversationListItem[];
  pagination: ConversationPagination;
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sources?: Array<{ url: string; title: string; snippet?: string }> | null;
  model?: string | null;
  createdAt: string;
}

export interface ConversationDetail {
  id: string;
  title: string;
  query: string;
  status: ConversationListItem['status'];
  createdAt: string;
  updatedAt: string;
  messages: ConversationMessage[];
}

export class ConversationListService {
  async list(opts: { limit?: number; offset?: number } = {}): Promise<ConversationListResponse> {
    return apiClient.get<ConversationListResponse>('/conversations', {
      limit: opts.limit ?? 20,
      offset: opts.offset ?? 0,
    });
  }

  async get(id: string): Promise<ConversationDetail> {
    return apiClient.get<ConversationDetail>(`/conversations/${id}`);
  }

  async delete(id: string): Promise<void> {
    return apiClient.delete<void>(`/conversations/${id}`);
  }
}

export const conversationsApi = new ConversationListService();
