-- Firebase Auth identity mapping. Firebase owns authentication; Supabase remains the data store.
alter table public.profiles add column if not exists firebase_uid text;
create unique index if not exists profiles_firebase_uid_uniq on public.profiles(firebase_uid) where firebase_uid is not null;
