import { z } from 'zod';

const envSchema = z.object({
  // --- Server ---
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().min(1).default('0.0.0.0'),
  API_PREFIX: z.string().min(1).default('/api/v1'),

  // --- Redis ---
  REDIS_HOST: z.string().min(1).default('127.0.0.1'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().default(''),
  REDIS_DB: z.coerce.number().int().min(0).default(0),
  REDIS_MAX_RETRIES: z.coerce.number().int().min(0).default(3),
  REDIS_RETRY_DELAY: z.coerce.number().int().positive().default(1000),

  // --- Supabase ---
  SUPABASE_URL: z.string().url({ message: 'SUPABASE_URL must be a valid URL' }),
  SUPABASE_ANON_KEY: z.string().min(1, { message: 'SUPABASE_ANON_KEY is required' }),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, { message: 'SUPABASE_SERVICE_ROLE_KEY is required' }),
  SUPABASE_JWT_SECRET: z.string().min(1, { message: 'SUPABASE_JWT_SECRET is required' }),

  // --- Groq ---
  GROQ_API_KEY: z.string().min(1, { message: 'GROQ_API_KEY is required' }),
  GROQ_MODEL: z.string().min(1).default('llama-3.3-70b-versatile'),
  GROQ_MAX_TOKENS: z.coerce.number().int().positive().default(4096),
  GROQ_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.7),
  GROQ_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  // Small, cheap model for the post-answer follow-up generation step.
  GROQ_FOLLOWUP_MODEL: z.string().min(1).default('llama-3.1-8b-instant'),

  // --- Tinyfish ---
  TINYFISH_API_KEY: z.string().min(1, { message: 'TINYFISH_API_KEY is required' }),
  TINYFISH_SEARCH_URL: z.string().url().default('https://api.tinyfish.io/v1/search'),
  TINYFISH_CRAWL_URL: z.string().url().default('https://api.tinyfish.io/v1/crawl'),
  TINYFISH_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  TINYFISH_MAX_RESULTS: z.coerce.number().int().positive().default(10),

  // --- Socket.IO ---
  SOCKET_CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  SOCKET_PATH: z.string().min(1).default('/socket.io'),
  SOCKET_PING_TIMEOUT: z.coerce.number().int().positive().default(60000),
  SOCKET_PING_INTERVAL: z.coerce.number().int().positive().default(25000),
  SOCKET_MAX_CONNECTIONS: z.coerce.number().int().positive().default(1000),

  // --- Logging ---
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  LOG_FORMAT: z.enum(['pretty', 'json']).default('pretty'),
  LOG_FILE_ENABLED: z
    .string()
    .default('false')
    .transform((val: string) => val === 'true'),
  LOG_FILE_PATH: z.string().default('./logs/app.log'),

  // --- Rate Limiting ---
  // Legacy group: kept for any callers that still read it. The active
  // limiter is the per-user token bucket below.
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_SEARCH_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_SEARCH_MAX_REQUESTS: z.coerce.number().int().positive().default(10),
  // Active token-bucket rate limit (per authenticated user, or per IP
  // for anonymous callers). Capacity = burst size; refill = sustained
  // rate per hour. Defaults: 100 requests/hour, 100 burst.
  RATE_LIMIT_BUCKET_CAPACITY: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_REFILL_PER_HOUR: z.coerce.number().int().positive().default(100),

  // --- CORS ---
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  CORS_CREDENTIALS: z
    .string()
    .default('true')
    .transform((val: string) => val === 'true'),

  // --- BullMQ ---
  BULLMQ_DEFAULT_ATTEMPTS: z.coerce.number().int().positive().default(3),
  BULLMQ_BACKOFF_TYPE: z.enum(['exponential', 'fixed']).default('exponential'),
  BULLMQ_BACKOFF_DELAY: z.coerce.number().int().positive().default(1000),
  USE_BULLMQ: z
    .string()
    .default('true')
    .transform((val: string) => val === 'true'),

  // --- Auth (backend-mediated Google OAuth via Supabase) ---
  // SESSION_SECRET signs the session cookie. Must be at least 32 chars.
  SESSION_SECRET: z
    .string()
    .min(32, { message: 'SESSION_SECRET must be at least 32 characters' }),
  // The URL the user lands on after Google — this is the BACKEND's callback,
  // e.g. https://cogniitsearch.allkvd.dev/api/v1/auth/callback
  GOOGLE_OAUTH_REDIRECT_URI: z.string().url({
    message: 'GOOGLE_OAUTH_REDIRECT_URI must be a valid URL',
  }),
  // Where the callback 302s the browser to on success, e.g. https://cogniitsearch.allkvd.dev
  FRONTEND_PUBLIC_URL: z.string().url({
    message: 'FRONTEND_PUBLIC_URL must be a valid URL',
  }),
  // Cookie hardening
  COOKIE_DOMAIN: z.string().default(''),
  COOKIE_SECURE: z
    .string()
    .default('true')
    .transform((val: string) => val === 'true'),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  COOKIE_MAX_AGE_MS: z.coerce.number().int().positive().default(60 * 60 * 24 * 7 * 1000), // 7 days
  // Name of the httpOnly session cookie the backend issues
  SESSION_COOKIE_NAME: z.string().min(1).default('sb-session'),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `❌ Environment validation failed:\n${formatted}\n\nPlease check your .env file against .env.example.`
    );
  }

  return result.data;
}

export const env: Env = validateEnv();
