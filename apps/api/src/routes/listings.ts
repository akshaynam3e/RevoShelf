import { Router } from 'express';
import { canSellerTransition, listingInputSchema, listingQuerySchema, listingStatusSchema, listingUpdateSchema, MAX_IMAGES_PER_LISTING, type Page } from '@revoshelf/shared';
import { supabaseAdmin } from '../supabase';
import { AppError, dbError, h } from '../lib/errors';
import { authed, optionalAuth, verified } from '../middleware/auth';
import { LISTING_SELECT, toListing } from '../lib/dto';
import { uuidParam } from '../lib/params';
import { env } from '../env';
import { removeImages, storeImage, upload } from '../lib/upload';

/* eslint-disable @typescript-eslint/no-explicit-any */
export const listingsRouter = Router();

async function favoriteSet(userId: string | undefined, ids: string[]): Promise<Set<string>> {
  if (!userId || !ids.length) return new Set();
  const { data } = await supabaseAdmin.from('favorites').select('listing_id').eq('user_id', userId).in('listing_id', ids);
  return new Set((data ?? []).map((f: any) => f.listing_id));
}

async function ownedListing(req: any, id: string) {
  const { data, error } = await supabaseAdmin.from('listings').select(LISTING_SELECT).eq('id', id).maybeSingle();
  if (error) dbError(error);
  // Return 404 (not 403) so other users' non-public listings are indistinguishable from missing ones.
  const row = data as { seller_id?: string } | null;
  if (!row || row.seller_id !== req.user.id) throw new AppError(404, 'Listing not found', 'NOT_FOUND');
  return row as any;
}

