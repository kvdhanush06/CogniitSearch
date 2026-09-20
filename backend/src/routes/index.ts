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
  validateQuery,
  searchRequestSchema,
  chatRequestSchema,
  conversationParamsSchema,
  reattachStreamParamsSchema,
  paginationQuerySchema,
} from '../controllers/validators/index.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { rateLimit } from '../middleware/rateLimit.middleware.js';

const router: Router = Router();

router.get('/health', health);

router.post('/auth/google', startGoogleSignIn);
router.get('/auth/callback', handleOAuthCallback);
router.post('/auth/logout', logout);
router.get('/auth/me', requireAuth, me);

router.post('/search', rateLimit, validateBody(searchRequestSchema), search);
router.post('/chat', rateLimit, validateBody(chatRequestSchema), chat);

router.get(
  '/conversations',
  requireAuth,
  validateQuery(paginationQuerySchema),
  listConversations,
);
router.get(
  '/conversations/:id',
  requireAuth,
  validateParams(conversationParamsSchema),
  getConversationDetail,
);
router.delete(
  '/conversations/:id',
  requireAuth,
  validateParams(conversationParamsSchema),
  deleteConversation,
);
router.get(
  '/conversations/:id/messages/:messageId/stream',
  requireAuth,
  validateParams(reattachStreamParamsSchema),
  reattachStream,
);

// Legacy alias remains protected by the same authentication boundary.
router.get(
  '/conversation/:id',
  requireAuth,
  validateParams(conversationParamsSchema),
  getConversationDetail,
);

export default router;
