import pino, { type Logger, type TransportTargetOptions } from 'pino';
import { env } from './env.js';

function createLogger(): Logger {
  const isDevelopment = env.NODE_ENV === 'development';

  const targets: TransportTargetOptions[] = [];

  if (isDevelopment || env.LOG_FORMAT === 'pretty') {
    targets.push({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
      level: env.LOG_LEVEL,
    });
  } else {
    targets.push({
      target: 'pino/file',
      options: { destination: 1 }, // stdout
      level: env.LOG_LEVEL,
    });
  }

  if (env.LOG_FILE_ENABLED) {
    targets.push({
      target: 'pino/file',
      options: { destination: env.LOG_FILE_PATH, mkdir: true },
      level: env.LOG_LEVEL,
    });
  }

  return pino({
    level: env.LOG_LEVEL,
    timestamp: pino.stdTimeFunctions.isoTime,
    base: { pid: process.pid, hostname: undefined },
    transport: { targets },
  });
}

export const logger: Logger = createLogger();
