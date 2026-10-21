import { Router } from 'express';
import { emailVerificationSchema, manualVerificationSchema, profileUpdateSchema } from '@revoshelf/shared';
import { supabaseAdmin } from '../supabase';
import { AppError, dbError, h } from '../lib/errors';
import { authed, authenticate, PROFILE_SELECT, resolveUser } from '../middleware/auth';
import { toMe } from '../lib/dto';
import { env } from '../env';
import { removeImages, storeImage, upload } from '../lib/upload';

export const meRouter = Router();

// A suspended user may still read their own status (so the UI can explain), so no notSuspended here.
meRouter.get('/me', authenticate, h(async (req, res) => res.json(toMe(req.user!))));

meRouter.patch('/me', ...authed, h(async (req, res) => {
  const body = profileUpdateSchema.parse(req.body);
  const p = req.user!.profile;
  const update: Record<string, unknown> = {};
  if (body.displayName !== undefined) update.display_name = body.displayName;
  if (body.academicYear !== undefined) update.academic_year = body.academicYear;
  if (body.campusId !== undefined && body.campusId !== p.campus_id) {
    if (!['unverified', 'rejected'].includes(p.student_status)) {
      throw new AppError(403, 'Your campus cannot be changed once verification has started. Contact support.', 'CAMPUS_LOCKED');
    }
    const { data: campus } = await supabaseAdmin.from('campuses').select('id').eq('id', body.campusId).maybeSingle();
    if (!campus) throw new AppError(400, 'Unknown campus');
    update.campus_id = body.campusId;
  }
  if (Object.keys(update).length) {
    const { error } = await supabaseAdmin.from('profiles').update(update).eq('id', req.user!.id);
    if (error) dbError(error);
  }
  const fresh = await resolveUser(req.headers.authorization);
  res.json(toMe(fresh ?? req.user!));
}));

meRouter.post('/me/avatar', ...authed, upload.single('file'), h(async (req, res) => {
  if (!req.file) throw new AppError(400, 'No file uploaded');
  if (req.file.size > 2 * 1024 * 1024) throw new AppError(413, 'Avatar must be 2 MB or smaller');
  const path = await storeImage(env.AVATARS_BUCKET, req.user!.id, req.file);
  const old: string | null = req.user!.profile.avatar_url;
  const url = `${env.SUPABASE_URL}/storage/v1/object/public/${env.AVATARS_BUCKET}/${path}`;
  const { error } = await supabaseAdmin.from('profiles').update({ avatar_url: url }).eq('id', req.user!.id);
  if (error) {
    await removeImages(env.AVATARS_BUCKET, [path]);
    dbError(error);
  }
  const marker = `/${env.AVATARS_BUCKET}/`;
  if (old && old.includes(marker)) await removeImages(env.AVATARS_BUCKET, [old.split(marker)[1]]);
  const fresh = await resolveUser(req.headers.authorization);
  res.json(toMe(fresh ?? req.user!));
}));

/* ---------- student verification ---------- */
meRouter.post('/verification/email', ...authed, h(async (req, res) => {
  const { campusId } = emailVerificationSchema.parse(req.body);
  const u = req.user!;
  if (u.profile.student_status === 'verified') throw new AppError(409, 'Already verified');
  if (!u.emailVerified) throw new AppError(403, 'Confirm your email address first (check your inbox)', 'EMAIL_NOT_CONFIRMED');

  const { data: campus } = await supabaseAdmin.from('campuses').select('id,college_id').eq('id', campusId).maybeSingle();
  if (!campus) throw new AppError(400, 'Unknown campus');

  const domain = u.email.split('@')[1]?.toLowerCase() ?? '';
  const { data: domains, error } = await supabaseAdmin.from('verified_email_domains').select('domain').eq('college_id', campus.college_id);
  if (error) dbError(error);
  const ok = (domains ?? []).some((d: any) => domain === d.domain || domain.endsWith(`.${d.domain}`));
  if (!ok) {
    throw new AppError(422, 'Your email domain is not on this college\'s allowlist. Use a college email, or request manual verification.', 'DOMAIN_NOT_ALLOWED');
  }
  const { error: uerr } = await supabaseAdmin
    .from('profiles')
    .update({ student_status: 'verified', verified_at: new Date().toISOString(), campus_id: campusId })
    .eq('id', u.id);
  if (uerr) dbError(uerr);
  const fresh = await resolveUser(req.headers.authorization);
  res.json(toMe(fresh ?? u));
}));

meRouter.post('/verification/manual', ...authed, h(async (req, res) => {
  const body = manualVerificationSchema.parse(req.body);
  const u = req.user!;
  if (!['unverified', 'rejected'].includes(u.profile.student_status)) throw new AppError(409, 'A verification is already pending or complete');
  const { data: campus } = await supabaseAdmin.from('campuses').select('id').eq('id', body.campusId).maybeSingle();
  if (!campus) throw new AppError(400, 'Unknown campus');
  const { error } = await supabaseAdmin.from('verification_requests').insert({ user_id: u.id, campus_id: body.campusId, evidence: body.evidence });
  if (error) dbError(error);
  const { error: uerr } = await supabaseAdmin.from('profiles').update({ student_status: 'pending', campus_id: body.campusId }).eq('id', u.id);
  if (uerr) dbError(uerr);
  const fresh = await resolveUser(req.headers.authorization);
  res.status(201).json(toMe(fresh ?? u));
}));
