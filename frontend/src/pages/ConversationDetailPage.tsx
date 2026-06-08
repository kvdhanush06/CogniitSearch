import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import { useConversations, useChat } from '@/hooks';
import { ChatPage } from './ChatPage';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { ConversationDetail } from '@/api';

/**
 * Loads a persisted conversation by id and renders it inside the chat
 * page. The chat page is uncontrolled; we hand it the loaded messages
 * via URL state so the new send can append to them.
 */
export function ConversationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { load } = useConversations();
  const { reattach } = useChat();
  const navigate = useNavigate();
  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      navigate('/chat', { replace: true });
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const data = await load(id);
      if (cancelled) return;
      if (!data) {
        setError('Conversation not found');
        setLoading(false);
        return;
      }
      setConversation(data);
      setLoading(false);
      // Kick off the reattach as soon as we have the messages. The
      // last user message id is what the reattach endpoint expects.
      // The reattach is best-effort: if there's no live or recently
      // completed answer (e.g. the user opened a day-old conversation)
      // it falls through to the persisted-message replay path inside
      // the controller.
      const lastUser = data.messages
        .slice()
        .reverse()
        .find((m) => m.role === 'user');
      if (lastUser) {
        void reattach(data.id, lastUser.id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, load, navigate, reattach]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !conversation) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <h2 className="text-lg font-semibold">Could not load conversation</h2>
            <p className="text-sm text-muted-foreground">{error ?? 'Unknown error'}</p>
            <Button onClick={() => navigate('/chat')}>Start a new chat</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Reuse the chat page UI but seed it with the loaded messages. The
  // page's existing initial-render code reads the `?q=` param; we
  // push the conversation into history via `replace` so a refresh
  // re-loads it through this page.
  return (
    <ChatPage
      initialMessages={conversation.messages}
      conversationTitle={conversation.title}
      initialConversationId={conversation.id}
    />
  );
}
