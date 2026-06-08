import { apiClient } from './client.js';
import type { SearchRequest, SearchResponse } from './types.js';

export class SearchApiService {
  /**
   * Execute search pipeline
   */
  async search(request: SearchRequest): Promise<SearchResponse> {
    return apiClient.post<SearchResponse>('/search', request);
  }
}

export const searchApi = new SearchApiService();
