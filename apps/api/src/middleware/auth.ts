import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '../supabase';
import { AppError } from '../lib/errors';
import { firebaseAdminAuth } from '../firebase';

export const PROFILE_SELECT = '*, campus:campuses(id,name,college:colleges(name))';

export interface AuthUser {
  id: string;
  email: string;
  emailVerified: boolean;
  provider: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profile: any;
}
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** Verifies the Firebase ID token server-side and maps it to a local profile. */
export async function resolveUser(authorization: string | undefined): Promise<AuthUser | null> {
  if (!authorization || !authorization.startsWith('Bearer ')) return null;
  const token = authorization.slice(7).trim();
  if (!token) return null;
  if (process.env.NODE_ENV === 'test') {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) return null;
    const u = data.user;
    const { data: profile } = await supabaseAdmin.from('profiles').select(PROFILE_SELECT).eq('id', u.id).maybeSingle();
    if (!profile) return null;
    return { id: u.id, email: u.email ?? '', emailVerified: !!u.email_confirmed_at, provider: 'test', profile };
  }
  const auth = firebaseAdminAuth();
  if (!auth) return null;
  let u;
  try { u = await auth.verifyIdToken(token); } catch { return null; }
  let { data: profile } = await supabaseAdmin.from('profiles').select(PROFILE_SELECT).eq('firebase_uid', u.uid).maybeSingle();
  if (!profile) {
    const displayName = String(u.name ?? u.email?.split('@')[0] ?? `User ${u.uid.slice(0, 6)}`).slice(0, 60);
    const created = await supabaseAdmin.from('profiles').insert({ id: randomUUID(), firebase_uid: u.uid, display_name: displayName, student_status: 'verified', verified_at: new Date().toISOString() }).select(PROFILE_SELECT).single();
    if (created.error || !created.data) return null;
    profile = created.data;
  }
  return { id: profile.id, email: u.email ?? '', emailVerified: !!u.email_verified, provider: String(u.firebase?.sign_in_provider ?? 'firebase'), profile };
}

export const authenticate: RequestHandler = (req, _res, next) => {
  resolveUser(req.headers.authorization)
    .then((user) => {
      if (!user) throw new AppError(401, 'Authentication required', 'UNAUTHENTICATED');
      req.user = user;
      next();
    })
    .catch(next);
};

export const optionalAuth: RequestHandler = (req, _res, next) => {
  resolveUser(req.headers.authorization)
    .then((user) => {
      if (user) req.user = user;
      next();
    })
    .catch(() => next());
};

export const notSuspended: RequestHandler = (req, _res, next) => {
  if (req.user?.profile.suspended) return next(new AppError(403, 'Your account is suspended', 'SUSPENDED'));
  next();
};

export const requireVerified: RequestHandler = (req, _res, next) => {
  if (req.user?.profile.student_status !== 'verified') {
    return next(new AppError(403, 'Student verification is required for this action', 'STUDENT_VERIFICATION_REQUIRED'));
  }
  next();
};

export const requireAdmin: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  if (req.user?.profile.role !== 'admin') return next(new AppError(403, 'Administrator access required', 'FORBIDDEN'));
  next();
};

export const authed = [authenticate, notSuspended];
export const verified = [authenticate, notSuspended, requireVerified];
export const admin = [authenticate, notSuspended, requireAdmin];
