import { create } from 'zustand';
import type { SearchResult, SearchResponse } from '../api/index.js';

interface SearchState {
  // State
  query: string;
  results: SearchResult[];
  searchResponse: SearchResponse | null;
  isLoading: boolean;
  error: string | null;
  hasSearched: boolean;

  // Actions
  setQuery: (query: string) => void;
  setResults: (results: SearchResult[]) => void;
  setSearchResponse: (response: SearchResponse | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setHasSearched: (hasSearched: boolean) => void;
  clearSearch: () => void;
}

export const useSearchStore = create<SearchState>((set) => ({
  // Initial state
  query: '',
  results: [],
  searchResponse: null,
  isLoading: false,
  error: null,
  hasSearched: false,

  // Actions
  setQuery: (query) =>
    set({ query }),

  setResults: (results) =>
    set({ results }),

  setSearchResponse: (response) =>
    set({ searchResponse: response }),

  setLoading: (loading) =>
    set({ isLoading: loading }),

  setError: (error) =>
    set({ error }),

  setHasSearched: (hasSearched) =>
    set({ hasSearched }),

  clearSearch: () =>
    set({
      query: '',
      results: [],
      searchResponse: null,
      isLoading: false,
      error: null,
      hasSearched: false,
    }),
}));
