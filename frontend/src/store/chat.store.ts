import { create } from 'zustand';
import type { Message, Conversation } from '../api/index.js';

interface ChatState {
  // State
  currentConversation: Conversation | null;
  messages: Message[];
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;

  // Actions
  setCurrentConversation: (conversation: Conversation | null) => void;
  addMessage: (message: Message) => void;
  setMessages: (messages: Message[]) => void;
  setLoading: (loading: boolean) => void;
  setStreaming: (streaming: boolean) => void;
  setError: (error: string | null) => void;
  clearChat: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  // Initial state
  currentConversation: null,
  messages: [],
  isLoading: false,
  isStreaming: false,
  error: null,

  // Actions
  setCurrentConversation: (conversation) =>
    set({ currentConversation: conversation }),

  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),

  setMessages: (messages) =>
    set({ messages }),

  setLoading: (loading) =>
    set({ isLoading: loading }),

  setStreaming: (streaming) =>
    set({ isStreaming: streaming }),

  setError: (error) =>
    set({ error }),

  clearChat: () =>
    set({
      currentConversation: null,
      messages: [],
      isLoading: false,
      isStreaming: false,
      error: null,
    }),
}));
