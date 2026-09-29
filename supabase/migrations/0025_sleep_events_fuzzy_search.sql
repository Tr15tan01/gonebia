-- TimelyMemo: sleep from bedtime/wake-up notes + typo-tolerant search.
-- Safe to run more than once.

-- 1. Bedtime / wake-up notes ("going to bed", "woke up at 6:40") are tagged
--    at capture so Ask my memory can pair them into nights and total them.
alter table memory_metadata add column if not exists sleep_event text;
do $$ begin
  alter table memory_metadata add constraint memory_metadata_sleep_event_chk
    check (sleep_event is null or sleep_event in ('bedtime', 'wake'));
exception when duplicate_object then null; end $$;

-- 2. Typo-tolerant search. For each query word that never appears in the
--    user's own notes, suggest the closest words that do ("freind" ->
--    "friend", "cofee" -> "coffee"): edit distance 1 for 4-5 letter words,
--    2 for longer ones, plus swapped letters ("wrok" -> "work").
create extension if not exists fuzzystrmatch;

create or replace function public.sorted_letters(p text)
returns text language sql immutable parallel safe as $$
  select string_agg(c, '' order by c) from regexp_split_to_table(p, '') as c
$$;

create or replace function public.fuzzy_terms(p_user uuid, p_terms text[])
returns table (term text, match text, distance int, uses int)
language sql stable
set search_path = public, extensions
as $$
  with recent as (
    select original_text from memories
    where user_id = p_user and deleted_at is null
    order by created_at desc
    limit 5000
  ),
  vocab as (
    select w as word, count(*)::int as uses
    from recent, regexp_split_to_table(lower(original_text), '[^[:alnum:]]+') as w
    where length(w) >= 3 and length(w) <= 40
    group by w
  ),
  terms as (
    select distinct lower(t) as term from unnest(p_terms) as t
    where length(t) >= 4 and length(t) <= 40
  ),
  unknown as (
    select t.term from terms t where not exists (select 1 from vocab v where v.word = t.term)
  ),
  scored as (
    select u.term, v.word as match, levenshtein(u.term, v.word) as distance, v.uses
    from unknown u
    join vocab v on abs(length(v.word) - length(u.term)) <= 2
  ),
  cand as (
    select s.*, row_number() over (partition by s.term order by s.distance, s.uses desc, s.match) as rn
    from scored s
    where s.distance <= case when length(s.term) >= 6 then 2 else 1 end
       or (s.distance = 2 and length(s.term) = length(s.match) and sorted_letters(s.term) = sorted_letters(s.match))
  )
  select term, match, distance, uses from cand where rn <= 2
$$;
