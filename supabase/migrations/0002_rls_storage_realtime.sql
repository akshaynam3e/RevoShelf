-- Row Level Security, least-privilege grants, storage buckets and realtime.
-- The Express API uses the service-role key (bypasses RLS) for all privileged writes.
-- Browsers only ever SELECT from `messages`, `conversations` and their own `profiles` row (for Realtime).

alter table public.colleges enable row level security;
alter table public.campuses enable row level security;
alter table public.verified_email_domains enable row level security;
alter table public.profiles enable row level security;
alter table public.verification_requests enable row level security;
alter table public.listings enable row level security;
alter table public.listing_images enable row level security;
alter table public.favorites enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.reports enable row level security;
alter table public.moderation_actions enable row level security;

-- Start from zero privileges for client roles, then grant only what is needed.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant execute on function public.is_admin() to authenticated;

grant select on public.colleges, public.campuses to anon, authenticated;
grant select on public.profiles, public.conversations, public.messages to authenticated;

-- directory is public; email-domain allowlist is NOT readable by clients
create policy colleges_read on public.colleges for select to anon, authenticated using (true);
create policy campuses_read on public.campuses for select to anon, authenticated using (true);
create policy domains_admin_read on public.verified_email_domains for select to authenticated using (public.is_admin());

-- profiles: a user can read only their own row (public seller info is served by the API)
create policy profiles_self_read on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());

create policy verification_self_read on public.verification_requests for select to authenticated using (user_id = auth.uid() or public.is_admin());

create policy listings_read on public.listings for select to authenticated
  using (status = 'active' or seller_id = auth.uid() or public.is_admin());
create policy listing_images_read on public.listing_images for select to authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id and (l.status = 'active' or l.seller_id = auth.uid() or public.is_admin())));

create policy favorites_own_read on public.favorites for select to authenticated using (user_id = auth.uid());
create policy favorites_own_insert on public.favorites for insert to authenticated with check (user_id = auth.uid());
create policy favorites_own_delete on public.favorites for delete to authenticated using (user_id = auth.uid());

create policy conversations_participants_read on public.conversations for select to authenticated
  using (auth.uid() in (buyer_id, seller_id));
create policy messages_participants_read on public.messages for select to authenticated
  using (exists (select 1 from public.conversations c where c.id = conversation_id and auth.uid() in (c.buyer_id, c.seller_id)));

create policy reports_own_read on public.reports for select to authenticated using (reporter_id = auth.uid() or public.is_admin());
create policy moderation_admin_read on public.moderation_actions for select to authenticated using (public.is_admin());
-- No INSERT/UPDATE/DELETE policies or grants exist for clients on listings, messages, conversations,
-- reports, profiles or moderation tables: every write goes through the API, which enforces business rules.

-- ---------- storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('listing-images', 'listing-images', true, 5242880, array['image/jpeg','image/png','image/webp']),
  ('avatars', 'avatars', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Public read of marketplace images only. No client write policies: uploads are validated and done by the API.
create policy "public read marketplace images" on storage.objects for select to anon, authenticated
  using (bucket_id in ('listing-images', 'avatars'));

-- ---------- realtime ----------
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversations') then
    alter publication supabase_realtime add table public.conversations;
  end if;
end $$;
