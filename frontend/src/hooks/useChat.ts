import { useState, useCallback } from 'react';
import { chatApi, apiClient } from '../api/index.js';
import type {
  ChatRequest,
  ChatResponse,
  SourceAttribution,
  StreamChunk,
} from '../api/index.js';
import {
  useChatStore,
  useChatSessionStore,
  buildSessionId,
  chunkToPatch,
  type ChatSession,
  type SessionProgress,
} from '../store/index.js';

export interface ProgressEvent extends SessionProgress {}

export interface ActiveChat {
  sessionId: string | null;
  conversationId: string | null;
  isStreaming: boolean;
  isComplete: boolean;
  content: string;
  sources: SourceAttribution[];
  followUps: string[];
  progress: SessionProgress | null;
  error: string | null;
}

interface UseChatReturn {
  /** Send a chat message and stream the answer into a new session. */
  startStream: (request: ChatRequest) => Promise<string>;
  /** Reattach to a live or completed stream for a prior message. Returns
   *  the sessionId of the reattached session (existing or newly
   *  initialised from the persisted message). */
  reattach: (conversationId: string, messageId: string) => Promise<string>;
  /** Snapshot of a session by id. Re-renders the caller whenever the
   *  session is patched. Multiple components may call this with the
   *  same id and all will see consistent snapshots. */
  useSession: (sessionId: string | null) => ChatSession | null;
  /** Snapshot of the most recently started or reattached session. */
  active: ActiveChat;
  /** Sources from the most recent done chunk (legacy: kept so the
   *  existing ChatPage code paths still work). */
  lastSources: SourceAttribution[];
  /** 3 follow-up questions from the most recent stream. */
  followUps: string[];
  /** Most recent progress event. */
  currentProgress: ProgressEvent | null;
  /** Conversation id from the most recent stream. */
  lastConversationId: string | null;
  /** Non-streaming JSON path (kept for backwards compat). */
  sendMessage: (request: ChatRequest) => Promise<ChatResponse>;
}

