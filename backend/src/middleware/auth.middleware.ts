import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { getUserFromToken, type SessionUser } from '../integrations/supabase/auth.client.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
      sessionToken?: string;
    }
  }
}

/**
 * Extracts the session token from the configured cookie, verifies it
 * with Supabase, and attaches the user to `req.user`.
 *
 * On failure, calls `next()` with no user attached — downstream code
 * should check `req.user` to decide whether the route is public.
 */
export async function loadSession(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.[env.SESSION_COOKIE_NAME] as string | undefined;
    if (!token) return next();
    const user = await getUserFromToken(token);
    req.user = user;
    req.sessionToken = token;
    next();
  } catch (err) {
    // Invalid/expired — clear the broken cookie so the client can move on.
    logger.debug({ err }, 'Session verification failed');
    next();
  }
}

/**
 * Requires an authenticated user. Use after `loadSession` on protected routes.
 * Responds 401 with the standard envelope when `req.user` is missing.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: {
        message: 'Authentication required',
        code: 'UNAUTHENTICATED',
      },
    });
    return;
  }
  next();
}
