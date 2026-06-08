import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface UIState {
  // State
  sidebarOpen: boolean;
  theme: 'light' | 'dark';
  activeTab: 'search' | 'chat';

  // Actions
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  setActiveTab: (tab: 'search' | 'chat') => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // Initial state
      sidebarOpen: false,
      theme: 'light',
      activeTab: 'chat',

      // Actions
      toggleSidebar: () =>
        set((state) => ({ sidebarOpen: !state.sidebarOpen })),

      setSidebarOpen: (open) =>
        set({ sidebarOpen: open }),

      setTheme: (theme) =>
        set({ theme }),

      setActiveTab: (tab) =>
        set({ activeTab: tab }),
    }),
    {
      // Persist UI prefs across reloads. We only persist the pieces
      // that should survive a refresh — the active tab can stay
      // session-only if the product wants, but the sidebar open/closed
      // state and theme are user preferences.
      name: 'cogniit-ui',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sidebarOpen: state.sidebarOpen,
        theme: state.theme,
      }),
    },
  ),
);
