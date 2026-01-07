import { z } from 'zod';

// PORT is the standard env var for Railway/Render/Heroku/Fly.io
// API_PORT is our custom fallback, 3001 is the local dev default
const portDefault = process.env.PORT || process.env.API_PORT || '3001';

const envSchema = z.object({
  API_PORT: z.coerce.number().default(parseInt(portDefault, 10)),
  API_HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  SUPABASE_URL: z.string().url(),
  SUPABASE_KEY: z.string().min(1),
  SUPABASE_SERVICE_KEY: z.string().optional(),
  
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW: z.coerce.number().default(60000),
  CORS_ORIGINS: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment variables:', result.error.format());
    process.exit(1);
  }
  return result.data;
}

export const env = validateEnv();

// Constants
export const SIGNED_URL_EXPIRY = 3600; // 1 hour