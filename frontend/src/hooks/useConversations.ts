import { useCallback, useEffect, useState } from 'react';
import { conversationsApi } from '@/api';
import type {
  ConversationListItem,
  ConversationDetail,
} from '@/api';

interface UseConversationsReturn {
  conversations: ConversationListItem[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  load: (id: string) => Promise<ConversationDetail | null>;
  remove: (id: string) => Promise<void>;
}

export function useConversations(): UseConversationsReturn {
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await conversationsApi.list({ limit: 50 });
      setConversations(data.conversations);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const load = useCallback(async (id: string) => {
    try {
      return await conversationsApi.get(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversation');
      return null;
    }
  }, []);

  const remove = useCallback(
    async (id: string) => {
      try {
        await conversationsApi.delete(id);
        setConversations((prev) => prev.filter((c) => c.id !== id));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete conversation');
      }
    },
    [],
  );

  return { conversations, isLoading, error, refresh, load, remove };
}
