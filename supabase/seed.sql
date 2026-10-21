-- Safe development seed: fictional institutions only. No users, credentials or personal data.
insert into public.colleges (name) values ('Example University'), ('Sample College of Engineering') on conflict (name) do nothing;

insert into public.campuses (college_id, name, city)
select c.id, v.campus, v.city from (values
  ('Example University', 'Main Campus', 'Lucknow'),
  ('Example University', 'North Campus', 'Lucknow'),
  ('Sample College of Engineering', 'Main Campus', 'Pune')
) as v(college, campus, city) join public.colleges c on c.name = v.college
on conflict (college_id, name) do nothing;

insert into public.verified_email_domains (college_id, domain)
select c.id, v.domain from (values
  ('Example University', 'example.edu'),
  ('Sample College of Engineering', 'sample-college.ac.in')
) as v(college, domain) join public.colleges c on c.name = v.college
on conflict (domain) do nothing;

-- Optional sample listings: created ONLY for the first existing profile that has a campus (dev convenience).
do $$
declare p record;
begin
  select id, campus_id into p from public.profiles where campus_id is not null order by created_at limit 1;
  if p.id is not null and not exists (select 1 from public.listings where seller_id = p.id) then
    insert into public.listings (seller_id, campus_id, title, description, price_inr, category, condition) values
      (p.id, p.campus_id, 'Engineering Mathematics Vol. 1', 'Clean copy, a few pencil notes in chapter 3.', 220, 'textbooks', 'good'),
      (p.id, p.campus_id, 'Scientific calculator (fx-991)', 'Works perfectly, includes cover and fresh battery.', 650, 'calculators', 'like_new'),
      (p.id, p.campus_id, 'Hostel study lamp', 'LED lamp with adjustable neck, 1 year old.', 300, 'hostel_essentials', 'fair');
  end if;
end $$;