listingsRouter.get('/listings', optionalAuth, h(async (req, res) => {
  const q = listingQuerySchema.parse(req.query);
  let query = supabaseAdmin.from('listings').select(LISTING_SELECT, { count: 'exact' }).eq('status', 'active');
  if (q.campusId) query = query.eq('campus_id', q.campusId);
  if (q.category) query = query.eq('category', q.category);
  if (q.condition) query = query.eq('condition', q.condition);
  if (q.minPrice !== undefined) query = query.gte('price_inr', q.minPrice);
  if (q.maxPrice !== undefined) query = query.lte('price_inr', q.maxPrice);
  if (q.q) {
    const term = q.q.replace(/[%,()*\\_:"']/g, ' ').replace(/\s+/g, ' ').trim();
    if (term) query = query.or(`title.ilike.%${term}%,description.ilike.%${term}%`);
  }
  if (q.sort === 'price_asc') query = query.order('price_inr', { ascending: true }).order('created_at', { ascending: false });
  else if (q.sort === 'price_desc') query = query.order('price_inr', { ascending: false }).order('created_at', { ascending: false });
  else query = query.order('created_at', { ascending: false });
  const from = (q.page - 1) * q.pageSize;
  const { data, error, count } = await query.range(from, from + q.pageSize - 1);
  if (error) dbError(error);
  const rows = (data ?? []) as any[];
  const favs = await favoriteSet(req.user?.id, rows.map((r) => r.id));
  const total = count ?? rows.length;
  const body: Page<ReturnType<typeof toListing>> = {
    items: rows.map((r) => toListing(r, req.user ? favs.has(r.id) : undefined)),
    page: q.page,
    pageSize: q.pageSize,
    total,
    hasMore: from + rows.length < total,
  };
  res.json(body);
}));

listingsRouter.get('/me/listings', ...authed, h(async (req, res) => {
  const { data, error } = await supabaseAdmin.from('listings').select(LISTING_SELECT).eq('seller_id', req.user!.id).order('created_at', { ascending: false });
  if (error) dbError(error);
  res.json((data ?? []).map((r: any) => toListing(r)));
}));

listingsRouter.get('/listings/:id', optionalAuth, h(async (req, res) => {
  const id = uuidParam(req, 'id');
  const { data, error } = await supabaseAdmin.from('listings').select(LISTING_SELECT).eq('id', id).maybeSingle();
  if (error) dbError(error);
  const row = data as any;
  const isOwner = row && req.user?.id === row.seller_id;
  const isAdmin = req.user?.profile.role === 'admin';
  const publiclyVisible = row && ['active', 'reserved', 'sold'].includes(row.status);
  if (!row || !(publiclyVisible || isOwner || isAdmin)) throw new AppError(404, 'Listing not found', 'NOT_FOUND');
  const favs = await favoriteSet(req.user?.id, [id]);
  res.json(toListing(row, req.user ? favs.has(id) : undefined));
}));

listingsRouter.post('/listings', ...verified, h(async (req, res) => {
  const body = listingInputSchema.parse(req.body);
  const profile = req.user!.profile;
  if (!profile.campus_id) throw new AppError(400, 'Choose your campus before listing items', 'PROFILE_INCOMPLETE');
  const { data, error } = await supabaseAdmin
    .from('listings')
    .insert({
      seller_id: req.user!.id, // from the verified token, never the client
      campus_id: profile.campus_id, // from the profile, never the client
      title: body.title,
      description: body.description,
      price_inr: body.priceInr,
      category: body.category,
      condition: body.condition,
    })
    .select(LISTING_SELECT)
    .single();
  if (error) dbError(error);
  res.status(201).json(toListing(data));
}));

listingsRouter.patch('/listings/:id', ...authed, h(async (req, res) => {
  const row = await ownedListing(req, uuidParam(req, 'id'));
  if (row.status === 'removed') throw new AppError(403, 'This listing was removed by a moderator', 'REMOVED');
  const body = listingUpdateSchema.parse(req.body);
  const update: Record<string, unknown> = {};
  if (body.title !== undefined) update.title = body.title;
  if (body.description !== undefined) update.description = body.description;
  if (body.priceInr !== undefined) update.price_inr = body.priceInr;
  if (body.category !== undefined) update.category = body.category;
  if (body.condition !== undefined) update.condition = body.condition;
  const { data, error } = await supabaseAdmin.from('listings').update(update).eq('id', row.id).eq('seller_id', req.user!.id).select(LISTING_SELECT).single();
  if (error) dbError(error);
  res.json(toListing(data));
}));

listingsRouter.post('/listings/:id/status', ...authed, h(async (req, res) => {
  const row = await ownedListing(req, uuidParam(req, 'id'));
  const { status } = listingStatusSchema.parse(req.body);
  if (!canSellerTransition(row.status, status)) throw new AppError(409, `Cannot change a ${row.status} listing to ${status}`, 'INVALID_TRANSITION');
  const { data, error } = await supabaseAdmin.from('listings').update({ status }).eq('id', row.id).eq('seller_id', req.user!.id).select(LISTING_SELECT).single();
  if (error) dbError(error);
  res.json(toListing(data));
}));

listingsRouter.delete('/listings/:id', ...authed, h(async (req, res) => {
  const row = await ownedListing(req, uuidParam(req, 'id'));
  if (row.status === 'removed') throw new AppError(403, 'Removed listings are kept for moderation records', 'REMOVED');
  await removeImages(env.LISTINGS_BUCKET, (row.images ?? []).map((i: any) => i.storage_path));
  const { error } = await supabaseAdmin.from('listings').delete().eq('id', row.id).eq('seller_id', req.user!.id);
  if (error) dbError(error);
  res.status(204).end();
}));

listingsRouter.post('/listings/:id/images', ...authed, upload.array('files', MAX_IMAGES_PER_LISTING), h(async (req, res) => {
  const row = await ownedListing(req, uuidParam(req, 'id'));
  if (row.status === 'removed') throw new AppError(403, 'This listing was removed by a moderator', 'REMOVED');
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!files.length) throw new AppError(400, 'No files uploaded');
  const existing: any[] = row.images ?? [];
  if (existing.length + files.length > MAX_IMAGES_PER_LISTING) {
    throw new AppError(400, `A listing can have at most ${MAX_IMAGES_PER_LISTING} images`, 'TOO_MANY_IMAGES');
  }
  let position = existing.reduce((m, i) => Math.max(m, i.position), -1) + 1;
  const stored: string[] = [];
  try {
    for (const f of files) {
      const path = await storeImage(env.LISTINGS_BUCKET, `${req.user!.id}/${row.id}`, f);
      stored.push(path);
      const { error } = await supabaseAdmin.from('listing_images').insert({ listing_id: row.id, storage_path: path, position: position++ });
      if (error) dbError(error);
    }
  } catch (e) {
    await removeImages(env.LISTINGS_BUCKET, stored);
    await supabaseAdmin.from('listing_images').delete().in('storage_path', stored);
    throw e;
  }
  const { data, error } = await supabaseAdmin.from('listings').select(LISTING_SELECT).eq('id', row.id).single();
  if (error) dbError(error);
  res.status(201).json(toListing(data));
}));

listingsRouter.delete('/listings/:id/images/:imageId', ...authed, h(async (req, res) => {
  const row = await ownedListing(req, uuidParam(req, 'id'));
  const imageId = uuidParam(req, 'imageId');
  const img = (row.images ?? []).find((i: any) => i.id === imageId);
  if (!img) throw new AppError(404, 'Image not found', 'NOT_FOUND');
  const { error } = await supabaseAdmin.from('listing_images').delete().eq('id', imageId).eq('listing_id', row.id);
  if (error) dbError(error);
  await removeImages(env.LISTINGS_BUCKET, [img.storage_path]);
  res.status(204).end();
}));
