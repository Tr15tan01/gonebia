-- Fix hybrid_search: it has failed on EVERY call since 0010 with
-- 'column reference "id" is ambiguous'. In plpgsql the RETURNS TABLE columns
-- (id, title, score ...) are also variables, so the bare "id" in the scored /
-- agg CTEs could mean either. The app caught the error and fell back to a
-- plain recency-ordered ilike search, so semantic search never actually ran
-- ("jobready" found the note, "jobready credentials" didn't).
--
-- Also: the kw / vec CTEs took "limit 30" with no ORDER BY, so which 30 rows
-- survived was up to the planner - now they keep the 30 best.
-- Safe to run more than once.

create or replace function hybrid_search(
  p_user uuid,
  p_query text default '',
  p_embedding text default null,
  p_types text[] default null,
  p_person text default null,
  p_status text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit int default 20
)
returns table (
  id uuid, original_text text, created_at timestamptz,
  type text, title text, summary text, importance int, status text,
  due_at timestamptz, occurred_at timestamptz, people text[], score float
)
language plpgsql stable as $$
#variable_conflict use_column
begin
  return query
  with
  kw as (
    select m.id,
      row_number() over (order by ts_rank_cd(m.fts, websearch_to_tsquery('english', p_query)) desc) as r,
      0::float as vsim
    from memories m
    join memory_metadata md on md.memory_id = m.id
    where m.user_id = p_user and m.deleted_at is null
      and p_query <> '' and m.fts @@ websearch_to_tsquery('english', p_query)
      and (p_types is null or md.type::text = any(p_types))
      and (p_status is null or md.status = p_status)
      and (p_from is null or m.created_at >= p_from)
      and (p_to is null or m.created_at <= p_to)
      and (p_person is null or exists (
        select 1 from memory_people mp join people pe on pe.id = mp.person_id
        where mp.memory_id = m.id and pe.name ilike '%' || p_person || '%'))
    order by r
    limit 30
  ),
  vec as (
    select m.id,
      row_number() over (order by e.embedding <=> p_embedding::vector) as r,
      1 - (e.embedding <=> p_embedding::vector) as vsim
    from memories m
    join memory_embeddings e on e.memory_id = m.id
    join memory_metadata md on md.memory_id = m.id
    where m.user_id = p_user and m.deleted_at is null and p_embedding is not null
      and (p_types is null or md.type::text = any(p_types))
      and (p_status is null or md.status = p_status)
      and (p_from is null or m.created_at >= p_from)
      and (p_to is null or m.created_at <= p_to)
      and (p_person is null or exists (
        select 1 from memory_people mp join people pe on pe.id = mp.person_id
        where mp.memory_id = m.id and pe.name ilike '%' || p_person || '%'))
    order by r
    limit 30
  ),
  scored as (
    select kw.id, kw.r as kw_r, null::int as vec_r, kw.vsim from kw
    union all
    select vec.id, null::int as kw_r, vec.r as vec_r, vec.vsim from vec
  ),
  agg as (
    select s.id,
      coalesce(max(1.0 / (60 + s.kw_r)), 0) + coalesce(max(1.0 / (60 + s.vec_r)), 0) + coalesce(max(s.vsim), 0) * 0.15 as score
    from scored s group by s.id
  )
  select m.id, m.original_text, m.created_at,
    md.type::text, md.title, md.summary, md.importance, md.status,
    md.due_at, coalesce(md.occurred_at, m.occurred_at), md.people, a.score::float
  from agg a
  join memories m on m.id = a.id
  join memory_metadata md on md.memory_id = m.id
  order by a.score desc
  limit greatest(p_limit, 1);
end $$;
