import { firebaseAuth } from './firebase';

export const API_BASE = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:4000/api/v1').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string, public details?: { path: string; message: string }[]) {
    super(message);
  }
}

interface Opts { method?: string; body?: unknown; form?: FormData }

export async function api<T = void>(path: string, opts: Opts = {}): Promise<T> {
  const token = firebaseAuth.currentUser ? await firebaseAuth.currentUser.getIdToken() : null;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { method: opts.method ?? 'GET', headers, body });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.', 'NETWORK');
  }
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const e = json?.error;
    const detail = e?.details?.[0] ? `: ${e.details[0].message}` : '';
    throw new ApiError(res.status, (e?.message ?? 'Request failed') + (e?.code === 'VALIDATION' ? detail : ''), e?.code, e?.details);
  }
  return json as T;
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');
export const inr = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
export const ago = (iso: string) => {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  const t: [number, string][] = [[31536000, 'y'], [2592000, 'mo'], [86400, 'd'], [3600, 'h'], [60, 'm']];
  for (const [sec, u] of t) if (s >= sec) return `${Math.floor(s / sec)}${u} ago`;
  return 'just now';
};
