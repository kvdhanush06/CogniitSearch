import { type Request, type Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { logger } from '../config/logger.js';
import { queueManager } from '../queues/index.js';

/**
 * GET /health
 * Health check endpoint with system status
 */
export async function health(_req: Request, res: Response): Promise<void> {
  try {
    // Get queue stats
    let queueStats: Record<string, unknown> = {};
    try {
      queueStats = await queueManager.getQueueStats();
    } catch (error) {
      logger.warn({ error }, 'Failed to retrieve queue stats for health check');
    }

    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      nodeVersion: process.version,
      queues: queueStats,
    };

    res.status(StatusCodes.OK).json({
      success: true,
      data: healthData,
    });
  } catch (error) {
    logger.error({ err: error }, 'Health check failed');

    res.status(StatusCodes.SERVICE_UNAVAILABLE).json({
      success: false,
      data: {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
}
