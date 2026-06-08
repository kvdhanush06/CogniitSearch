import { logger } from '../config/logger.js';
import type { RankedResult } from './search.types.js';
import type { TinyfishSearchResult } from '../integrations/tinyfish/search.types.js';
import type { TinyfishCrawlResponse } from '../integrations/tinyfish/crawl.types.js';

export class RankingService {
  /**
   * Rank search results based on multiple factors
   */
  rankSearchResults(
    results: TinyfishSearchResult[],
    query: string,
    weights: {
      relevance: number;
      quality: number;
      freshness: number;
    },
  ): RankedResult[] {
    const startTime = Date.now();

    const ranked = results.map((result) => {
      const relevanceScore = this.calculateRelevanceScore(result, query);
      const qualityScore = this.calculateQualityScore(result);
      const freshnessScore = this.calculateFreshnessScore(result);

      const finalScore =
        relevanceScore * weights.relevance +
        qualityScore * weights.quality +
        freshnessScore * weights.freshness;

      return {
        url: result.url,
        title: result.title,
        snippet: result.snippet,
        domain: result.domain,
        favicon: result.favicon,
        publishedDate: result.publishedDate,
        searchScore: result.score,
        relevanceScore,
        qualityScore,
        freshnessScore,
        finalScore,
        wordCount: undefined,
        hasContent: false,
      };
    });

    // Sort by final score descending
    ranked.sort((a, b) => b.finalScore - a.finalScore);

    const duration = Date.now() - startTime;
    logger.debug(
      { resultCount: ranked.length, duration, topScore: ranked[0]?.finalScore },
      'Results ranked',
    );

    return ranked;
  }

  /**
   * Enhance ranked results with crawl data
   */
  enhanceWithCrawlData(
    ranked: RankedResult[],
    crawlResults: Map<string, TinyfishCrawlResponse>,
  ): RankedResult[] {
    return ranked.map((result) => {
      const crawlData = crawlResults.get(result.url);
      if (!crawlData) return result;

      const wordCount = crawlData.metadata.wordCount;
      const hasContent = crawlData.content.length > 0;

      // Recalculate quality score with actual content
      const qualityScore = this.calculateQualityScoreFromContent(crawlData);

      return {
        ...result,
        wordCount,
        hasContent,
        qualityScore,
        // Recalculate final score with updated quality
        finalScore:
          result.relevanceScore * 0.5 + qualityScore * 0.3 + result.freshnessScore * 0.2,
      };
    });
  }

  /**
   * Filter results by minimum relevance score
   */
  filterByMinScore(results: RankedResult[], minScore: number): RankedResult[] {
    const filtered = results.filter((r) => r.finalScore >= minScore);
    logger.debug(
      { originalCount: results.length, filteredCount: filtered.length, minScore },
      'Results filtered by minimum score',
    );
    return filtered;
  }

  /**
   * Calculate query relevance score
   */
  private calculateRelevanceScore(result: TinyfishSearchResult, query: string): number {
    const queryTerms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    if (queryTerms.length === 0) return 0.5;

    const title = result.title.toLowerCase();
    const snippet = result.snippet.toLowerCase();
    const domain = result.domain.toLowerCase();

    let score = 0;
    let matchedTerms = 0;

    for (const term of queryTerms) {
      let termScore = 0;

      // Title match (highest weight)
      if (title.includes(term)) {
        termScore += 0.5;
        matchedTerms++;
      }

      // Snippet match (medium weight)
      if (snippet.includes(term)) {
        termScore += 0.3;
        matchedTerms++;
      }

      // Domain match (lower weight)
      if (domain.includes(term)) {
        termScore += 0.2;
        matchedTerms++;
      }

      score += termScore;
    }

    // Normalize by query terms
    const normalizedScore = queryTerms.length > 0 ? score / queryTerms.length : 0;

    // Boost if all terms matched
    const allTermsBoost = matchedTerms === queryTerms.length ? 1.2 : 1.0;

    return Math.min(normalizedScore * allTermsBoost, 1.0);
  }

  /**
   * Calculate content quality score from search metadata
   */
  private calculateQualityScore(result: TinyfishSearchResult): number {
    let score = 0.5; // Base score

    // Snippet length indicates content richness
    const snippetLength = result.snippet.length;
    if (snippetLength > 200) score += 0.2;
    else if (snippetLength > 100) score += 0.1;

    // Has published date (indicates quality content)
    if (result.publishedDate) score += 0.1;

    // Domain authority (simple heuristic)
    const trustedDomains = ['.gov', '.edu', '.org'];
    if (trustedDomains.some((d) => result.domain.endsWith(d))) {
      score += 0.2;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Calculate quality score from actual crawled content
   */
  private calculateQualityScoreFromContent(crawlData: TinyfishCrawlResponse): number {
    let score = 0.5; // Base score

    // Word count scoring
    const wordCount = crawlData.metadata.wordCount;
    if (wordCount > 1000) score += 0.3;
    else if (wordCount > 500) score += 0.2;
    else if (wordCount > 200) score += 0.1;

    // Has metadata
    if (crawlData.metadata.description) score += 0.1;
    if (crawlData.metadata.author) score += 0.1;
    if (crawlData.metadata.publishedDate) score += 0.1;

    // Content length
    const contentLength = crawlData.content.length;
    if (contentLength > 2000) score += 0.2;
    else if (contentLength > 1000) score += 0.1;

    return Math.min(score, 1.0);
  }

  /**
   * Calculate freshness score based on publication date
   */
  private calculateFreshnessScore(result: TinyfishSearchResult): number {
    if (!result.publishedDate) return 0.5; // Unknown date gets neutral score

    try {
      const publishedDate = new Date(result.publishedDate);
      const now = new Date();
      const daysAgo = (now.getTime() - publishedDate.getTime()) / (1000 * 60 * 60 * 24);

      // Exponential decay: newer content scores higher
      if (daysAgo <= 1) return 1.0;
      if (daysAgo <= 7) return 0.9;
      if (daysAgo <= 30) return 0.7;
      if (daysAgo <= 90) return 0.5;
      if (daysAgo <= 365) return 0.3;
      return 0.1;
    } catch {
      return 0.5; // Invalid date gets neutral score
    }
  }
}

export const rankingService = new RankingService();
