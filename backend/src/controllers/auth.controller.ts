import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import {
  exchangeCodeForSession,
  getOAuthUrl,
  signOut,
} from '../integrations/supabase/auth.client.js';

const COOKIE_BASE = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: env.COOKIE_SAMESITE,
  domain: env.COOKIE_DOMAIN || undefined,
  path: '/',
} as const;

function setSessionCookie(res: Response, accessToken: string, maxAgeMs: number): void {
  res.cookie(env.SESSION_COOKIE_NAME, accessToken, {
    ...COOKIE_BASE,
    maxAge: maxAgeMs,
  });
}

function clearSessionCookie(res: Response): void {
  res.clearCookie(env.SESSION_COOKIE_NAME, { ...COOKIE_BASE });
}

/**
 * POST /auth/google
 * Returns `{ url }` — the Supabase-hosted Google sign-in URL. The frontend
 * does `window.location.href = url` to start the flow.
 */
export async function startGoogleSignIn(_req: Request, res: Response): Promise<void> {
  try {
    const url = await getOAuthUrl();
    res.status(StatusCodes.OK).json({
      success: true,
      data: { url },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start sign-in';
    logger.error({ err: message }, 'startGoogleSignIn failed');
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { message, code: 'OAUTH_START_FAILED' },
    });
  }
}

/**
 * GET /auth/callback?code=…
 * Google → Supabase → here. Exchanges the code for a Supabase session,
 * sets the httpOnly cookie, and 302-redirects back to the frontend.
 */
export async function handleOAuthCallback(req: Request, res: Response): Promise<void> {
  const code = typeof req.query.code === 'string' ? req.query.code : undefined;
  if (!code) {
    res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      error: { message: 'Missing OAuth code', code: 'OAUTH_NO_CODE' },
    });
    return;
  }

  try {
    const session = await exchangeCodeForSession(code);
    const maxAgeMs = Math.max(
      session.expiresIn * 1000,
      env.COOKIE_MAX_AGE_MS,
    );
    setSessionCookie(res, session.accessToken, maxAgeMs);
    logger.info({ userId: session.user.id, email: session.user.email }, 'User signed in');

    // 302 to the frontend SPA, which can read the cookie on next request
    // and use /auth/me to learn who's signed in.
    // Manual redirect (avoids Express's res.redirect quirks that have
    // bitten us in this codepath previously). Use literal 302; the
    // `http-status-codes` package exposes this as MOVED_TEMPORARILY,
    // NOT FOUND — using the number sidesteps that naming mismatch.
    res.status(302).setHeader('Location', env.FRONTEND_PUBLIC_URL).end();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OAuth exchange failed';
    logger.error({ err: message }, 'handleOAuthCallback failed');
    // Redirect to the frontend with an error flag so the UI can show a message.
    const url = new URL(env.FRONTEND_PUBLIC_URL);
    url.searchParams.set('auth_error', 'exchange_failed');
    res.status(302).setHeader('Location', url.toString()).end();
  }
}

/**
 * POST /auth/logout
 * Clears the session cookie and asks Supabase to invalidate the token.
 * Always returns 200 — logout is idempotent from the client's perspective.
 */
export async function logout(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[env.SESSION_COOKIE_NAME] as string | undefined;
  if (token) {
    try {
      await signOut(token);
    } catch {
      // already handled inside signOut
    }
  }
  clearSessionCookie(res);
  res.status(StatusCodes.OK).json({ success: true, data: { ok: true } });
}

/**
 * GET /auth/me
 * Returns the current user (from the httpOnly cookie) or 401.
 */
export async function me(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(StatusCodes.UNAUTHORIZED).json({
      success: false,
      error: { message: 'Not signed in', code: 'UNAUTHENTICATED' },
    });
    return;
  }
  res.status(StatusCodes.OK).json({
    success: true,
    data: { user: req.user },
  });
}
