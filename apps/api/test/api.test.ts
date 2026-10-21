import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calls, CAMPUS, fakeSupabase, LISTING, loginAs, OTHER, reset, results, UID } from './helpers';

vi.mock('../src/supabase', () => ({ supabaseAdmin: fakeSupabase }));

import { createApp } from '../src/app';
const app = createApp();
const auth = (t = 'tok') => ({ Authorization: `Bearer ${t}` });
const validListing = { title: 'Engineering Mathematics', description: 'Good condition, no markings.', priceInr: 250, category: 'textbooks', condition: 'good' };

beforeEach(() => reset());

describe('health & hardening', () => {
  it('GET /health works without auth', async () => {
    const r = await request(app).get('/health');
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('ok');
    expect(r.headers['x-powered-by']).toBeUndefined();
    expect(r.headers['x-content-type-options']).toBe('nosniff');
  });
  it('rejects oversized JSON bodies', async () => {
    loginAs('tok', {});
    const r = await request(app).post('/api/v1/listings').set(auth()).send({ title: 'x'.repeat(100_000) });
    expect(r.status).toBe(413);
  });
});

describe('authentication & authorization', () => {
  it('401 without a token', async () => expect((await request(app).get('/api/v1/me')).status).toBe(401));
  it('401 with an unverified/invalid token (verified through Supabase Auth)', async () => {
    const r = await request(app).get('/api/v1/me').set(auth('forged'));
    expect(r.status).toBe(401);
    expect(fakeSupabase.auth.getUser).toHaveBeenCalledWith('forged');
  });
  it('suspended users are blocked from mutations', async () => {
    loginAs('tok', { suspended: true });
    expect((await request(app).post('/api/v1/listings').set(auth()).send(validListing)).status).toBe(403);
  });
  it('non-admins get 403 on every admin route', async () => {
    loginAs('tok', { role: 'user' });
    for (const path of ['/admin/reports', '/admin/actions', '/admin/domains', '/admin/verification-requests']) {
      expect((await request(app).get(`/api/v1${path}`).set(auth())).status).toBe(403);
    }
    expect((await request(app).post(`/api/v1/admin/listings/${LISTING}/remove`).set(auth()).send({})).status).toBe(403);
  });
  it('admins can reach admin routes', async () => {
    loginAs('tok', { role: 'admin' });
    results.reports = { data: [], error: null };
    expect((await request(app).get('/api/v1/admin/reports').set(auth())).status).toBe(200);
  });
  it('profile PATCH cannot set role / verification fields', async () => {
    loginAs('tok', {});
    for (const body of [{ role: 'admin' }, { studentStatus: 'verified' }, { suspended: false }]) {
      expect((await request(app).patch('/api/v1/me').set(auth()).send(body)).status).toBe(400);
    }
  });
  it('verified students cannot switch campus', async () => {
    loginAs('tok', { student_status: 'verified' });
    const r = await request(app).patch('/api/v1/me').set(auth()).send({ campusId: OTHER });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('CAMPUS_LOCKED');
  });
});

describe('student verification gate', () => {
  it('unverified users cannot create listings', async () => {
    loginAs('tok', { student_status: 'unverified' });
    const r = await request(app).post('/api/v1/listings').set(auth()).send(validListing);
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('STUDENT_VERIFICATION_REQUIRED');
  });
  it('unverified users cannot start conversations', async () => {
    loginAs('tok', { student_status: 'pending' });
    expect((await request(app).post('/api/v1/conversations').set(auth()).send({ listingId: LISTING })).status).toBe(403);
  });
  it('email verification fails when the domain is not allowlisted', async () => {
    loginAs('tok', { student_status: 'unverified' });
    results.campuses = { data: { id: CAMPUS, college_id: 'c1' }, error: null };
    results.verified_email_domains = { data: [{ domain: 'other.edu' }], error: null };
    const r = await request(app).post('/api/v1/verification/email').set(auth()).send({ campusId: CAMPUS });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('DOMAIN_NOT_ALLOWED');
  });
  it('email verification succeeds for an allowlisted domain', async () => {
    loginAs('tok', { student_status: 'unverified' });
    results.campuses = { data: { id: CAMPUS, college_id: 'c1' }, error: null };
    results.verified_email_domains = { data: [{ domain: 'example.edu' }], error: null };
    expect((await request(app).post('/api/v1/verification/email').set(auth()).send({ campusId: CAMPUS })).status).toBe(200);
    expect(calls.some((c) => c.table === 'profiles' && c.method === 'update')).toBe(true);
  });
});

