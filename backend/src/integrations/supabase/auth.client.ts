import { supabaseAdmin } from '../../config/supabase.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

/**
 * Backend-mediated Google OAuth via Supabase.
 *
 * The frontend never sees Supabase. This module is the only place that
 * calls `supabase.auth.*` on the server. It exposes three operations:
 *
 *   1. `getOAuthUrl()`        — returns the Supabase-hosted Google sign-in URL.
 *   2. `exchangeCodeForSession(code)` — exchanges the OAuth `code` for a session.
 *   3. `getUserFromToken(token)`     — verifies a JWT and returns the user.
 *   4. `signOut(token)`              — invalidates a session server-side.
 *
 * Cookies are set/cleared by the auth controller (not here) so the
 * cookie policy lives next to the HTTP code that needs it.
 */

export interface SessionUser {
  id: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  provider: string | null;
}

function toSessionUser(u: {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
  app_metadata?: Record<string, unknown> | null;
}): SessionUser {
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  const app = (u.app_metadata ?? {}) as Record<string, unknown>;
  const provider =
    typeof app.provider === 'string' ? app.provider : null;
  return {
    id: u.id,
    email: u.email ?? null,
    displayName:
      typeof meta.full_name === 'string'
        ? meta.full_name
        : typeof meta.name === 'string'
          ? meta.name
          : null,
    avatarUrl:
      typeof meta.avatar_url === 'string'
        ? meta.avatar_url
        : typeof meta.picture === 'string'
          ? meta.picture
          : null,
    provider,
  };
}

/**
 * Build the Supabase OAuth URL for Google. The browser will be redirected
 * to this URL by the auth controller; after Google, Supabase redirects to
 * `env.GOOGLE_OAUTH_REDIRECT_URI` (which is our backend callback).
 */
export async function getOAuthUrl(): Promise<string> {
  const { data, error } = await supabaseAdmin.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: env.GOOGLE_OAUTH_REDIRECT_URI,
      // Skip Supabase's default session-creation step in the browser; the
      // server will exchange the code instead.
      skipBrowserRedirect: true,
    },
  });

  if (error || !data?.url) {
    logger.error({ err: error?.message }, 'Failed to build Google OAuth URL');
    throw new Error('Failed to initiate Google sign-in');
  }
  return data.url;
}

/**
 * Exchange an OAuth `code` for a Supabase session. The returned `access_token`
 * and `refresh_token` are stored in an httpOnly cookie by the auth controller.
 */
export async function exchangeCodeForSession(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  expiresAt: number;
  user: SessionUser;
}> {
  const { data, error } = await supabaseAdmin.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    logger.error({ err: error?.message }, 'OAuth code exchange failed');
    throw new Error('Failed to complete Google sign-in');
  }

  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresIn: data.session.expires_in,
    expiresAt: data.session.expires_at ?? 0,
    user: toSessionUser(data.session.user),
  };
}

/**
 * Verify a Supabase access token and return the associated user.
 * Throws if the token is invalid, expired, or revoked.
 */
export async function getUserFromToken(token: string): Promise<SessionUser> {
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    throw new Error('Invalid or expired session');
  }
  return toSessionUser(data.user);
}

/**
 * Invalidate a Supabase session server-side. Used on logout.
 */
export async function signOut(token: string): Promise<void> {
  const { error } = await supabaseAdmin.auth.signOut(token);
  if (error) {
    logger.warn({ err: error.message }, 'Supabase signOut returned an error');
    // Non-fatal — the cookie has already been cleared by the controller.
  }
}
