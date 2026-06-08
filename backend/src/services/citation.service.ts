import { logger } from '../config/logger.js';
import type { BuiltContext } from './search.types.js';

export interface Citation {
  marker: string;         // e.g., "[1]"
  sourceIndex: number;    // 1-based index
  sourceUrl: string;
  sourceTitle: string;
  claims: string[];       // Claims supported by this source
}

export interface CitationAnalysis {
  citations: Citation[];
  uncitedClaims: string[];
  invalidCitations: string[];
  totalCitations: number;
  uniqueSources: number;
  citationDensity: number; // Citations per 100 words
}

export interface SourceAttribution {
  url: string;
  title: string;
  relevanceScore: number;
  citationCount: number;
  claims: string[];
}

export class CitationService {
  /**
   * Extract citations from answer text using regex
   */
  extractCitations(answer: string, context: BuiltContext): CitationAnalysis {
    const startTime = Date.now();

    // Find all citation markers [1], [2], etc.
    const citationRegex = /\[(\d+)\]/g;
    const matches = Array.from(answer.matchAll(citationRegex));

    // Map citations to sources
    const citations: Citation[] = [];
    const invalidCitations: string[] = [];
    const sourceCitationCount = new Map<number, number>();

    for (const match of matches) {
      const sourceIndex = parseInt(match[1], 10);
      const marker = match[0];

      // Validate citation index
      if (sourceIndex < 1 || sourceIndex > context.sources.length) {
        if (!invalidCitations.includes(marker)) {
          invalidCitations.push(marker);
        }
        continue;
      }

      // Find or create citation entry
      const existingCitation = citations.find(
        (c) => c.sourceIndex === sourceIndex,
      );

      if (!existingCitation) {
        const source = context.sources[sourceIndex - 1];
        citations.push({
          marker,
          sourceIndex,
          sourceUrl: source.url,
          sourceTitle: source.title,
          claims: [],
        });
        sourceCitationCount.set(sourceIndex, 1);
      } else {
        const count = sourceCitationCount.get(sourceIndex) ?? 0;
        sourceCitationCount.set(sourceIndex, count + 1);
      }
    }

    // Extract claims for each citation (text surrounding citation)
    for (const citation of citations) {
      const claims = this.extractClaimsForCitation(answer, citation.marker);
      citation.claims = claims;
    }

    // Extract uncited claims (sentences without citations)
    const uncitedClaims = this.extractUncitedClaims(answer);

    // Calculate citation density
    const wordCount = answer.split(/\s+/).length;
    const citationDensity = wordCount > 0 ? (citations.length / wordCount) * 100 : 0;

    const analysis: CitationAnalysis = {
      citations,
      uncitedClaims,
      invalidCitations,
      totalCitations: matches.length,
      uniqueSources: citations.length,
      citationDensity,
    };

    const duration = Date.now() - startTime;
    logger.debug(
      {
        totalCitations: analysis.totalCitations,
        uniqueSources: analysis.uniqueSources,
        invalidCitations: analysis.invalidCitations.length,
        citationDensity: analysis.citationDensity.toFixed(2),
        duration,
      },
      'Citation extraction completed',
    );

    return analysis;
  }

  /**
   * Build source attribution list
   */
  buildSourceAttribution(
    context: BuiltContext,
    citationAnalysis: CitationAnalysis,
  ): SourceAttribution[] {
    const attributions: SourceAttribution[] = [];

    for (const source of context.sources) {
      const sourceIndex = context.sources.indexOf(source) + 1;
      const citation = citationAnalysis.citations.find(
        (c) => c.sourceIndex === sourceIndex,
      );

      attributions.push({
        url: source.url,
        title: source.title,
        relevanceScore: source.relevanceScore,
        citationCount: citation ? 1 : 0,
        claims: citation?.claims ?? [],
      });
    }

    // Sort by citation count, then relevance
    attributions.sort((a, b) => {
      if (b.citationCount !== a.citationCount) {
        return b.citationCount - a.citationCount;
      }
      return b.relevanceScore - a.relevanceScore;
    });

    logger.debug(
      { sourceCount: attributions.length },
      'Source attribution built',
    );

    return attributions;
  }

  /**
   * Validate that all citations are properly attributed
   */
  validateCitations(analysis: CitationAnalysis): {
    isValid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    // Check for invalid citations
    if (analysis.invalidCitations.length > 0) {
      issues.push(
        `Found ${analysis.invalidCitations.length} invalid citations: ${analysis.invalidCitations.join(', ')}`,
      );
    }

    // Check for uncited claims
    if (analysis.uncitedClaims.length > 0) {
      issues.push(
        `Found ${analysis.uncitedClaims.length} claims without citations`,
      );
    }

    // Check citation density (too low might indicate poor sourcing)
    if (analysis.citationDensity < 0.5) {
      issues.push(
        `Low citation density (${analysis.citationDensity.toFixed(2)}%). Consider adding more citations.`,
      );
    }

    return {
      isValid: issues.length === 0,
      issues,
    };
  }

  /**
   * Format citations for display
   */
  formatCitations(analysis: CitationAnalysis): string {
    if (analysis.citations.length === 0) {
      return 'No citations found.';
    }

    const formatted = analysis.citations
      .map((citation) => {
        return `${citation.marker} ${citation.sourceTitle} - ${citation.sourceUrl}`;
      })
      .join('\n');

    return `Citations (${analysis.uniqueSources} sources):\n${formatted}`;
  }

  /**
   * Extract claims (sentences) associated with a citation marker
   */
  private extractClaimsForCitation(text: string, marker: string): string[] {
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const claims: string[] = [];

    for (const sentence of sentences) {
      if (sentence.includes(marker)) {
        claims.push(sentence.trim() + '.');
      }
    }

    return claims;
  }

  /**
   * Extract sentences that don't have any citations
   */
  private extractUncitedClaims(text: string): string[] {
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const uncited: string[] = [];

    for (const sentence of sentences) {
      const hasCitation = /\[\d+\]/.test(sentence);
      if (!hasCitation && sentence.trim().length > 20) {
        // Filter out very short sentences
        uncited.push(sentence.trim() + '.');
      }
    }

    return uncited;
  }
}

export const citationService = new CitationService();