export function useChat(): UseChatReturn {
  const { setLoading, setStreaming, setError, addMessage } = useChatStore();
  const [lastSources, setLastSources] = useState<SourceAttribution[]>([]);
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [currentProgress, setCurrentProgress] = useState<ProgressEvent | null>(null);
  const [lastConversationId, setLastConversationId] = useState<string | null>(null);
  // The session currently being shown by ChatPage. Updated by
  // startStream/reattach; read by `active`.
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // -----------------------------------------------------------------
  // Session-scoped subscriptions
  // -----------------------------------------------------------------

  const useSession = useCallback((sessionId: string | null): ChatSession | null => {
    const sessions = useChatSessionStore((s) => s.sessions);
    if (!sessionId) return null;
    return sessions.get(sessionId) ?? null;
  }, []);

  // -----------------------------------------------------------------
  // Stream consumption
  // -----------------------------------------------------------------

  /** Run a generator over an async iterable of StreamChunk and write
   *  the resulting state to the session store. Returns when the
   *  stream ends (done/error or upstream close). */
  const consumeStream = useCallback(
    async (
      sessionId: string,
      iter: AsyncIterableIterator<StreamChunk>,
    ): Promise<void> => {
      const store = useChatSessionStore.getState();
      try {
        for await (const chunk of iter) {
          if (chunk.type === 'conversation') {
            // First chunk — record the canonical conversationId and
            // (when present) the user messageId on the session. After
            // this patch the session has enough info to address the
            // reattach endpoint and to re-key if needed.
            const patch: Record<string, unknown> = {};
            if (chunk.conversationId) {
              patch.conversationId = chunk.conversationId;
              setLastConversationId(chunk.conversationId);
            }
            const existing = useChatSessionStore.getState().sessions.get(sessionId);
            if (existing && !existing.messageId && chunk.messageId) {
              patch.messageId = chunk.messageId;
            }
            if (Object.keys(patch).length > 0) {
              store.patchSession(sessionId, patch);
            }
            continue;
          }
          const { patch, append } = chunkToPatch(chunk);
          if (append) store.appendContent(sessionId, append);
          if (patch) store.patchSession(sessionId, patch);

          // Mirror a few fields into the legacy hook state so existing
          // call sites keep working without touching every one.
          if (patch?.followUps) setFollowUps(patch.followUps);
          if (patch?.progress) setCurrentProgress(patch.progress);
          if (patch?.sources) setLastSources(patch.sources as SourceAttribution[]);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Streaming failed';
        store.patchSession(sessionId, { error: message, isStreaming: false, isComplete: true });
        setError(message);
        throw err;
      }
    },
    [setError],
  );

  // -----------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------

  const startStream = useCallback(
    async (request: ChatRequest): Promise<string> => {
      setLoading(true);
      setStreaming(true);
      setError(null);
      setLastSources([]);
      setFollowUps([]);
      setCurrentProgress(null);

      // Reserve a session id up front so ChatPage can subscribe
      // before the conversation chunk arrives. The conversationId is
      // unknown for new chats; we use a temporary `pending:` prefix
      // and re-key once the backend's conversation chunk lands.
      const tempId = `pending:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      useChatSessionStore.getState().initSession({
        sessionId: tempId,
        conversationId: '',
        messageId: '',
        query: request.query,
      });
      setActiveSessionId(tempId);

      // Pre-seed the visible message list with the user message. The
      // store is the source of truth for the live response, so
      // ChatPage won't double-render.
      addMessage({
        id: `user-${Date.now()}`,
        role: 'user',
        content: request.query,
        timestamp: new Date().toISOString(),
      });

      try {
        await consumeStream(tempId, chatApi.chatStream(request));
        return tempId;
      } finally {
        setLoading(false);
        setStreaming(false);
      }
    },
    [addMessage, consumeStream, setError, setLoading, setStreaming],
  );

  const reattach = useCallback(
    async (conversationId: string, messageId: string): Promise<string> => {
      const sessionId = buildSessionId(conversationId, messageId);
      const store = useChatSessionStore.getState();
      // If we already have a session entry, just adopt it. Otherwise
      // create an empty one with `reattached: true` so ChatPage can
      // show a placeholder while the GET stream lands.
      if (!store.sessions.has(sessionId)) {
        store.initSession({
          sessionId,
          conversationId,
          messageId,
          query: '',
        });
        store.patchSession(sessionId, { reattached: true });
      }
      setActiveSessionId(sessionId);

      try {
        await consumeStream(
          sessionId,
          // The reattach endpoint emits StreamChunks with the same
          // shape as POST /chat — reuse chatApi.chatStream's parser
          // by wrapping the GET stream's JSON strings.
          (async function* (): AsyncIterableIterator<StreamChunk> {
            for await (const raw of apiClient.streamGet(
              `/conversations/${conversationId}/messages/${messageId}/stream`,
            )) {
              try {
                yield JSON.parse(raw) as StreamChunk;
              } catch {
                // skip malformed
              }
            }
          })(),
        );
        return sessionId;
      } finally {
        setStreaming(false);
      }
    },
    [consumeStream, setStreaming],
  );

  const sendMessage = async (request: ChatRequest): Promise<ChatResponse> => {
    try {
      setLoading(true);
      setError(null);
      setLastSources([]);
      setFollowUps([]);
      setCurrentProgress(null);
      const response = await chatApi.chat(request);
      addMessage({
        id: `user-${Date.now()}`,
        role: 'user',
        content: request.query,
        timestamp: new Date().toISOString(),
      });
      addMessage({
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response.answer,
        timestamp: new Date().toISOString(),
        metadata: { citations: response.citations, sources: response.sources },
      });
      setLastSources(response.sources);
      setFollowUps(response.followUps ?? []);
      setCurrentProgress({ stage: 'citation', message: 'Citations ready', ratio: 1 });
      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Chat failed';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Active snapshot — derived from the store for the current
  // activeSessionId. ChatPage renders this directly.
  const sessions = useChatSessionStore((s) => s.sessions);
  const activeSession: ChatSession | null = activeSessionId
    ? sessions.get(activeSessionId) ?? null
    : null;

  const active: ActiveChat = {
    sessionId: activeSessionId,
    conversationId: activeSession?.conversationId ?? null,
    isStreaming: activeSession?.isStreaming ?? false,
    isComplete: activeSession?.isComplete ?? false,
    content: activeSession?.content ?? '',
    sources: activeSession?.sources ?? [],
    followUps: activeSession?.followUps ?? [],
    progress: activeSession?.progress ?? null,
    error: activeSession?.error ?? null,
  };

  return {
    startStream,
    reattach,
    useSession,
    active,
    lastSources,
    followUps,
    currentProgress,
    lastConversationId,
    sendMessage,
  };
}