describe('listings', () => {
  it('validates input (price, strict fields, ownership/campus not accepted from client)', async () => {
    loginAs('tok', {});
    for (const bad of [{ ...validListing, priceInr: -5 }, { ...validListing, sellerId: OTHER }, { ...validListing, campusId: OTHER }, { ...validListing, title: 'x' }]) {
      expect((await request(app).post('/api/v1/listings').set(auth()).send(bad)).status).toBe(400);
    }
  });
  it('creates listings using seller and campus from the server, not the client', async () => {
    loginAs('tok', {});
    results.listings = { data: { id: LISTING, seller_id: UID, campus_id: CAMPUS, price_inr: 250, seller: { id: UID, display_name: 'T', student_status: 'verified' }, images: [] }, error: null };
    const r = await request(app).post('/api/v1/listings').set(auth()).send(validListing);
    expect(r.status).toBe(201);
    const insert = calls.find((c) => c.table === 'listings' && c.method === 'insert')!;
    expect(insert.args[0]).toMatchObject({ seller_id: UID, campus_id: CAMPUS, price_inr: 250 });
  });
  it("users cannot edit, change status of, or delete another seller's listing", async () => {
    loginAs('tok', {});
    results.listings = { data: { id: LISTING, seller_id: OTHER, status: 'active', images: [] }, error: null };
    expect((await request(app).patch(`/api/v1/listings/${LISTING}`).set(auth()).send({ title: 'Hacked title' })).status).toBe(404);
    expect((await request(app).post(`/api/v1/listings/${LISTING}/status`).set(auth()).send({ status: 'sold' })).status).toBe(404);
    expect((await request(app).delete(`/api/v1/listings/${LISTING}`).set(auth())).status).toBe(404);
    expect(calls.some((c) => c.method === 'delete' || c.method === 'update')).toBe(false);
  });
  it('rejects invalid status transitions and moderator-only statuses', async () => {
    loginAs('tok', {});
    results.listings = { data: { id: LISTING, seller_id: UID, status: 'sold', images: [] }, error: null };
    expect((await request(app).post(`/api/v1/listings/${LISTING}/status`).set(auth()).send({ status: 'active' })).status).toBe(409);
    expect((await request(app).post(`/api/v1/listings/${LISTING}/status`).set(auth()).send({ status: 'removed' })).status).toBe(400);
  });
  it('sellers cannot touch listings removed by a moderator', async () => {
    loginAs('tok', {});
    results.listings = { data: { id: LISTING, seller_id: UID, status: 'removed', images: [] }, error: null };
    expect((await request(app).patch(`/api/v1/listings/${LISTING}`).set(auth()).send({ title: 'Edited title' })).status).toBe(403);
  });
  it('marketplace only returns active listings and applies the campus filter', async () => {
    results.listings = { data: [], error: null, count: 0 };
    const r = await request(app).get('/api/v1/listings').query({ campusId: CAMPUS, category: 'textbooks', minPrice: 100, maxPrice: 500, sort: 'price_asc', q: 'math' });
    expect(r.status).toBe(200);
    const eq = calls.filter((c) => c.table === 'listings' && c.method === 'eq').map((c) => c.args);
    expect(eq).toContainEqual(['status', 'active']);
    expect(eq).toContainEqual(['campus_id', CAMPUS]);
    expect(eq).toContainEqual(['category', 'textbooks']);
    expect(calls.some((c) => c.method === 'or')).toBe(true);
  });
  it('rejects malformed query params', async () => {
    expect((await request(app).get('/api/v1/listings?campusId=nope')).status).toBe(400);
    expect((await request(app).get('/api/v1/listings?minPrice=900&maxPrice=10')).status).toBe(400);
  });
  it('hides archived/removed listings from non-owners', async () => {
    results.listings = { data: { id: LISTING, seller_id: OTHER, status: 'removed', images: [] }, error: null };
    expect((await request(app).get(`/api/v1/listings/${LISTING}`)).status).toBe(404);
  });
});

describe('favorites', () => {
  it('requires authentication and filters by the caller only', async () => {
    expect((await request(app).get('/api/v1/favorites')).status).toBe(401);
    loginAs('tok', {});
    results.favorites = { data: [], error: null };
    await request(app).get('/api/v1/favorites').set(auth());
    expect(calls.filter((c) => c.table === 'favorites' && c.method === 'eq').map((c) => c.args)).toContainEqual(['user_id', UID]);
  });
  it('favoriting is idempotent (composite key, ignoreDuplicates upsert)', async () => {
    loginAs('tok', {});
    results.listings = { data: { id: LISTING, status: 'active' }, error: null };
    results.favorites = { data: null, error: null };
    expect((await request(app).put(`/api/v1/favorites/${LISTING}`).set(auth())).status).toBe(204);
    const up = calls.find((c) => c.table === 'favorites' && c.method === 'upsert')!;
    expect(up.args[0]).toEqual({ user_id: UID, listing_id: LISTING });
    expect(up.args[1]).toMatchObject({ ignoreDuplicates: true });
  });
});

