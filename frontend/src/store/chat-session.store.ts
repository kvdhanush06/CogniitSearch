import { create } from 'zustand';
import type { SourceAttribution, StreamChunk, PipelineStage } from '../api/index.js';

export interface SessionProgress {
  stage: PipelineStage;
  message: string;
  count?: number;
  ratio?: number;
}

export interface ChatSession {
  /** Stable key: `${conversationId}:${messageId}`. */
  sessionId: string;
  conversationId: string;
  messageId: string;
  /** The user's original query — captured before the stream starts. */
  query: string;
  /** Accumulated streamed answer text. */
  content: string;
  /** Sources from the most recent `done` chunk. */
  sources: SourceAttribution[];
  /** Follow-up question chips from the backend. */
  followUps: string[];
  /** Latest progress event. */
  progress: SessionProgress | null;
  /** True until the `done`/`error` chunk arrives. */
  isStreaming: boolean;
  /** True if the stream ended in an error. */
  error: string | null;
  /** True after a `done` chunk (terminal). */
  isComplete: boolean;
  /** True after the assistant message has been committed to the visible
   *  chat list. Used by ChatPage to avoid double-adding on remount. */
  committed: boolean;
  /** Set when the SPA is reattaching to an in-flight or persisted stream
   *  (vs. having started the stream itself). Drives a re-render so
   *  ChatPage can hydrate from the store without flashing. */
  reattached: boolean;
}

interface ChatSessionState {
  sessions: Map<string, ChatSession>;

  // --- Selectors (use these to subscribe to one session by id) ---
  getSession: (sessionId: string) => ChatSession | undefined;

  // --- Lifecycle actions ---
  /** Create a new session entry, or reset an existing one for a retry. */
  initSession: (params: {
    sessionId: string;
    conversationId: string;
    messageId: string;
    query: string;
  }) => void;

  /** Update fields on an existing session. */
  patchSession: (sessionId: string, patch: Partial<ChatSession>) => void;

  /** Append streamed content. Concatenates, replaces by sessionId. */
  appendContent: (sessionId: string, delta: string) => void;

  /** Mark a session as committed (the assistant message has been
   *  appended to the visible message list). */
  markCommitted: (sessionId: string) => void;

  /** Final cleanup once a session is committed and no other mount
   *  is going to read from it. Keeps the map from growing without
   *  bound for long-lived SPA sessions. */
  evictSession: (sessionId: string) => void;
}

function emptySession(params: {
  sessionId: string;
  conversationId: string;
  messageId: string;
  query: string;
}): ChatSession {
  return {
    sessionId: params.sessionId,
    conversationId: params.conversationId,
    messageId: params.messageId,
    query: params.query,
    content: '',
    sources: [],
    followUps: [],
    progress: null,
    isStreaming: true,
    error: null,
    isComplete: false,
    committed: false,
    reattached: false,
  };
}

/**
 * Global store of in-flight and recently-completed chat sessions,
 * keyed by `${conversationId}:${messageId}`. Lives outside React so a
 * route remount (or a hard reload followed by a reattach) finds the
 * same `content`/`sources`/`progress` and renders it without a flash.
 *
 * Writers:
 *   - `useChat.startStream` — consumes the POST /chat SSE stream and
 *     patches the session as chunks arrive.
 *   - `useChat.reattach` — consumes the GET reattach SSE stream and
 *     patches the same session.
 *
 * Readers:
 *   - `ChatPage` — by sessionId, derived from the active conversation
 *     + the most recent user message id.
 */
export const useChatSessionStore = create<ChatSessionState>((set, get) => ({
  sessions: new Map(),

  getSession: (sessionId) => get().sessions.get(sessionId),

  initSession: (params) =>
    set((state) => {
      const next = new Map(state.sessions);
      next.set(params.sessionId, emptySession(params));
      return { sessions: next };
    }),

  patchSession: (sessionId, patch) =>
    set((state) => {
      const existing = state.sessions.get(sessionId);
      if (!existing) return state;
      const next = new Map(state.sessions);
      next.set(sessionId, { ...existing, ...patch });
      return { sessions: next };
    }),

  appendContent: (sessionId, delta) =>
    set((state) => {
      const existing = state.sessions.get(sessionId);
      if (!existing) return state;
      const next = new Map(state.sessions);
      next.set(sessionId, { ...existing, content: existing.content + delta });
      return { sessions: next };
    }),

  markCommitted: (sessionId) =>
    set((state) => {
      const existing = state.sessions.get(sessionId);
      if (!existing) return state;
      const next = new Map(state.sessions);
      next.set(sessionId, { ...existing, committed: true });
      return { sessions: next };
    }),

  evictSession: (sessionId) =>
    set((state) => {
      if (!state.sessions.has(sessionId)) return state;
      const next = new Map(state.sessions);
      next.delete(sessionId);
      return { sessions: next };
    }),
}));

/** Build the canonical session id from a conversation + user message. */
export function buildSessionId(conversationId: string, messageId: string): string {
  return `${conversationId}:${messageId}`;
}

/** Coerce an incoming SSE chunk into a session-store patch. Pure —
 *  callers apply the patch via patchSession/appendContent. */
export function chunkToPatch(chunk: StreamChunk): {
  patch?: Partial<ChatSession>;
  append?: string;
} {
  switch (chunk.type) {
    case 'content':
      return { append: chunk.content ?? '' };
    case 'progress':
      return {
        patch: {
          progress: {
            stage: chunk.stage,
            message: chunk.message,
            count: chunk.count,
            ratio: chunk.ratio,
          },
        },
      };
    case 'follow_ups':
      return { patch: { followUps: chunk.questions ?? [] } };
    case 'done': {
      // The backend stuffs the answer metadata into `done.content` as a
      // JSON blob (citations, sources, followUps, …). We have to parse
      // it here — the previous useChat implementation did this in the
      // hook. Without it, the UI shows the streamed text but no
      // citation markers / source chips / follow-up suggestions.
      const patch: Partial<ChatSession> = { isStreaming: false, isComplete: true };
      if (chunk.content) {
        try {
          const parsed = JSON.parse(chunk.content) as {
            sources?: SourceAttribution[];
            followUps?: string[];
          };
          if (Array.isArray(parsed.sources) && parsed.sources.length > 0) {
            patch.sources = parsed.sources;
          }
          // The backend already sent a separate follow_ups chunk; this
          // is a fallback for older payloads.
          if (Array.isArray(parsed.followUps) && parsed.followUps.length > 0) {
            patch.followUps = parsed.followUps;
          }
        } catch {
          // ignore — chunk.content wasn't JSON; that's fine
        }
      }
      return { patch };
    }
    case 'error':
      return { patch: { isStreaming: false, isComplete: true, error: chunk.error } };
    case 'conversation':
      return {};
  }
}
