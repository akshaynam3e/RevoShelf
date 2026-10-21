import type { ConversationDTO, ListingDTO, MeDTO, MessageDTO, PublicSeller } from '@revoshelf/shared';
import { env } from '../env';
import type { AuthUser } from '../middleware/auth';

/* eslint-disable @typescript-eslint/no-explicit-any */
export const publicUrl = (bucket: string, path: string) => `${env.SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;

export const SELLER_SELECT = 'id,display_name,avatar_url,student_status,created_at';
export const LISTING_SELECT =
  `id,title,description,price_inr,category,condition,status,seller_id,campus_id,created_at,updated_at,` +
  `seller:profiles!listings_seller_id_fkey(${SELLER_SELECT}),campus:campuses(id,name,college:colleges(name)),images:listing_images(id,storage_path,position)`;

export const toSeller = (p: any): PublicSeller => ({
  id: p.id,
  displayName: p.display_name,
  avatarUrl: p.avatar_url ?? null,
  studentStatus: p.student_status,
  createdAt: p.created_at,
});

export function toListing(r: any, favorited?: boolean): ListingDTO {
  const images = [...(r.images ?? [])]
    .sort((a: any, b: any) => a.position - b.position)
    .map((i: any) => ({ id: i.id, url: publicUrl(env.LISTINGS_BUCKET, i.storage_path), position: i.position }));
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    priceInr: r.price_inr,
    category: r.category,
    condition: r.condition,
    status: r.status,
    sellerId: r.seller_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    seller: toSeller(r.seller),
    campus: { id: r.campus?.id ?? r.campus_id, name: r.campus?.name ?? '', collegeName: r.campus?.college?.name ?? '' },
    images,
    ...(favorited === undefined ? {} : { favorited }),
  };
}

export function toMe(u: AuthUser): MeDTO {
  const p = u.profile;
  return {
    id: u.id,
    email: u.email,
    emailVerified: u.emailVerified,
    displayName: p.display_name,
    avatarUrl: p.avatar_url ?? null,
    campusId: p.campus_id ?? null,
    campus: p.campus ? { id: p.campus.id, name: p.campus.name, collegeName: p.campus.college?.name ?? '' } : null,
    academicYear: p.academic_year ?? null,
    studentStatus: p.student_status,
    role: p.role,
    suspended: p.suspended,
    createdAt: p.created_at,
  };
}

export const toMessage = (m: any): MessageDTO => ({
  id: m.id,
  conversationId: m.conversation_id,
  senderId: m.sender_id,
  body: m.body,
  createdAt: m.created_at,
  readAt: m.read_at ?? null,
});

export function toConversation(c: any, me: string, unread: number): ConversationDTO {
  const other = c.buyer_id === me ? c.seller : c.buyer;
  const first = [...(c.listing?.images ?? [])].sort((a: any, b: any) => a.position - b.position)[0];
  return {
    id: c.id,
    listing: {
      id: c.listing?.id ?? c.listing_id,
      title: c.listing?.title ?? 'Listing',
      status: c.listing?.status ?? 'active',
      priceInr: c.listing?.price_inr ?? 0,
      imageUrl: first ? publicUrl(env.LISTINGS_BUCKET, first.storage_path) : null,
    },
    other: { id: other.id, displayName: other.display_name, avatarUrl: other.avatar_url ?? null },
    lastMessage: c.last_message_preview ?? null,
    lastMessageAt: c.last_message_at,
    unreadCount: unread,
  };
}
