-- Personal notes (ideas / to-dos for the game), shown in Manage → notes.
-- Run once in Supabase: Dashboard → SQL Editor → New query → paste → Run.

create table if not exists public.notes (
  id          bigint generated always as identity primary key,
  user_id     uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  text        text        not null,
  done        boolean     not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists notes_user on public.notes (user_id, created_at);

-- Each player can only see and change their own notes.
alter table public.notes enable row level security;

drop policy if exists "own notes" on public.notes;
create policy "own notes" on public.notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
