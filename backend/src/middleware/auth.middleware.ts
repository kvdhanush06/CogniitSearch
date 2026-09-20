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

export async function loadSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.[env.SESSION_COOKIE_NAME] as string | undefined;
    if (!token) {
      next();
      return;
    }

    const user = await getUserFromToken(token);
    if (!user) {
      res.clearCookie(env.SESSION_COOKIE_NAME, {
        httpOnly: true,
        secure: env.COOKIE_SECURE,
        sameSite: env.COOKIE_SAMESITE,
        domain: env.COOKIE_DOMAIN || undefined,
      });
      next();
      return;
    }

    req.user = user;
    req.sessionToken = token;
    next();
  } catch (err) {
    logger.debug({ err }, 'Session verification failed');
    res.clearCookie(env.SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      sameSite: env.COOKIE_SAMESITE,
      domain: env.COOKIE_DOMAIN || undefined,
    });
    next();
  }
}

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
