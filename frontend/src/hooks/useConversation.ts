import { useState } from 'react';
import { conversationApi } from '../api/index.js';
import type { Conversation } from '../api/index.js';
import { useChatStore } from '../store/index.js';

interface UseConversationReturn {
  fetchConversation: (id: string) => Promise<Conversation>;
  isLoading: boolean;
  error: string | null;
}

export function useConversation(): UseConversationReturn {
  const { setCurrentConversation, setMessages } = useChatStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setErrorState] = useState<string | null>(null);

  const fetchConversation = async (id: string): Promise<Conversation> => {
    try {
      setIsLoading(true);
      setErrorState(null);

      const conversation = await conversationApi.getConversation(id);

      setCurrentConversation(conversation);
      setMessages(conversation.messages);

      return conversation;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch conversation';
      setErrorState(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    fetchConversation,
    isLoading,
    error: error,
  };
}
