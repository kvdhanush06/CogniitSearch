import { apiClient } from './client.js';

// Conversation-related types
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface Conversation {
  id: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
  metadata?: {
    messageCount: number;
    title?: string;
  };
}

export class ConversationApiService {
  /**
   * Get conversation by ID
   */
  async getConversation(id: string): Promise<Conversation> {
    return apiClient.get<Conversation>(`/conversation/${id}`);
  }

  /**
   * List user conversations
   */
  async listConversations(page = 1, limit = 20): Promise<{
    conversations: Conversation[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      hasMore: boolean;
    };
  }> {
    return apiClient.get('/conversations', { page, limit });
  }

  /**
   * Delete conversation
   */
  async deleteConversation(id: string): Promise<void> {
    return apiClient.delete<void>(`/conversation/${id}`);
  }
}

export const conversationApi = new ConversationApiService();
