import { describe, expect, it } from 'vitest';
import { canSellerTransition, listingInputSchema, listingQuerySchema, listingUpdateSchema, messageSchema, profileUpdateSchema, reportSchema } from './index';

const valid = { title: 'Engineering Mathematics', description: 'Good condition, no markings.', priceInr: 250, category: 'textbooks', condition: 'good' };

describe('listing validation', () => {
  it('accepts a valid listing', () => expect(listingInputSchema.safeParse(valid).success).toBe(true));
  it('rejects negative / fractional / huge prices', () => {
    for (const priceInr of [-1, 10.5, 2_000_000]) expect(listingInputSchema.safeParse({ ...valid, priceInr }).success).toBe(false);
  });
  it('rejects client-supplied ownership or campus fields (strict)', () => {
    expect(listingInputSchema.safeParse({ ...valid, sellerId: 'x' }).success).toBe(false);
    expect(listingInputSchema.safeParse({ ...valid, campusId: 'x' }).success).toBe(false);
    expect(listingInputSchema.safeParse({ ...valid, status: 'sold' }).success).toBe(false);
  });
  it('rejects unknown category/condition', () => {
    expect(listingInputSchema.safeParse({ ...valid, category: 'weapons' }).success).toBe(false);
    expect(listingInputSchema.safeParse({ ...valid, condition: 'mint' }).success).toBe(false);
  });
  it('requires at least one field on update', () => expect(listingUpdateSchema.safeParse({}).success).toBe(false));
});

describe('status transitions', () => {
  it('allows active -> reserved/sold/archived', () => {
    for (const to of ['reserved', 'sold', 'archived'] as const) expect(canSellerTransition('active', to)).toBe(true);
  });
  it('never lets a seller leave or enter removed', () => {
    expect(canSellerTransition('removed', 'active')).toBe(false);
    expect(canSellerTransition('active', 'removed')).toBe(false);
  });
  it('does not reopen sold listings', () => expect(canSellerTransition('sold', 'active')).toBe(false));
});

describe('other schemas', () => {
  it('query defaults and price range check', () => {
    expect(listingQuerySchema.parse({}).sort).toBe('newest');
    expect(listingQuerySchema.safeParse({ minPrice: '500', maxPrice: '100' }).success).toBe(false);
  });
  it('profile update cannot carry role or verification fields', () => {
    expect(profileUpdateSchema.safeParse({ role: 'admin' }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ studentStatus: 'verified' }).success).toBe(false);
  });
  it('messages are trimmed and bounded', () => {
    expect(messageSchema.safeParse({ body: '   ' }).success).toBe(false);
    expect(messageSchema.safeParse({ body: 'x'.repeat(2001) }).success).toBe(false);
  });
  it('report needs valid reason', () => {
    expect(reportSchema.safeParse({ targetType: 'listing', targetId: crypto.randomUUID(), reason: 'nope' }).success).toBe(false);
  });
});
