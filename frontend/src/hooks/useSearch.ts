import { useState } from 'react';
import { searchApi } from '../api/index.js';
import type { SearchRequest, SearchResponse } from '../api/index.js';
import { useSearchStore } from '../store/index.js';

interface UseSearchReturn {
  search: (request: SearchRequest) => Promise<SearchResponse>;
  isLoading: boolean;
  error: string | null;
}

export function useSearch(): UseSearchReturn {
  const { setLoading, setError, setResults, setSearchResponse, setHasSearched } = useSearchStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setErrorState] = useState<string | null>(null);

  const search = async (request: SearchRequest): Promise<SearchResponse> => {
    try {
      setLoading(true);
      setIsLoading(true);
      setError(null);
      setErrorState(null);

      const response = await searchApi.search(request);

      setResults(response.results);
      setSearchResponse(response);
      setHasSearched(true);

      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Search failed';
      setError(errorMessage);
      setErrorState(errorMessage);
      throw err;
    } finally {
      setLoading(false);
      setIsLoading(false);
    }
  };

  return {
    search,
    isLoading,
    error,
  };
}
