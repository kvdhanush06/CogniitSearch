import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';

import { env } from './config/env.js';
import { logger } from './config/logger.js';
import routes from './routes/index.js';
import { loadSession } from './middleware/auth.middleware.js';

// --- Create Express application ---
const app: Express = express();

// --- Security headers ---
app.use(helmet());

// --- CORS configuration ---
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: env.CORS_CREDENTIALS,
  })
);

// --- Cookie parser (httpOnly session cookie) ---
app.use(cookieParser());

// --- Body parsers ---
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// --- Session loader (attaches req.user if a valid cookie is present) ---
app.use(loadSession);

// --- Request logging ---
app.use(
  pinoHttp({
    logger,
    autoLogging: {
      ignore: (req: any) => req.url === '/health',
    },
  })
);

// --- API routes ---
app.use(env.API_PREFIX, routes);

// --- 404 handler for unmatched routes ---
app.use((_req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    error: {
      message: 'Resource not found',
      code: 'NOT_FOUND',
    },
  });
});

// --- Global error handler ---
interface ErrorResponse {
  success: false;
  error: {
    message: string;
    code: string;
    stack?: string;
  };
}

app.use((err: Error, req: Request, res: Response, _next: NextFunction): void => {
  const statusCode = 'statusCode' in err ? (err as Error & { statusCode: number }).statusCode : 500;
  const code = 'code' in err ? (err as Error & { code: string }).code : 'INTERNAL_SERVER_ERROR';

  logger.error(
    {
      err,
      method: req.method,
      url: req.url,
      statusCode,
    },
    'Unhandled error'
  );

  const response: ErrorResponse = {
    success: false,
    error: {
      message: env.NODE_ENV === 'production' && statusCode === 500
        ? 'Internal server error'
        : err.message,
      code,
      ...(env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  };

  res.status(statusCode).json(response);
});

export default app;
