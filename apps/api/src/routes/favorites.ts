import { Router } from 'express';
import { supabaseAdmin } from '../supabase';
import { AppError, dbError, h } from '../lib/errors';
import { authed } from '../middleware/auth';
import { LISTING_SELECT, toListing } from '../lib/dto';
import { uuidParam } from '../lib/params';

/* eslint-disable @typescript-eslint/no-explicit-any */
export const favoritesRouter = Router();

favoritesRouter.get('/favorites', ...authed, h(async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('favorites')
    .select(`created_at, listing:listings(${LISTING_SELECT})`)
    .eq('user_id', req.user!.id) // users only ever see their own favorites
    .order('created_at', { ascending: false });
  if (error) dbError(error);
  const items = (data ?? [])
    .map((f: any) => f.listing)
    .filter((l: any) => l && ['active', 'reserved', 'sold'].includes(l.status))
    .map((l: any) => toListing(l, true));
  res.json(items);
}));

favoritesRouter.put('/favorites/:listingId', ...authed, h(async (req, res) => {
  const listingId = uuidParam(req, 'listingId');
  const { data: listing } = await supabaseAdmin.from('listings').select('id,status').eq('id', listingId).maybeSingle();
  if (!listing || !['active', 'reserved', 'sold'].includes(listing.status)) throw new AppError(404, 'Listing not found', 'NOT_FOUND');
  // Composite primary key (user_id, listing_id) makes duplicates impossible; upsert makes the call idempotent.
  const { error } = await supabaseAdmin
    .from('favorites')
    .upsert({ user_id: req.user!.id, listing_id: listingId }, { onConflict: 'user_id,listing_id', ignoreDuplicates: true });
  if (error) dbError(error);
  res.status(204).end();
}));

favoritesRouter.delete('/favorites/:listingId', ...authed, h(async (req, res) => {
  const { error } = await supabaseAdmin.from('favorites').delete().eq('user_id', req.user!.id).eq('listing_id', uuidParam(req, 'listingId'));
  if (error) dbError(error);
  res.status(204).end();
}));
