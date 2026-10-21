import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config(); // apps/api/.env
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') }); // repo-root .env (does not override)

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  LISTINGS_BUCKET: z.string().default('listing-images'),
  AVATARS_BUCKET: z.string().default('avatars'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}
export const env = parsed.data;
export const corsOrigins = env.CORS_ORIGINS.split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
