import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/api/client';

export interface AuthUser {
  id: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  provider: string | null;
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Frontend auth hook.
 *
 * - On mount, hits `GET /auth/me` to learn the current user from the
 *   httpOnly session cookie. The browser sends the cookie automatically
 *   (axios `withCredentials: true`).
 * - `signInWithGoogle` calls `POST /auth/google`, receives a Supabase-hosted
 *   OAuth URL, and does `window.location.href = url`. The browser does the
 *   rest; on success it returns to `/api/v1/auth/callback`, which sets the
 *   cookie and 302s back to the SPA. This hook then re-fetches `/auth/me`.
 * - `signOut` calls `POST /auth/logout`, which clears the cookie.
 */
export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const data = await apiClient.get<{ user: AuthUser }>('/auth/me');
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signInWithGoogle = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { url } = await apiClient.post<{ url: string }>('/auth/google', {});
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    setLoading(true);
    try {
      await apiClient.post('/auth/logout', {});
    } finally {
      setUser(null);
      setLoading(false);
    }
  }, []);

  return { user, isLoading, error, signInWithGoogle, signOut, refresh };
}
