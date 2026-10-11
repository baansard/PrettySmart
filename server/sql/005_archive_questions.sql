-- Archive quiz questions you've mastered (answered correctly 10 times).
-- Archived questions stay in Manage (marked "archived") but are left out of quizzes.
-- Run once in Supabase: Dashboard → SQL Editor → New query → paste → Run.

alter table public.quiz_questions add column if not exists archived boolean not null default false;

-- When a question was last unarchived. Only correct answers after this count toward archiving it again.
alter table public.quiz_questions add column if not exists unarchived_at timestamptz;
