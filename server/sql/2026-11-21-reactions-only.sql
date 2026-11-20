-- Apply WITH the edge function v5 deploy (not before: v4 has no 'react' op, but nothing writes chat today either).
-- Reactions now go through the edge function (fixed list, throttled). Browsers must not write chat rows directly,
-- or free text could bypass the list. Reading stays as it is: seated players only, blocked players hidden.
drop policy if exists "chat insert by seated" on public.shed_chat;
create index if not exists shed_chat_code_id on public.shed_chat (code, id);
