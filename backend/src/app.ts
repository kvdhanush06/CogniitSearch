import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';

import { env } from './config/env.js';
import { logger } from './config/logger.js';
import routes from './routes/index.js';
import { loadSession } from './middleware/auth.middleware.js';

const app: Express = express();

app.set('trust proxy', env.TRUST_PROXY);
app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: env.CORS_CREDENTIALS,
  }),
);
app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(loadSession);

app.use(
  pinoHttp({
    logger,
    autoLogging: {
      ignore: (req: Request) => req.url === '/health',
    },
  }),
);

app.use(env.API_PREFIX, routes);

app.use((_req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    error: { message: 'Resource not found', code: 'NOT_FOUND' },
  });
});

app.use((err: Error, req: Request, res: Response, _next: NextFunction): void => {
  const rawStatus =
    'statusCode' in err && typeof (err as { statusCode?: unknown }).statusCode === 'number'
      ? (err as { statusCode: number }).statusCode
      : 500;
  const statusCode = rawStatus >= 400 && rawStatus < 500 ? rawStatus : 500;
  const code =
    'code' in err && typeof (err as { code?: unknown }).code === 'string'
      ? (err as { code: string }).code
      : 'INTERNAL_SERVER_ERROR';

  logger.error({ err, method: req.method, url: req.url, statusCode }, 'Unhandled error');

  res.status(statusCode).json({
    success: false,
    error: {
      message: statusCode === 500 ? 'Internal server error' : 'Request could not be processed',
      code: statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : code,
    },
  });
});

export default app;
