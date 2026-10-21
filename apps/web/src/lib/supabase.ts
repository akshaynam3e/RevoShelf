import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
export const supabaseConfigError = !url || !key
  ? 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY'
  : null;

// Only the publishable key ever reaches the browser. RLS protects everything it can read.
const fallbackUrl = 'http://localhost:54321';
const fallbackKey = 'missing';

let client;
try {
  client = createClient(url ?? fallbackUrl, key ?? fallbackKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  });
} catch (error) {
  console.error('Invalid Supabase configuration', error);
  client = createClient(fallbackUrl, fallbackKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  });
}

export const supabase = client;
