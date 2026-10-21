import { Router } from 'express';
import type { CollegeDTO } from '@revoshelf/shared';
import { supabaseAdmin } from '../supabase';
import { dbError, h } from '../lib/errors';
import { LISTING_SELECT, SELLER_SELECT, toListing, toSeller } from '../lib/dto';
import { optionalAuth } from '../middleware/auth';
import { uuidParam } from '../lib/params';
import { AppError } from '../lib/errors';

export const publicRouter = Router();

publicRouter.get('/colleges', h(async (_req, res) => {
  const { data, error } = await supabaseAdmin.from('colleges').select('id,name,campuses(id,name,city)').order('name');
  if (error) dbError(error);
  const out: CollegeDTO[] = (data ?? []).map((c: any) => ({
    id: c.id,
    name: c.name,
    campuses: [...(c.campuses ?? [])].sort((a: any, b: any) => a.name.localeCompare(b.name)),
  }));
  res.json(out);
}));

publicRouter.get('/users/:id', optionalAuth, h(async (req, res) => {
  const id = uuidParam(req, 'id');
  const { data: p, error } = await supabaseAdmin
    .from('profiles')
    .select(`${SELLER_SELECT},suspended,campus:campuses(id,name,college:colleges(name))`)
    .eq('id', id)
    .maybeSingle();
  if (error) dbError(error);
  if (!p || p.suspended) throw new AppError(404, 'User not found', 'NOT_FOUND');
  const { data: listings, error: lerr } = await supabaseAdmin
    .from('listings')
    .select(LISTING_SELECT)
    .eq('seller_id', id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(50);
  if (lerr) dbError(lerr);
  const campus = (p as any).campus;
  res.json({
    user: { ...toSeller(p), campus: campus ? { id: campus.id, name: campus.name, collegeName: campus.college?.name ?? '' } : null },
    listings: (listings ?? []).map((l: any) => toListing(l)),
  });
}));
