import { vi } from 'vitest';

export interface Call { table: string; method: string; args: unknown[] }
export const calls: Call[] = [];
export const results: Record<string, unknown> = {};
export const authUsers: Record<string, { id: string; email: string; email_confirmed_at: string | null }> = {};

/** Chainable, awaitable stand-in for the supabase-js query builder. Records every call for assertions. */
function chain(table: string, result: unknown) {
  const p: any = new Proxy(function () {}, {
    get(_t, prop: string) {
      if (prop === 'then') return (res: any, rej: any) => Promise.resolve(result).then(res, rej);
      return (...args: unknown[]) => {
        calls.push({ table, method: prop, args });
        return p;
      };
    },
  });
  return p;
}

export const fakeSupabase = {
  auth: {
    getUser: vi.fn(async (token: string) => {
      const u = authUsers[token];
      return u ? { data: { user: u }, error: null } : { data: { user: null }, error: { message: 'bad token' } };
    }),
  },
  from: vi.fn((table: string) => chain(table, results[table] ?? { data: null, error: null, count: 0 })),
  storage: { from: () => ({ upload: vi.fn(), remove: vi.fn() }) },
};

export function reset() {
  calls.length = 0;
  for (const k of Object.keys(results)) delete results[k];
  for (const k of Object.keys(authUsers)) delete authUsers[k];
}

export const UID = '11111111-1111-4111-8111-111111111111';
export const OTHER = '22222222-2222-4222-8222-222222222222';
export const CAMPUS = '33333333-3333-4333-8333-333333333333';
export const LISTING = '44444444-4444-4444-8444-444444444444';

export function loginAs(token: string, profile: Record<string, unknown>, id = UID) {
  authUsers[token] = { id, email: 'student@example.edu', email_confirmed_at: new Date().toISOString() };
  results.profiles = { data: { id, display_name: 'Test User', student_status: 'verified', role: 'user', suspended: false, campus_id: CAMPUS, ...profile }, error: null };
}
