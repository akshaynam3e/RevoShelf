-- RevoShelf core schema. Apply with `supabase db push` or paste into the SQL editor.
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------- helpers ----------
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------- directory ----------
create table public.colleges (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 2 and 120),
  created_at timestamptz not null default now()
);
create table public.campuses (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null references public.colleges(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  city text check (city is null or char_length(city) <= 80),
  created_at timestamptz not null default now(),
  unique (college_id, name)
);
create index campuses_college_idx on public.campuses(college_id);

create table public.verified_email_domains (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null references public.colleges(id) on delete cascade,
  domain text not null unique check (domain = lower(domain) and domain ~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$'),
  created_at timestamptz not null default now()
);
create index verified_domains_college_idx on public.verified_email_domains(college_id);

-- ---------- profiles (1:1 with auth.users) ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 60),
  avatar_url text,
  campus_id uuid references public.campuses(id) on delete set null,
  academic_year smallint check (academic_year between 1 and 8),
  student_status text not null default 'unverified' check (student_status in ('unverified','pending','verified','rejected')),
  verified_at timestamptz,
  role text not null default 'user' check (role in ('user','admin')),
  suspended boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_campus_idx on public.profiles(campus_id);
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();

-- Defense in depth: even if grants were widened later, client roles can never touch privileged columns.
create or replace function public.protect_profile_privileged_columns() returns trigger language plpgsql as $$
begin
  if current_user in ('anon','authenticated') and (
       new.role is distinct from old.role or new.student_status is distinct from old.student_status or
       new.suspended is distinct from old.suspended or new.verified_at is distinct from old.verified_at or new.id is distinct from old.id) then
    raise exception 'privileged profile columns cannot be changed by clients';
  end if;
  return new;
end $$;
create trigger profiles_protect before update on public.profiles for each row execute function public.protect_profile_privileged_columns();

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare nm text;
begin
  nm := left(coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), nullif(trim(new.raw_user_meta_data->>'name'), ''), split_part(new.email, '@', 1)), 60);
  if nm is null or char_length(nm) < 2 then nm := 'Student ' || left(new.id::text, 4); end if;
  insert into public.profiles (id, display_name) values (new.id, nm);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and not suspended)
$$;

create table public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  campus_id uuid not null references public.campuses(id) on delete cascade,
  evidence text not null check (char_length(evidence) between 10 and 500),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index verification_one_pending_idx on public.verification_requests(user_id) where status = 'pending';
create index verification_status_idx on public.verification_requests(status, created_at);

-- ---------- listings ----------
create table public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null,
  campus_id uuid not null references public.campuses(id),
  title text not null check (char_length(title) between 3 and 120),
  description text not null check (char_length(description) between 10 and 2000),
  price_inr integer not null check (price_inr between 0 and 1000000),
  category text not null check (category in ('textbooks','calculators','electronics','stationery','lab_supplies','hostel_essentials','other')),
  condition text not null check (condition in ('like_new','good','fair','heavily_used')),
  status text not null default 'active' check (status in ('active','reserved','sold','archived','removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listings_seller_id_fkey foreign key (seller_id) references public.profiles(id) on delete cascade
);
create index listings_feed_idx on public.listings(campus_id, status, created_at desc);
create index listings_status_created_idx on public.listings(status, created_at desc);
create index listings_category_idx on public.listings(category, status);
create index listings_price_idx on public.listings(price_inr) where status = 'active';
create index listings_seller_idx on public.listings(seller_id, created_at desc);
create index listings_title_trgm_idx on public.listings using gin (title extensions.gin_trgm_ops);
create index listings_desc_trgm_idx on public.listings using gin (description extensions.gin_trgm_ops);
create trigger listings_updated before update on public.listings for each row execute function public.set_updated_at();

create or replace function public.listings_immutable() returns trigger language plpgsql as $$
begin
  if new.seller_id <> old.seller_id or new.campus_id <> old.campus_id then
    raise exception 'seller_id and campus_id are immutable';
  end if;
  return new;
end $$;
create trigger listings_immutable_cols before update on public.listings for each row execute function public.listings_immutable();

create table public.listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  storage_path text not null unique,
  position smallint not null default 0 check (position between 0 and 20),
  created_at timestamptz not null default now()
);
create index listing_images_listing_idx on public.listing_images(listing_id, position);

-- ---------- favorites ----------
create table public.favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);
create index favorites_user_created_idx on public.favorites(user_id, created_at desc);
create index favorites_listing_idx on public.favorites(listing_id);

-- ---------- messaging ----------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  last_message_at timestamptz not null default now(),
  last_message_preview text,
  created_at timestamptz not null default now(),
  constraint conversations_not_self check (buyer_id <> seller_id),
  constraint conversations_unique_per_buyer unique (listing_id, buyer_id)
);
create index conversations_buyer_idx on public.conversations(buyer_id, last_message_at desc);
create index conversations_seller_idx on public.conversations(seller_id, last_message_at desc);

create or replace function public.conversations_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.listings l where l.id = new.listing_id and l.seller_id = new.seller_id) then
      raise exception 'conversation seller must own the listing';
    end if;
  elsif new.buyer_id <> old.buyer_id or new.seller_id <> old.seller_id or new.listing_id <> old.listing_id then
    raise exception 'conversation participants cannot be changed';
  end if;
  return new;
end $$;
create trigger conversations_guard_trg before insert or update on public.conversations for each row execute function public.conversations_guard();

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index messages_conv_created_idx on public.messages(conversation_id, created_at desc);
create index messages_unread_idx on public.messages(conversation_id, sender_id) where read_at is null;
create index messages_sender_recent_idx on public.messages(sender_id, created_at desc);

create or replace function public.messages_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.conversations c where c.id = new.conversation_id and new.sender_id in (c.buyer_id, c.seller_id)) then
    raise exception 'sender must be a conversation participant';
  end if;
  return new;
end $$;
create trigger messages_guard_trg before insert on public.messages for each row execute function public.messages_guard();

create or replace function public.messages_after_insert() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.conversations set last_message_at = new.created_at, last_message_preview = left(new.body, 80) where id = new.conversation_id;
  return new;
end $$;
create trigger messages_after_insert_trg after insert on public.messages for each row execute function public.messages_after_insert();

-- ---------- reports & moderation ----------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete cascade,
  reported_user_id uuid references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('scam','suspicious_activity','inappropriate_content','harassment','other')),
  description text check (description is null or char_length(description) <= 1000),
  status text not null default 'open' check (status in ('open','dismissed','actioned')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint reports_exactly_one_target check ((listing_id is not null)::int + (reported_user_id is not null)::int = 1)
);
create unique index reports_open_listing_uniq on public.reports(reporter_id, listing_id) where status = 'open' and listing_id is not null;
create unique index reports_open_user_uniq on public.reports(reporter_id, reported_user_id) where status = 'open' and reported_user_id is not null;
create index reports_status_idx on public.reports(status, created_at desc);

create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('dismiss_report','remove_listing','restore_listing','suspend_user','unsuspend_user','approve_verification','reject_verification')),
  listing_id uuid references public.listings(id) on delete set null,
  target_user_id uuid references public.profiles(id) on delete set null,
  report_id uuid references public.reports(id) on delete set null,
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now()
);
create index moderation_actions_created_idx on public.moderation_actions(created_at desc);
