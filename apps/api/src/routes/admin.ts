import { Router } from 'express';
import { z } from 'zod';
import { adminNoteSchema, adminRequiredNoteSchema, campusSchema, collegeSchema, domainSchema } from '@revoshelf/shared';
import { supabaseAdmin } from '../supabase';
import { AppError, dbError, h } from '../lib/errors';
import { admin } from '../middleware/auth';
import { LISTING_SELECT, toListing } from '../lib/dto';
import { uuidParam } from '../lib/params';

/* eslint-disable @typescript-eslint/no-explicit-any */
export const adminRouter = Router();
adminRouter.use('/admin', ...admin); // every /admin route: verified token + not suspended + role === 'admin' (read from DB)

async function log(adminId: string, action: string, fields: { listingId?: string; targetUserId?: string; reportId?: string; note?: string }) {
  const { error } = await supabaseAdmin.from('moderation_actions').insert({
    admin_id: adminId,
    action,
    listing_id: fields.listingId ?? null,
    target_user_id: fields.targetUserId ?? null,
    report_id: fields.reportId ?? null,
    note: fields.note || null,
  });
  if (error) dbError(error);
}

async function closeReport(reportId: string | undefined, adminId: string, status: 'dismissed' | 'actioned') {
  if (!reportId) return;
  await supabaseAdmin.from('reports').update({ status, reviewed_by: adminId, reviewed_at: new Date().toISOString() }).eq('id', reportId);
}

adminRouter.get('/admin/reports', h(async (req, res) => {
  const status = z.enum(['open', 'dismissed', 'actioned', 'all']).default('open').parse(req.query.status);
  let q = supabaseAdmin
    .from('reports')
    .select(
      'id,reason,description,status,created_at,reviewed_at,' +
        'reporter:profiles!reports_reporter_id_fkey(id,display_name),' +
        'listing:listings(id,title,status,seller:profiles!listings_seller_id_fkey(id,display_name,suspended)),' +
        'reported_user:profiles!reports_reported_user_id_fkey(id,display_name,suspended)'
    )
    .order('created_at', { ascending: false })
    .limit(200);
  if (status !== 'all') q = q.eq('status', status);
  const { data, error } = await q;
  if (error) dbError(error);
  res.json(data ?? []);
}));

adminRouter.post('/admin/reports/:id/dismiss', h(async (req, res) => {
  const id = uuidParam(req, 'id');
  const { note } = adminNoteSchema.parse(req.body ?? {});
  const { data, error } = await supabaseAdmin
    .from('reports')
    .update({ status: 'dismissed', reviewed_by: req.user!.id, reviewed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'open')
    .select('id')
    .maybeSingle();
  if (error) dbError(error);
  if (!data) throw new AppError(404, 'Open report not found', 'NOT_FOUND');
  await log(req.user!.id, 'dismiss_report', { reportId: id, note });
  res.status(204).end();
}));

adminRouter.get('/admin/listings', h(async (req, res) => {
  const status = z.enum(['active', 'reserved', 'sold', 'archived', 'removed']).default('removed').parse(req.query.status);
  const { data, error } = await supabaseAdmin.from('listings').select(LISTING_SELECT).eq('status', status).order('updated_at', { ascending: false }).limit(100);
  if (error) dbError(error);
  res.json((data ?? []).map((r: any) => toListing(r)));
}));

adminRouter.post('/admin/listings/:id/remove', h(async (req, res) => {
  const id = uuidParam(req, 'id');
  const { note, reportId } = adminNoteSchema.parse(req.body ?? {});
  const { data, error } = await supabaseAdmin.from('listings').update({ status: 'removed' }).eq('id', id).neq('status', 'removed').select('id').maybeSingle();
  if (error) dbError(error);
  if (!data) throw new AppError(404, 'Listing not found or already removed', 'NOT_FOUND');
  await log(req.user!.id, 'remove_listing', { listingId: id, reportId, note });
  await closeReport(reportId, req.user!.id, 'actioned');
  res.status(204).end();
}));

adminRouter.post('/admin/listings/:id/restore', h(async (req, res) => {
  const id = uuidParam(req, 'id');
  const { note } = adminNoteSchema.parse(req.body ?? {});
  const { data, error } = await supabaseAdmin.from('listings').update({ status: 'active' }).eq('id', id).eq('status', 'removed').select('id').maybeSingle();
  if (error) dbError(error);
  if (!data) throw new AppError(404, 'Removed listing not found', 'NOT_FOUND');
  await log(req.user!.id, 'restore_listing', { listingId: id, note });
  res.status(204).end();
}));

adminRouter.get('/admin/users/suspended', h(async (_req, res) => {
  const { data, error } = await supabaseAdmin.from('profiles').select('id,display_name,created_at').eq('suspended', true).limit(200);
  if (error) dbError(error);
  res.json(data ?? []);
}));

adminRouter.post('/admin/users/:id/suspend', h(async (req, res) => {
  const id = uuidParam(req, 'id');
  const { note, reportId } = adminRequiredNoteSchema.parse(req.body ?? {}); // a justification is mandatory
  if (id === req.user!.id) throw new AppError(400, 'You cannot suspend yourself');
  const { data: target } = await supabaseAdmin.from('profiles').select('id,role').eq('id', id).maybeSingle();
  if (!target) throw new AppError(404, 'User not found', 'NOT_FOUND');
  if (target.role === 'admin') throw new AppError(403, 'Administrators cannot be suspended here');
  const { error } = await supabaseAdmin.from('profiles').update({ suspended: true }).eq('id', id);
  if (error) dbError(error);
  await supabaseAdmin.from('listings').update({ status: 'removed' }).eq('seller_id', id).in('status', ['active', 'reserved']);
  await log(req.user!.id, 'suspend_user', { targetUserId: id, reportId, note });
  await closeReport(reportId, req.user!.id, 'actioned');
  res.status(204).end();
}));

adminRouter.post('/admin/users/:id/unsuspend', h(async (req, res) => {
  const id = uuidParam(req, 'id');
  const { note } = adminNoteSchema.parse(req.body ?? {});
  const { data, error } = await supabaseAdmin.from('profiles').update({ suspended: false }).eq('id', id).eq('suspended', true).select('id').maybeSingle();
  if (error) dbError(error);
  if (!data) throw new AppError(404, 'Suspended user not found', 'NOT_FOUND');
  await log(req.user!.id, 'unsuspend_user', { targetUserId: id, note });
  res.status(204).end();
}));

adminRouter.get('/admin/actions', h(async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from('moderation_actions')
    .select('id,action,note,created_at,listing_id,target_user_id,report_id,admin:profiles!moderation_actions_admin_id_fkey(display_name)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) dbError(error);
  res.json(data ?? []);
}));

adminRouter.get('/admin/verification-requests', h(async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from('verification_requests')
    .select('id,evidence,status,created_at,user:profiles!verification_requests_user_id_fkey(id,display_name),campus:campuses(id,name,college:colleges(name))')
    .eq('status', 'pending')
    .order('created_at')
    .limit(200);
  if (error) dbError(error);
  res.json(data ?? []);
}));

