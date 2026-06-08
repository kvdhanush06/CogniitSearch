import { Router } from 'express';
import {
  search,
  chat,
  health,
  startGoogleSignIn,
  handleOAuthCallback,
  logout,
  me,
  listConversations,
  getConversationDetail,
  deleteConversation,
  reattachStream,
} from '../controllers/index.js';
import {
  validateBody,
  validateParams,
  searchRequestSchema,
  chatRequestSchema,
  conversationParamsSchema,
  reattachStreamParamsSchema,
} from '../controllers/validators/index.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { rateLimit } from '../middleware/rateLimit.middleware.js';

const router: Router = Router();

// --- Health Check ---
router.get('/health', health);

// --- Auth (backend-mediated Google OAuth via Supabase) ---
router.post('/auth/google', startGoogleSignIn);
router.get('/auth/callback', handleOAuthCallback);
router.post('/auth/logout', logout);
router.get('/auth/me', requireAuth, me);

// --- Search (rate-limited; loadSession runs first to identify the user) ---
router.post('/search', rateLimit, validateBody(searchRequestSchema), search);

// --- Chat (rate-limited) ---
router.post('/chat', rateLimit, validateBody(chatRequestSchema), chat);

// --- Conversation history (requires auth) ---
router.get('/conversations', requireAuth, listConversations);
router.get('/conversations/:id', requireAuth, validateParams(conversationParamsSchema), getConversationDetail);
router.delete('/conversations/:id', requireAuth, validateParams(conversationParamsSchema), deleteConversation);
// Reattach to a live or completed answer stream. Used by the SPA
// when the route changes mid-stream (or on hard reload) so the
// answer keeps flowing into the new mount instead of vanishing.
// The controller does its own auth check (the user must own the
// conversation); we don't use requireAuth here because the
// conversation itself carries the user ownership.
router.get(
  '/conversations/:id/messages/:messageId/stream',
  validateParams(reattachStreamParamsSchema),
  reattachStream,
);

// --- Legacy alias (kept for backward compat; same as /conversations/:id) ---
router.get('/conversation/:id', validateParams(conversationParamsSchema), getConversationDetail);

export default router;
