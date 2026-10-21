import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { reportSchema } from '@revoshelf/shared';
import { supabaseAdmin } from '../supabase';
import { AppError, dbError, h } from '../lib/errors';
import { authed } from '../middleware/auth';

export const reportsRouter = Router();
const reportLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });

reportsRouter.post('/reports', reportLimiter, ...authed, h(async (req, res) => {
  const body = reportSchema.parse(req.body);
  const me = req.user!.id;
  let row: Record<string, unknown>;
  if (body.targetType === 'listing') {
    const { data } = await supabaseAdmin.from('listings').select('id,seller_id').eq('id', body.targetId).maybeSingle();
    if (!data) throw new AppError(404, 'Listing not found', 'NOT_FOUND');
    if (data.seller_id === me) throw new AppError(400, 'You cannot report your own listing');
    row = { listing_id: data.id };
  } else {
    const { data } = await supabaseAdmin.from('profiles').select('id').eq('id', body.targetId).maybeSingle();
    if (!data) throw new AppError(404, 'User not found', 'NOT_FOUND');
    if (data.id === me) throw new AppError(400, 'You cannot report yourself');
    row = { reported_user_id: data.id };
  }
  const { error } = await supabaseAdmin.from('reports').insert({ ...row, reporter_id: me, reason: body.reason, description: body.description || null });
  if (error) {
    if (error.code === '23505') throw new AppError(409, 'You already have an open report for this item', 'DUPLICATE_REPORT');
    dbError(error);
  }
  res.status(201).json({ ok: true });
}));