for (const decision of ['approve', 'reject'] as const) {
  adminRouter.post(`/admin/verification-requests/:id/${decision}`, h(async (req, res) => {
    const id = uuidParam(req, 'id');
    const { note } = adminNoteSchema.parse(req.body ?? {});
    const { data: reqRow } = await supabaseAdmin.from('verification_requests').select('id,user_id,campus_id,status').eq('id', id).maybeSingle();
    if (!reqRow || reqRow.status !== 'pending') throw new AppError(404, 'Pending request not found', 'NOT_FOUND');
    const approved = decision === 'approve';
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin.from('verification_requests').update({ status: approved ? 'approved' : 'rejected', reviewed_by: req.user!.id, reviewed_at: now }).eq('id', id);
    if (error) dbError(error);
    const profileUpdate = approved ? { student_status: 'verified', verified_at: now, campus_id: reqRow.campus_id } : { student_status: 'rejected' };
    const { error: perr } = await supabaseAdmin.from('profiles').update(profileUpdate).eq('id', reqRow.user_id);
    if (perr) dbError(perr);
    await log(req.user!.id, approved ? 'approve_verification' : 'reject_verification', { targetUserId: reqRow.user_id, note });
    res.status(204).end();
  }));
}

/* ---------- administrator-managed directory & email-domain allowlist ---------- */
adminRouter.get('/admin/domains', h(async (_req, res) => {
  const { data, error } = await supabaseAdmin.from('verified_email_domains').select('id,domain,college:colleges(id,name)').order('domain');
  if (error) dbError(error);
  res.json(data ?? []);
}));
adminRouter.post('/admin/domains', h(async (req, res) => {
  const b = domainSchema.parse(req.body);
  const { error } = await supabaseAdmin.from('verified_email_domains').insert({ college_id: b.collegeId, domain: b.domain });
  if (error) dbError(error);
  res.status(201).json({ ok: true });
}));
adminRouter.delete('/admin/domains/:id', h(async (req, res) => {
  const { error } = await supabaseAdmin.from('verified_email_domains').delete().eq('id', uuidParam(req, 'id'));
  if (error) dbError(error);
  res.status(204).end();
}));
adminRouter.post('/admin/colleges', h(async (req, res) => {
  const b = collegeSchema.parse(req.body);
  const { error } = await supabaseAdmin.from('colleges').insert({ name: b.name });
  if (error) dbError(error);
  res.status(201).json({ ok: true });
}));
adminRouter.post('/admin/campuses', h(async (req, res) => {
  const b = campusSchema.parse(req.body);
  const { error } = await supabaseAdmin.from('campuses').insert({ college_id: b.collegeId, name: b.name, city: b.city || null });
  if (error) dbError(error);
  res.status(201).json({ ok: true });
}));
