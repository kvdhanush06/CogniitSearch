import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MessageSquare, Plus, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { useConversations } from '@/hooks';
import { useChatStore, useChatSessionStore } from '@/store';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface ConversationSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ConversationSidebar({ isOpen, onClose: _onClose }: ConversationSidebarProps) {
  const { conversations, isLoading, refresh, remove } = useConversations();
  const navigate = useNavigate();
  const { id: activeId } = useParams<{ id?: string }>();
  const clearChat = useChatStore((s) => s.clearChat);
  const sessions = useChatSessionStore((s) => s.sessions);
  const evictSession = useChatSessionStore((s) => s.evictSession);

  // Custom delete-confirmation modal. We track the conversation the
  // user wants to delete; null means the modal is closed. The native
  // window.confirm() was jarring and inconsistent with the rest of
  // the UI's design language.
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    if (isOpen) void refresh();
  }, [isOpen, refresh]);

  // Refresh when ChatPage signals a chat just completed. We don't gate
  // on `isOpen` here so the list is fresh whenever the user opens it next.
  useEffect(() => {
    const onRefresh = () => {
      void refresh();
    };
    window.addEventListener('cogniit:conversations:refresh', onRefresh);
    return () => window.removeEventListener('cogniit:conversations:refresh', onRefresh);
  }, [refresh]);

  if (!isOpen) return null;

  return (
    <>
      <aside className="flex h-full w-72 flex-col border-r border-border bg-card">
      <div className="flex items-center justify-between p-3">
        <h2 className="text-sm font-semibold">Conversations</h2>
        {/* No close button here — the hamburger in the chat page toolbar
            toggles open/close. Having two close affordances was confusing. */}
      </div>
      <div className="px-3 pb-2">
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={() => {
            // Clear the visible chat list and evict any in-flight
            // session so the next message starts fresh. The sidebar
            // itself stays open (its state lives in useUIStore and is
            // persisted — see the user's report: clicking this
            // button used to silently close the menu).
            clearChat();
            for (const sid of sessions.keys()) evictSession(sid);
            navigate('/chat');
          }}
        >
          <Plus className="h-4 w-4" />
          New conversation
        </Button>
      </div>
      <Separator />
      <ScrollArea className="flex-1">
        {isLoading && conversations.length === 0 ? (
          <div className="flex items-center justify-center p-6 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No conversations yet.
            <br />
            Ask a question to get started.
          </div>
        ) : (
          <ul className="p-2">
            {conversations.map((conv) => {
              const isActive = conv.id === activeId;
              return (
                <li key={conv.id} className="group">
                  <div
                    className={cn(
                      'relative flex w-full items-start gap-2 rounded-md pl-3 pr-10 py-2 text-left text-sm transition-colors',
                      'hover:bg-accent',
                      isActive && 'bg-accent',
                    )}
                  >
                    <MessageSquare className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <button
                      type="button"
                      onClick={() => navigate(`/chat/${conv.id}`)}
                      className="min-w-0 flex-1 cursor-pointer bg-transparent text-left"
                    >
                      <p
                        className="line-clamp-2 break-words font-medium leading-snug"
                        title={conv.title || conv.query}
                      >
                        {conv.title || conv.query}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {new Date(conv.updated_at).toLocaleString()}
                      </p>
                    </button>
                    <button
                      type="button"
                      aria-label="Delete conversation"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingDelete({ id: conv.id, title: conv.title || conv.query });
                      }}
                      className="absolute right-2 top-2 flex h-7 w-7 flex-shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </aside>

    {/* Custom delete-confirmation modal. The native dialog element
        opens in the browser's top layer (escaping any
        overflow:hidden / transform ancestors) and gives us focus
        trapping, an inert backdrop, and Esc-to-close for free. */}
    <DeleteConfirmModal
      target={pendingDelete}
      onCancel={() => setPendingDelete(null)}
      onConfirm={async (id) => {
        setPendingDelete(null);
        await remove(id);
        // If the user just deleted the conversation they were
        // currently viewing, drop them back to a fresh chat and
        // clear local state. Same as the "new conversation" path.
        if (id === activeId) {
          clearChat();
          for (const sid of sessions.keys()) evictSession(sid);
          navigate('/chat');
        }
      }}
    />
    </>
  );
}

interface DeleteConfirmModalProps {
  target: { id: string; title: string } | null;
  onCancel: () => void;
  onConfirm: (id: string) => void | Promise<void>;
}

function DeleteConfirmModal({ target, onCancel, onConfirm }: DeleteConfirmModalProps) {
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDialogElement | null>(null);
  // Sync the imperative showModal()/close() with the React state.
  // When `target` flips from null→{…} we open; when it flips to null
  // we close. The dialog's own onClose handler does the state flip
  // the other direction, so cancelling via the Cancel button or the
  // Esc key both end up clearing `target`.
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (target && !dlg.open) {
      dlg.showModal();
    } else if (!target && dlg.open) {
      dlg.close();
    }
  }, [target]);

  return (
    <dialog
      ref={ref}
      onClose={onCancel}
      onClick={(e) => {
        // Click on the backdrop (outside the inner card) closes.
        // The dialog itself fills the viewport; clicks on the card
        // don't have e.target === dialog.
        if (e.target === ref.current) onCancel();
      }}
      className={cn('p-0 backdrop:bg-black/50')}
    >
      <Card
        className="w-full max-w-md border-0 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <CardContent className="flex flex-col gap-4 p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold">Delete conversation?</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                This will permanently delete{' '}
                <span className="font-medium text-foreground">
                  &ldquo;{target?.title || 'this conversation'}&rdquo;
                </span>{' '}
                and all of its messages. This action can&rsquo;t be undone.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                if (!target) return;
                setBusy(true);
                try {
                  await onConfirm(target.id);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                'Delete'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </dialog>
  );
}
