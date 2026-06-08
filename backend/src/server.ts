import http from 'node:http';
import { Server as SocketIOServer } from 'socket.io';

import app from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { disconnectRedis } from './config/redis.js';
import { workerManager } from './workers/worker-manager.js';

// --- Create HTTP server ---
const server: http.Server = http.createServer(app);

// --- Initialize Socket.IO ---
export const io: SocketIOServer = new SocketIOServer(server, {
  cors: {
    origin: env.SOCKET_CORS_ORIGIN,
    credentials: true,
  },
  path: env.SOCKET_PATH,
  pingTimeout: env.SOCKET_PING_TIMEOUT,
  pingInterval: env.SOCKET_PING_INTERVAL,
});

// --- Start listening ---
server.listen(env.PORT, env.HOST, () => {
  logger.info(
    {
      port: env.PORT,
      host: env.HOST,
      env: env.NODE_ENV,
      pid: process.pid,
    },
    `Server started on http://${env.HOST}:${env.PORT}`
  );
});

// --- Optionally start BullMQ workers in this process ---
// In production we run API + workers in separate Node processes (npm-run-all).
// In dev / single-process mode, set USE_BULLMQ=true to start them here too.
if (env.USE_BULLMQ) {
  workerManager.start().catch((err) => {
    logger.fatal({ err }, 'Failed to start BullMQ workers in API process');
    process.exit(1);
  });
}

// --- Graceful shutdown ---
const SHUTDOWN_TIMEOUT_MS = 10_000;

async function gracefulShutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutdown signal received, starting graceful shutdown...');

  // Force exit if cleanup takes too long
  const forceExitTimer = setTimeout(() => {
    logger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  // Prevent the timer from keeping the process alive
  forceExitTimer.unref();

  try {
    // Close Socket.IO connections
    logger.info('Closing Socket.IO connections...');
    await new Promise<void>((resolve) => {
      io.close(() => {
        resolve();
      });
    });
    logger.info('Socket.IO connections closed');

    // Close HTTP server
    logger.info('Closing HTTP server...');
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
    logger.info('HTTP server closed');

    // Close BullMQ workers if they were started in this process
    if (env.USE_BULLMQ) {
      logger.info('Closing BullMQ workers...');
      await workerManager.close();
      logger.info('BullMQ workers closed');
    }

    // Disconnect Redis
    logger.info('Disconnecting Redis...');
    await disconnectRedis();

    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Error during graceful shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => {
  void gracefulShutdown('SIGTERM');
});

process.on('SIGINT', () => {
  void gracefulShutdown('SIGINT');
});

// --- Unhandled errors ---
process.on('unhandledRejection', (reason: unknown) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  process.exit(1);
});

process.on('uncaughtException', (err: Error) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});
