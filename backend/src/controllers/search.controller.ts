import { type Request, type Response } from 'express';
import { StatusCodes } from 'http-status-codes';

import { logger } from '../config/logger.js';
import { searchService } from '../services/search.service.js';
import type { SearchRequest } from './validators/index.js';

export async function search(req: Request, res: Response): Promise<void> {
  try {
    const { query, maxResults, enableCrawl, enableRanking } = req.body as SearchRequest;
    const userId = req.user?.id ?? 'anonymous';

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
    logger.error({ err: error instanceof Error ? error.message : String(error) }, 'Search failed');

    const statusCode =
      error && typeof error === 'object' && 'status' in error &&
      typeof (error as { status?: unknown }).status === 'number'
        ? (error as { status: number }).status
        : StatusCodes.INTERNAL_SERVER_ERROR;

    const safeStatus = statusCode >= 400 && statusCode < 500 ? statusCode : StatusCodes.INTERNAL_SERVER_ERROR;
    res.status(safeStatus).json({
      success: false,
      error: {
        message: safeStatus === StatusCodes.INTERNAL_SERVER_ERROR ? 'Search failed' : 'Search request could not be processed',
        code: 'SEARCH_ERROR',
      },
    });
  }
}
