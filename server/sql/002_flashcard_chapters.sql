-- Lets each flashcard belong to a chapter (optional, like quiz questions).
-- Run once in Supabase: Dashboard → SQL Editor → New query → paste → Run.
-- Existing flashcards keep working and show up under "No chapter".

do $$
declare
  chapter_id_type text := (select format_type(atttypid, atttypmod) from pg_attribute
                           where attrelid = 'public.chapters'::regclass and attname = 'id');
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'flashcards' and column_name = 'chapter_id') then
    execute format(
      'alter table public.flashcards add column chapter_id %s references public.chapters(id) on delete set null',
      chapter_id_type);
  end if;
end $$;

create index if not exists flashcards_chapter on public.flashcards (chapter_id);
