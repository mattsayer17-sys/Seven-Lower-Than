-- Abuse and cost protection (24 Nov 2026). Applied with edge function v11.
-- 1. Rate limits: a fixed-window counter the edge function calls through shed_hit(). Only the service role may call it.
create table if not exists public.shed_hits (
  key text not null,
  win bigint not null,
  n integer not null default 0,
  primary key (key, win)
);
alter table public.shed_hits enable row level security; -- no policies: browsers can neither read nor write it

create or replace function public.shed_hit(p_key text, p_limit integer, p_window integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  w bigint := floor(extract(epoch from now()) / p_window) * p_window; -- window start, epoch seconds
  c integer;
begin
  insert into public.shed_hits as h (key, win, n) values (p_key, w, 1)
  on conflict (key, win) do update set n = h.n + 1
  returning n into c;
  return c <= p_limit;
end $$;
revoke all on function public.shed_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.shed_hit(text, integer, integer) to service_role;

-- 2. Names only change through the edge function, which runs the name filter. Browsers lose direct writes to profiles.
drop policy if exists "own profile insert" on public.shed_profiles;
drop policy if exists "own profile update" on public.shed_profiles;

-- 3. Account deletion: deleting the auth user removes everything that is theirs. A table they hosted stays for the
-- other players (host becomes empty) so other people's head to head is not lost.
alter table public.shed_tables alter column host drop not null;
alter table public.shed_tables drop constraint if exists shed_tables_host_fkey;
alter table public.shed_tables add constraint shed_tables_host_fkey foreign key (host) references public.shed_profiles(id) on delete set null;
alter table public.shed_seats drop constraint if exists shed_seats_user_id_fkey;
alter table public.shed_seats add constraint shed_seats_user_id_fkey foreign key (user_id) references public.shed_profiles(id) on delete cascade;
alter table public.shed_views drop constraint if exists shed_views_user_id_fkey;
alter table public.shed_views add constraint shed_views_user_id_fkey foreign key (user_id) references public.shed_profiles(id) on delete cascade;
alter table public.shed_results drop constraint if exists shed_results_user_id_fkey;
alter table public.shed_results add constraint shed_results_user_id_fkey foreign key (user_id) references public.shed_profiles(id) on delete cascade;
alter table public.shed_chat drop constraint if exists shed_chat_user_id_fkey;
alter table public.shed_chat add constraint shed_chat_user_id_fkey foreign key (user_id) references public.shed_profiles(id) on delete cascade;
alter table public.shed_blocks drop constraint if exists shed_blocks_blocker_fkey;
alter table public.shed_blocks add constraint shed_blocks_blocker_fkey foreign key (blocker) references public.shed_profiles(id) on delete cascade;
alter table public.shed_blocks drop constraint if exists shed_blocks_blocked_fkey;
alter table public.shed_blocks add constraint shed_blocks_blocked_fkey foreign key (blocked) references public.shed_profiles(id) on delete cascade;
alter table public.shed_reports drop constraint if exists shed_reports_reporter_fkey;
alter table public.shed_reports add constraint shed_reports_reporter_fkey foreign key (reporter) references public.shed_profiles(id) on delete cascade;
alter table public.shed_reports drop constraint if exists shed_reports_chat_id_fkey;
alter table public.shed_reports add constraint shed_reports_chat_id_fkey foreign key (chat_id) references public.shed_chat(id) on delete set null;

-- 4. Housekeeping, hourly: stale lobbies, abandoned games, old reactions, spent counters, and anonymous users who never
-- picked a name (so own no rows). Finished tables are kept: head to head is counted from them.
create extension if not exists pg_cron;
create or replace function public.shed_cleanup()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.shed_tables where status = 'lobby' and created_at < now() - interval '6 hours';
  update public.shed_tables t set status = 'over'
    from public.shed_games g where g.code = t.code and t.status = 'playing' and g.updated_at < now() - interval '48 hours';
  delete from public.shed_games g using public.shed_tables t where g.code = t.code and t.status = 'over' and g.updated_at < now() - interval '2 days';
  delete from public.shed_views v using public.shed_tables t where v.code = t.code and t.status = 'over' and t.created_at < now() - interval '2 days';
  delete from public.shed_chat where created_at < now() - interval '7 days';
  delete from public.shed_hits where win < extract(epoch from now()) - 86400;
  delete from auth.users u where u.is_anonymous and u.created_at < now() - interval '7 days'
    and not exists (select 1 from public.shed_profiles p where p.id = u.id);
$$;
revoke all on function public.shed_cleanup() from public, anon, authenticated;
select cron.unschedule('shed-cleanup') where exists (select 1 from cron.job where jobname = 'shed-cleanup');
select cron.schedule('shed-cleanup', '17 * * * *', 'select public.shed_cleanup()');

-- 5. Report and block (App Store 1.2). Reports name a player and the table, not just a reaction. Both go through the
-- edge function (checked and rate limited), so browsers lose direct writes to reports.
alter table public.shed_reports alter column chat_id drop not null;
alter table public.shed_reports add column if not exists target uuid references public.shed_profiles(id) on delete cascade;
alter table public.shed_reports add column if not exists code text;
alter table public.shed_reports add column if not exists name_seen text;
drop policy if exists "file a report" on public.shed_reports;
create unique index if not exists shed_blocks_pair on public.shed_blocks (blocker, blocked);
