import { type Request, type Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { logger } from '../config/logger.js';
import { searchService } from '../services/search.service.js';
import type { SearchRequest } from './validators/index.js';

/**
 * POST /search
 * Execute search pipeline: Search → Rank → Crawl → Context
 */
export async function search(req: Request, res: Response): Promise<void> {
  try {
    const {
      query,
      maxResults,
      enableCrawl,
      enableRanking,
    } = req.body as SearchRequest;

    const userId = req.headers['x-user-id'] as string ?? 'anonymous';

    logger.info({ query, userId }, 'Search request received');

    const result = await searchService.executePipeline(query, userId, {
      maxSearchResults: maxResults,
      enableCrawl: enableCrawl ?? true,
      enableRanking: enableRanking ?? true,
    });

    res.status(StatusCodes.OK).json({
      success: true,
      data: {
        query: result.query,
        results: result.rankedResults,
        context: result.context,
        metadata: result.metadata,
      },
    });
  } catch (error) {
    logger.error({ err: error, query: req.body.query }, 'Search failed');

    const statusCode = error && typeof error === 'object' && 'status' in error ? (error as any).status : StatusCodes.INTERNAL_SERVER_ERROR;
    const message = error instanceof Error ? error.message : 'Search failed';

    res.status(statusCode).json({
      success: false,
      error: {
        message,
        code: 'SEARCH_ERROR',
      },
    });
  }
}
