-- Computer players online (24 Nov 2026), applied with edge function v13. They are real accounts (made by the edge
-- function on first use, not anonymous, so the cleanup job never removes them) with bot = true.
alter table public.shed_profiles add column if not exists bot boolean not null default false;
