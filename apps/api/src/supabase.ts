import { createClient } from '@supabase/supabase-js';
import { env } from './env';

/** Service-role client: bypasses RLS. Server-side only; every caller must authorize explicitly. */
export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
