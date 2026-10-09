-- Every quiz answer the player submits. Used for points and per-chapter "last 30" averages.
-- Run once in Supabase: Dashboard → SQL Editor → New query → paste → Run.
--
-- The id columns copy their types from the existing tables, so this works whether
-- your ids are numbers (int8) or uuids.

do $$
declare
  class_id_type    text := (select format_type(atttypid, atttypmod) from pg_attribute where attrelid = 'public.classes'::regclass        and attname = 'id');
  chapter_id_type  text := (select format_type(atttypid, atttypmod) from pg_attribute where attrelid = 'public.chapters'::regclass       and attname = 'id');
  question_id_type text := (select format_type(atttypid, atttypmod) from pg_attribute where attrelid = 'public.quiz_questions'::regclass and attname = 'id');
begin
  execute format($sql$
    create table if not exists public.quiz_answers (
      id           bigint generated always as identity primary key,
      user_id      uuid        not null default auth.uid() references auth.users(id) on delete cascade,
      class_id     %s          not null references public.classes(id)        on delete cascade,
      chapter_id   %s                   references public.chapters(id)       on delete set null,
      question_id  %s          not null references public.quiz_questions(id) on delete cascade,
      is_correct   boolean     not null,
      points       integer     not null default 0,
      answered_at  timestamptz not null default now()
    )
  $sql$, class_id_type, chapter_id_type, question_id_type);
end $$;

create index if not exists quiz_answers_chapter_recent on public.quiz_answers (user_id, chapter_id, answered_at desc);
create index if not exists quiz_answers_class_recent   on public.quiz_answers (user_id, class_id,   answered_at desc);

-- Each player can only see and add their own answers.
alter table public.quiz_answers enable row level security;

drop policy if exists "read own answers" on public.quiz_answers;
create policy "read own answers" on public.quiz_answers
  for select using (auth.uid() = user_id);

drop policy if exists "add own answers" on public.quiz_answers;
create policy "add own answers" on public.quiz_answers
  for insert with check (auth.uid() = user_id);
