import { Router } from 'express';
import { createConversationSchema, messageSchema } from '@revoshelf/shared';
import { supabaseAdmin } from '../supabase';
import { AppError, dbError, h } from '../lib/errors';
import { authed, verified } from '../middleware/auth';
import { toConversation, toMessage } from '../lib/dto';
import { uuidParam } from '../lib/params';

/* eslint-disable @typescript-eslint/no-explicit-any */
export const conversationsRouter = Router();

const MESSAGES_PER_MINUTE = 20;
const CONV_SELECT =
  'id,listing_id,buyer_id,seller_id,last_message_at,last_message_preview,' +
  'listing:listings(id,title,status,price_inr,images:listing_images(storage_path,position)),' +
  'buyer:profiles!conversations_buyer_id_fkey(id,display_name,avatar_url),seller:profiles!conversations_seller_id_fkey(id,display_name,avatar_url)';

/** Loads a conversation only if the caller is a participant; otherwise behaves as if it does not exist. */
async function participantConversation(conversationId: string, userId: string) {
  const { data, error } = await supabaseAdmin.from('conversations').select('id,buyer_id,seller_id').eq('id', conversationId).maybeSingle();
  if (error) dbError(error);
  if (!data || (data.buyer_id !== userId && data.seller_id !== userId)) throw new AppError(404, 'Conversation not found', 'NOT_FOUND');
  return data;
}

conversationsRouter.post('/conversations', ...verified, h(async (req, res) => {
  const { listingId } = createConversationSchema.parse(req.body);
  const me = req.user!.id;
  const { data: listing, error } = await supabaseAdmin.from('listings').select('id,seller_id,status').eq('id', listingId).maybeSingle();
  if (error) dbError(error);
  if (!listing || !['active', 'reserved'].includes(listing.status)) throw new AppError(404, 'Listing is not available', 'NOT_FOUND');
  if (listing.seller_id === me) throw new AppError(400, 'You cannot message yourself', 'SELF_MESSAGE');

  const find = () => supabaseAdmin.from('conversations').select('id').eq('listing_id', listingId).eq('buyer_id', me).maybeSingle();
  const existing = await find();
  if (existing.data) return res.json({ id: existing.data.id });
  const ins = await supabaseAdmin.from('conversations').insert({ listing_id: listingId, buyer_id: me, seller_id: listing.seller_id }).select('id').single();
  if (ins.error) {
    if (ins.error.code === '23505') {
      const again = await find();
      if (again.data) return res.json({ id: again.data.id });
    }
    dbError(ins.error);
  }
  res.status(201).json({ id: ins.data!.id });
}));

conversationsRouter.get('/conversations', ...authed, h(async (req, res) => {
  const me = req.user!.id; // verified uuid from Supabase Auth, safe to interpolate
  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select(CONV_SELECT)
    .or(`buyer_id.eq.${me},seller_id.eq.${me}`)
    .order('last_message_at', { ascending: false })
    .limit(100);
  if (error) dbError(error);
  const rows = (data ?? []) as any[];
  const unread = new Map<string, number>();
  if (rows.length) {
    const { data: un } = await supabaseAdmin
      .from('messages')
      .select('conversation_id')
      .in('conversation_id', rows.map((r) => r.id))
      .neq('sender_id', me)
      .is('read_at', null);
    for (const m of un ?? []) unread.set((m as any).conversation_id, (unread.get((m as any).conversation_id) ?? 0) + 1);
  }
  res.json(rows.map((r) => toConversation(r, me, unread.get(r.id) ?? 0)));
}));

conversationsRouter.get('/conversations/:id', ...authed, h(async (req, res) => {
  const id = uuidParam(req, 'id');
  await participantConversation(id, req.user!.id);
  const { data, error } = await supabaseAdmin.from('conversations').select(CONV_SELECT).eq('id', id).single();
  if (error) dbError(error);
  res.json(toConversation(data, req.user!.id, 0));
}));

conversationsRouter.get('/conversations/:id/messages', ...authed, h(async (req, res) => {
  const id = uuidParam(req, 'id');
  await participantConversation(id, req.user!.id);
  const { data, error } = await supabaseAdmin
    .from('messages')
    .select('id,conversation_id,sender_id,body,created_at,read_at')
    .eq('conversation_id', id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) dbError(error);
  res.json((data ?? []).reverse().map(toMessage));
}));

conversationsRouter.post('/conversations/:id/messages', ...authed, h(async (req, res) => {
  const id = uuidParam(req, 'id');
  const { body } = messageSchema.parse(req.body);
  const me = req.user!.id;
  await participantConversation(id, me);

  // anti-spam: per-user sliding window enforced against the database (survives restarts / multiple instances)
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count, error: cerr } = await supabaseAdmin.from('messages').select('id', { count: 'exact', head: true }).eq('sender_id', me).gte('created_at', since);
  if (cerr) dbError(cerr);
  if ((count ?? 0) >= MESSAGES_PER_MINUTE) throw new AppError(429, 'You are sending messages too quickly. Please wait a moment.', 'RATE_LIMITED');

  const { data, error } = await supabaseAdmin
    .from('messages')
    .insert({ conversation_id: id, sender_id: me, body }) // sender comes from the verified token
    .select('id,conversation_id,sender_id,body,created_at,read_at')
    .single();
  if (error) dbError(error);
  res.status(201).json(toMessage(data));
}));

conversationsRouter.post('/conversations/:id/read', ...authed, h(async (req, res) => {
  const id = uuidParam(req, 'id');
  const me = req.user!.id;
  await participantConversation(id, me);
  const { error } = await supabaseAdmin.from('messages').update({ read_at: new Date().toISOString() }).eq('conversation_id', id).neq('sender_id', me).is('read_at', null);
  if (error) dbError(error);
  res.status(204).end();
}));
