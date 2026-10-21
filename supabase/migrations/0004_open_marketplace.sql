-- RevoShelf is an open marketplace.
-- College/campus selection and student verification are not required.
alter table public.listings
  alter column campus_id drop not null;

update public.profiles
set student_status = 'verified',
    verified_at = coalesce(verified_at, now())
where student_status <> 'verified';
