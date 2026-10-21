import { z } from 'zod';

/* ---------- constants ---------- */
export const CATEGORIES = ['textbooks', 'calculators', 'electronics', 'stationery', 'lab_supplies', 'hostel_essentials', 'other'] as const;
export type Category = (typeof CATEGORIES)[number];
export const CATEGORY_LABELS: Record<Category, string> = {
  textbooks: 'Textbooks',
  calculators: 'Calculators',
  electronics: 'Electronics',
  stationery: 'Stationery',
  lab_supplies: 'Lab supplies',
  hostel_essentials: 'Hostel essentials',
  other: 'Other',
};

export const CONDITIONS = ['like_new', 'good', 'fair', 'heavily_used'] as const;
export type Condition = (typeof CONDITIONS)[number];
export const CONDITION_LABELS: Record<Condition, string> = {
  like_new: 'Like New',
  good: 'Good',
  fair: 'Fair',
  heavily_used: 'Heavily Used',
};

export const LISTING_STATUSES = ['active', 'reserved', 'sold', 'archived', 'removed'] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];
export const SELLER_SETTABLE_STATUSES = ['active', 'reserved', 'sold', 'archived'] as const;

/** Allowed seller-initiated status transitions. 'removed' is moderator-only. */
export const SELLER_STATUS_TRANSITIONS: Record<ListingStatus, readonly ListingStatus[]> = {
  active: ['reserved', 'sold', 'archived'],
  reserved: ['active', 'sold', 'archived'],
  sold: ['archived'],
  archived: ['active'],
  removed: [],
};
export function canSellerTransition(from: ListingStatus, to: ListingStatus): boolean {
  return SELLER_STATUS_TRANSITIONS[from].includes(to);
}

export const STUDENT_STATUSES = ['unverified', 'pending', 'verified', 'rejected'] as const;
export type StudentStatus = (typeof STUDENT_STATUSES)[number];

export const REPORT_REASONS = ['scam', 'suspicious_activity', 'inappropriate_content', 'harassment', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  scam: 'Scam or fraud',
  suspicious_activity: 'Suspicious activity',
  inappropriate_content: 'Inappropriate content',
  harassment: 'Harassment',
  other: 'Something else',
};

export const MAX_IMAGES_PER_LISTING = 6;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_PRICE_INR = 1_000_000;

/* ---------- schemas ---------- */
const uuid = z.string().uuid();
const trimmed = (min: number, max: number) => z.string().trim().min(min).max(max);

export const listingInputSchema = z
  .object({
    title: trimmed(3, 120),
    description: trimmed(10, 2000),
    priceInr: z.number().int().min(0).max(MAX_PRICE_INR),
    category: z.enum(CATEGORIES),
    condition: z.enum(CONDITIONS),
  })
  .strict();
export type ListingInput = z.infer<typeof listingInputSchema>;

export const listingUpdateSchema = listingInputSchema
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

export const listingStatusSchema = z.object({ status: z.enum(SELLER_SETTABLE_STATUSES) }).strict();

const optionalNumber = z.preprocess((v) => (v === '' || v === undefined ? undefined : Number(v)), z.number().int().min(0).max(MAX_PRICE_INR).optional());
export const listingQuerySchema = z
  .object({
    q: z.string().trim().max(100).optional(),
    category: z.enum(CATEGORIES).optional(),
    condition: z.enum(CONDITIONS).optional(),
    campusId: uuid.optional(),
    minPrice: optionalNumber,
    maxPrice: optionalNumber,
    sort: z.enum(['newest', 'price_asc', 'price_desc']).default('newest'),
    page: z.coerce.number().int().min(1).max(1000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  })
  .refine((v) => v.minPrice === undefined || v.maxPrice === undefined || v.minPrice <= v.maxPrice, {
    message: 'minPrice must be <= maxPrice',
  });
export type ListingQuery = z.infer<typeof listingQuerySchema>;

export const profileUpdateSchema = z
  .object({
    displayName: trimmed(2, 60).optional(),
    campusId: uuid.optional(),
    academicYear: z.number().int().min(1).max(8).nullable().optional(),
  })
  .strict();

export const emailVerificationSchema = z.object({ campusId: uuid }).strict();
export const manualVerificationSchema = z.object({ campusId: uuid, evidence: trimmed(10, 500) }).strict();

export const createConversationSchema = z.object({ listingId: uuid }).strict();
export const messageSchema = z.object({ body: trimmed(1, 2000) }).strict();

export const reportSchema = z
  .object({
    targetType: z.enum(['listing', 'user']),
    targetId: uuid,
    reason: z.enum(REPORT_REASONS),
    description: trimmed(0, 1000).optional(),
  })
  .strict();

export const adminNoteSchema = z.object({ note: trimmed(0, 500).optional(), reportId: uuid.optional() }).strict();
export const adminRequiredNoteSchema = z.object({ note: trimmed(5, 500), reportId: uuid.optional() }).strict();
export const collegeSchema = z.object({ name: trimmed(2, 120) }).strict();
export const campusSchema = z.object({ collegeId: uuid, name: trimmed(2, 120), city: trimmed(0, 80).optional() }).strict();
export const domainSchema = z
  .object({
    collegeId: uuid,
    domain: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/, 'Enter a valid domain such as example.edu'),
  })
  .strict();

/* ---------- DTOs shared by API and web ---------- */
export interface PublicSeller {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  studentStatus: StudentStatus;
  createdAt: string;
}
export interface CampusDTO {
  id: string;
  name: string;
  collegeName: string;
}
export interface ListingDTO {
  id: string;
  title: string;
  description: string;
  priceInr: number;
  category: Category;
  condition: Condition;
  status: ListingStatus;
  sellerId: string;
  createdAt: string;
  updatedAt: string;
  seller: PublicSeller;
  campus: CampusDTO;
  images: { id: string; url: string; position: number }[];
  favorited?: boolean;
}
export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}
export interface MeDTO {
  id: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  avatarUrl: string | null;
  campusId: string | null;
  campus: CampusDTO | null;
  academicYear: number | null;
  studentStatus: StudentStatus;
  role: 'user' | 'admin';
  suspended: boolean;
  createdAt: string;
}
export interface CollegeDTO {
  id: string;
  name: string;
  campuses: { id: string; name: string; city: string | null }[];
}
export interface ConversationDTO {
  id: string;
  listing: { id: string; title: string; status: ListingStatus; priceInr: number; imageUrl: string | null };
  other: { id: string; displayName: string; avatarUrl: string | null };
  lastMessage: string | null;
  lastMessageAt: string;
  unreadCount: number;
}
export interface MessageDTO {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}
