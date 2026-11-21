-- Rematch (21 Nov 2026): a finished table points to the table made for its rematch. Applied with edge function v6.
alter table public.shed_tables add column if not exists next_code text;
