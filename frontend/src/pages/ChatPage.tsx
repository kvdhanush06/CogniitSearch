import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, Link, useParams } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useChat } from '@/hooks';
import { useChatStore, useUIStore } from '@/store';
import type { SourceAttribution, ConversationMessage } from '@/api';
import {
  ChatInput,
  ChatMessage,
  ConversationSidebar,
  StreamingResponse,
  FollowUps,
  ProgressStepper,
} from '@/components/chat';
import { LogoMark } from '@/components/icons';
import { Button } from '@/components/ui/button';


interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: SourceAttribution[];
  timestamp: Date;
}

interface ChatPageProps {
  /** Optional seed messages when the page is being used to show a past conversation. */
  initialMessages?: ConversationMessage[];
  /** Optional title for the header when viewing a past conversation. */
  conversationTitle?: string;
  /** When viewing a past conversation, the id is fixed so follow-ups thread into it. */
  initialConversationId?: string;
}

export function ChatPage({
  initialMessages,
  conversationTitle,
  initialConversationId,
}: ChatPageProps = {}) {
  const params = useParams<{ id: string }>();
  const {
    startStream,
    reattach,
    active,
  } = useChat();
  const { messages: storeMessages, addMessage, setMessages: setStoreMessages } = useChatStore();
  // Sidebar state lives in the persisted UI store so it survives
  // reloads and route remounts. The previous local useState reset to
  // false on every mount, which is why opening the menu, reloading,
  // or hitting "new conversation" would silently close it.
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
  // Local seeded message list for past-conversation view, kept until
  // the user sends the first message (then we fall through to the
  // store-driven live view).
  const [seededMessages, setSeededMessages] = useState<Message[]>(() =>
    toLocalMessages(initialMessages),
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') ?? '';
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Guard against React StrictMode double-invoking the auto-submit effect.
  const autoSubmittedQueryRef = useRef<string | null>(null);
  // The current session being shown. Starts null; populated by
  // auto-submit / first send / reattach.
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  // Track the conversation id from the URL so the page can reattach
  // to a live or completed stream when the user reloads.
  const conversationIdFromUrl = params.id ?? initialConversationId ?? null;

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [seededMessages, storeMessages, active.content, scrollToBottom]);

  // On mount with a /chat/:id URL, try to reattach to a live stream
  // (or replay the persisted message) before falling through to the
  // DB-loaded seeded messages. This is the "I reloaded mid-stream"
  // path. If no reattach is possible we keep showing the seeded
  // messages from the conversation detail load.
  useEffect(() => {
    if (!conversationIdFromUrl) return;
    if (activeSessionId) return;
    // We don't know the user message id from the URL alone. The
    // last user message in the conversation is what the reattach
    // endpoint expects. Fetching the conversation detail here would
    // duplicate the work ConversationDetailPage already did — so
    // when ChatPage is mounted as a child of ConversationDetailPage
    // we receive `initialMessages` and pick the last user one.
    const lastUser = (initialMessages ?? [])
      .slice()
      .reverse()
      .find((m) => m.role === 'user');
    if (!lastUser) return;
    let cancelled = false;
    void (async () => {
      const sid = await reattach(conversationIdFromUrl, lastUser.id);
      if (!cancelled) setActiveSessionId(sid);
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationIdFromUrl, initialMessages, reattach, activeSessionId]);

  // ?q=… auto-submit.
  useEffect(() => {
    if (!initialQuery) return;
    if (autoSubmittedQueryRef.current === initialQuery) return;
    autoSubmittedQueryRef.current = initialQuery;
    const next = new URLSearchParams(searchParams);
    next.delete('q');
    setSearchParams(next, { replace: true });
    void handleSend(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  // Once a session's conversationId is known, mirror it into the URL
  // bar so the user can share / reload — but **without** triggering
  // react-router's route matching. `history.replaceState` updates the
  // URL silently, so this page stays mounted, the in-flight session
  // in the global store keeps streaming, and there is no
  // ConversationDetailPage / Loader2 flash on the way to /chat/:id.
  //
  // The trade-off: a hard reload of /chat/:id will land on
  // ConversationDetailPage (which loads from the DB and re-renders
  // ChatPage with the persisted messages). That's still the right
  // behaviour for past conversations.
  useEffect(() => {
    const convId = active.conversationId;
    if (!convId) return;
    const targetPath = `/chat/${convId}`;
    if (window.location.pathname === targetPath) return;
    // Preserve any query string the user might have had.
    window.history.replaceState(window.history.state, '', targetPath);
  }, [active.conversationId]);

  // For follow-up sends inside an already-active conversation we need
  // to thread the conversationId into the request. The URL id is one
  // source; the active session's `conversationId` (set by the
  // conversation chunk) is the other. Prefer the live session's id
  // because the URL is set via history.replaceState and may not have
  // round-tripped through react-router's route match.
  const followUpConversationId =
    active.conversationId ?? conversationIdFromUrl ?? undefined;

  const handleSend = async (query: string): Promise<void> => {
    // Drop the seeded past-conversation view; this turn starts a new
    // visible chat (or appends to the active one, in the case of
    // reattach + a follow-up from the same page).
    if (seededMessages.length > 0) {
      setSeededMessages([]);
      setStoreMessages([]);
    }
    const sid = await startStream({
      query,
      stream: true,
      // If we have an existing conversationId, pass it so the
      // controller threads the new message into the same row.
      ...(followUpConversationId ? { conversationId: followUpConversationId } : {}),
    });
    setActiveSessionId(sid);
    window.dispatchEvent(new CustomEvent('cogniit:conversations:refresh'));
  };

  // When the live stream finishes, append the assistant message to
  // the store's persistent message list and refresh the sidebar. The
  // session entry is kept in the store until the next user turn or
  // the user navigates away — at which point ChatPage's unmount
  // effect (or a future cleanup pass) can evict it.
  useEffect(() => {
    if (!active.isComplete || !active.sessionId) return;
    if (!active.content) return;
    // Dedup: the store hook in useChat also adds a message; here we
    // only add the assistant one to keep the visible list correct.
    const convId = active.conversationId;
    if (!convId) return;
    // Check whether the assistant message for this session is
    // already in the store (StrictMode double-effect, etc.).
    const already = storeMessages.some(
      (m) => m.id === `assistant-${active.sessionId}` && m.role === 'assistant',
    );
    if (already) return;
    addMessage({
      id: `assistant-${active.sessionId}`,
      role: 'assistant',
      content: active.content,
      timestamp: new Date().toISOString(),
      metadata: active.sources.length > 0 ? { sources: active.sources } : undefined,
    });
    window.dispatchEvent(new CustomEvent('cogniit:conversations:refresh'));
  }, [active.isComplete, active.sessionId, active.content, active.conversationId, active.sources, storeMessages, addMessage]);

  // ---- Render --------------------------------------------------------

  // Choose which message list to show. While a session is active we
  // render the store's list (which the user message + the assistant
  // message we just added both live in). Before the first send, we
  // render the seeded past-conversation list.
  const visibleMessages: Message[] =
    seededMessages.length > 0
      ? seededMessages
      : storeMessages
          .filter((m) => m.role !== 'system')
          .map((m) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content,
            sources: (m.metadata?.sources as SourceAttribution[] | undefined) ?? undefined,
            timestamp: new Date(m.timestamp),
          }));

  return (
    <div className="flex h-screen bg-background">
      <ConversationSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-border bg-background/80 px-4 py-2 backdrop-blur sm:px-6">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label={sidebarOpen ? 'Close conversation history' : 'Open conversation history'}
              aria-expanded={sidebarOpen}
              onClick={toggleSidebar}
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <LogoMark className="h-5 w-5" />
              CogniitSearch
            </Link>
            {conversationTitle && (
              <span className="ml-3 hidden text-sm text-muted-foreground sm:inline">
                · {conversationTitle}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {visibleMessages.length} message{visibleMessages.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
            {visibleMessages.length === 0 && !active.isStreaming && (
              <div className="flex h-[60vh] items-center justify-center">
                <div className="text-center">
                  <h1 className="mb-2 text-4xl font-bold tracking-tight">
                    <span className="gradient-text">CogniitSearch</span>
                  </h1>
                  <p className="text-lg text-muted-foreground">
                    Ask anything. Get answers with sources.
                  </p>
                </div>
              </div>
            )}

            {visibleMessages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}

            {active.isStreaming && (
              <div className="space-y-3">
                <ProgressStepper
                  currentStage={active.progress?.stage ?? null}
                  message={active.progress?.message ?? null}
                />
                {active.content && (
                  <StreamingResponse content={active.content} sources={active.sources} />
                )}
              </div>
            )}

            {!active.isStreaming && active.followUps.length > 0 && (
              <FollowUps
                questions={active.followUps}
                onSelect={(q) => {
                  void handleSend(q);
                }}
                className="mt-2"
              />
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="border-t border-border bg-background">
          <div className="mx-auto max-w-3xl px-4 py-4">
            <ChatInput
              onSend={handleSend}
              disabled={active.isStreaming}
              initialValue={initialQuery}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function toLocalMessages(initial: ConversationMessage[] | undefined): Message[] {
  if (!initial) return [];
  return initial
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      id: m.id,
      role: m.role as 'user' | 'assistant',
      content: m.content,
      sources: (m.sources ?? undefined) as SourceAttribution[] | undefined,
      timestamp: new Date(m.createdAt),
    }));
}
