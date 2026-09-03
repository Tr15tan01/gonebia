-- ============ Fix RPCs that relied on auth.uid() ============
-- match_memories and hybrid_search both filtered internally by auth.uid() -
-- which only ever had a value under Supabase Auth's connection-level JWT.
-- Under the new custom auth system there is no such thing: auth.uid() is
-- permanently null now, which would make both functions silently match
-- ZERO rows for every single user, forever, even called with the
-- service-role key. Both now take the user id as an explicit parameter
-- instead. Old signatures are dropped first - changing a function's
-- parameter list isn't something CREATE OR REPLACE can do on its own, and
-- leaving the old signature around would create ambiguous overloads.

drop function if exists match_memories(text, int, float);
drop function if exists hybrid_search(text, text, text[], text, text, timestamptz, timestamptz, int);

create or replace function match_memories(
  p_user uuid,
  p_query_embedding text,
  p_match_count int default 5,
  p_min_similarity float default 0.80
)
returns table (memory_id uuid, similarity float)
language sql stable as $$   select e.memory_id, 1 - (e.embedding <=> p_query_embedding::vector) as similarity
  from memory_embeddings e
  where e.user_id = p_user
    and 1 - (e.embedding <=> p_query_embedding::vector) >= p_min_similarity
  order by e.embedding <=> p_query_embedding::vector
  limit greatest(p_match_count, 1);
 $$;

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
language plpgsql stable as $$ begin
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
    limit 30
  ),
  scored as (
    select id, r as kw_r, null::int as vec_r, vsim from kw
    union all
    select id, null::int as kw_r, r as vec_r, vsim from vec
  ),
  agg as (
    select id,
      coalesce(max(1.0 / (60 + kw_r)), 0) + coalesce(max(1.0 / (60 + vec_r)), 0) + coalesce(max(vsim), 0) * 0.15 as score
    from scored group by id
  )
  select m.id, m.original_text, m.created_at,
    md.type::text, md.title, md.summary, md.importance, md.status,
    md.due_at, coalesce(md.occurred_at, m.occurred_at), md.people, a.score
  from agg a
  join memories m on m.id = a.id
  join memory_metadata md on md.memory_id = m.id
  order by a.score desc
  limit greatest(p_limit, 1);
end $$;