describe('conversation & message privacy', () => {
  it('cannot message yourself', async () => {
    loginAs('tok', {});
    results.listings = { data: { id: LISTING, seller_id: UID, status: 'active' }, error: null };
    const r = await request(app).post('/api/v1/conversations').set(auth()).send({ listingId: LISTING });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('SELF_MESSAGE');
  });
  it('non-participants cannot read or send messages (404, nothing leaked)', async () => {
    loginAs('tok', {});
    results.conversations = { data: { id: LISTING, buyer_id: OTHER, seller_id: '55555555-5555-4555-8555-555555555555' }, error: null };
    results.messages = { data: [{ id: 'm', body: 'secret' }], error: null };
    const read = await request(app).get(`/api/v1/conversations/${LISTING}/messages`).set(auth());
    expect(read.status).toBe(404);
    expect(JSON.stringify(read.body)).not.toContain('secret');
    expect((await request(app).post(`/api/v1/conversations/${LISTING}/messages`).set(auth()).send({ body: 'hi' })).status).toBe(404);
    expect(calls.some((c) => c.table === 'messages' && c.method === 'insert')).toBe(false);
  });
  it('sender comes from the token, never the request body', async () => {
    loginAs('tok', {});
    results.conversations = { data: { id: LISTING, buyer_id: UID, seller_id: OTHER }, error: null };
    results.messages = { data: { id: 'm1', conversation_id: LISTING, sender_id: UID, body: 'hello', created_at: 'x', read_at: null }, error: null, count: 0 };
    expect((await request(app).post(`/api/v1/conversations/${LISTING}/messages`).set(auth()).send({ body: 'hello', sender_id: OTHER })).status).toBe(400);
    expect((await request(app).post(`/api/v1/conversations/${LISTING}/messages`).set(auth()).send({ body: 'hello' })).status).toBe(201);
    const ins = calls.find((c) => c.table === 'messages' && c.method === 'insert')!;
    expect(ins.args[0]).toMatchObject({ sender_id: UID, conversation_id: LISTING });
  });
  it('rate limits message bursts', async () => {
    loginAs('tok', {});
    results.conversations = { data: { id: LISTING, buyer_id: UID, seller_id: OTHER }, error: null };
    results.messages = { data: null, error: null, count: 25 };
    expect((await request(app).post(`/api/v1/conversations/${LISTING}/messages`).set(auth()).send({ body: 'spam' })).status).toBe(429);
  });
  it('validates message bodies', async () => {
    loginAs('tok', {});
    results.conversations = { data: { id: LISTING, buyer_id: UID, seller_id: OTHER }, error: null };
    expect((await request(app).post(`/api/v1/conversations/${LISTING}/messages`).set(auth()).send({ body: '   ' })).status).toBe(400);
  });
});

describe('reports', () => {
  it('requires auth and validates the reason', async () => {
    expect((await request(app).post('/api/v1/reports').send({})).status).toBe(401);
    loginAs('tok', {});
    expect((await request(app).post('/api/v1/reports').set(auth()).send({ targetType: 'listing', targetId: LISTING, reason: 'bogus' })).status).toBe(400);
  });
  it('cannot report your own listing', async () => {
    loginAs('tok', {});
    results.listings = { data: { id: LISTING, seller_id: UID }, error: null };
    expect((await request(app).post('/api/v1/reports').set(auth()).send({ targetType: 'listing', targetId: LISTING, reason: 'scam' })).status).toBe(400);
  });
  it('stores a valid report with the reporter from the token', async () => {
    loginAs('tok', {});
    results.listings = { data: { id: LISTING, seller_id: OTHER }, error: null };
    results.reports = { data: null, error: null };
    expect((await request(app).post('/api/v1/reports').set(auth()).send({ targetType: 'listing', targetId: LISTING, reason: 'scam', description: 'Asks for advance payment' })).status).toBe(201);
    expect(calls.find((c) => c.table === 'reports' && c.method === 'insert')!.args[0]).toMatchObject({ reporter_id: UID, listing_id: LISTING, reason: 'scam' });
  });
});

describe('admin actions', () => {
  it('suspension requires a justification and cannot target yourself', async () => {
    loginAs('tok', { role: 'admin' });
    expect((await request(app).post(`/api/v1/admin/users/${OTHER}/suspend`).set(auth()).send({})).status).toBe(400);
    expect((await request(app).post(`/api/v1/admin/users/${UID}/suspend`).set(auth()).send({ note: 'testing self' })).status).toBe(400);
  });
});
