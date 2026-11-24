-- Push notifications (24 Nov 2026), applied with edge function v12. One row per device; only the edge function reads it.
create table if not exists public.shed_push (
  token text primary key,
  user_id uuid not null references public.shed_profiles(id) on delete cascade,
  platform text not null default 'ios',
  updated_at timestamptz not null default now()
);
create index if not exists shed_push_user on public.shed_push (user_id);
alter table public.shed_push enable row level security; -- no policies: browsers can't read tokens
