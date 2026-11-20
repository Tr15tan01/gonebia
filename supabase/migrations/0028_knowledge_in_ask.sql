-- Ask my memory also searches the Knowledge base: saved notes / links /
-- quotes (knowledge_items) and finished research reports (agent_runs).
-- Each gets an embedding (written when saved; older rows are filled in the
-- first time the user asks something), and match_knowledge ranks both by
-- meaning, with a boost when the question's words appear in the title.
-- Safe to run more than once.

alter table knowledge_items add column if not exists embedding vector(768);
alter table agent_runs add column if not exists embedding vector(768);

create or replace function match_knowledge(
  p_user uuid,
  p_embedding text,
  p_query text default '',
  p_limit int default 5,
  p_min_similarity float default 0.55
)
returns table (source text, id uuid, title text, body text, url text, created_at timestamptz, similarity float)
language sql stable as $$
  with q as (select p_embedding::vector as v, websearch_to_tsquery('simple', coalesce(p_query, '')) as ts),
  candidates as (
    select k.kind as source, k.id, k.title, k.content as body, k.url, k.created_at,
      1 - (k.embedding <=> q.v) as sim,
      to_tsvector('simple', k.title) @@ q.ts as title_hit
    from knowledge_items k, q
    where k.user_id = p_user and k.embedding is not null
    union all
    select r.kind as source, r.id,
      coalesce(r.result->>'title', r.input) as title,
      coalesce(r.result->>'answer', '') as body, null as url, r.created_at,
      1 - (r.embedding <=> q.v) as sim,
      to_tsvector('simple', coalesce(r.result->>'title', '') || ' ' || r.input) @@ q.ts as title_hit
    from agent_runs r, q
    where r.user_id = p_user and r.embedding is not null and r.status = 'done'
      and r.kind in ('research', 'deep_research')
  )
  select c.source, c.id, c.title, c.body, c.url, c.created_at, c.sim as similarity
  from candidates c
  where c.sim >= p_min_similarity or c.title_hit
  order by c.sim + case when c.title_hit then 0.1 else 0 end desc
  limit greatest(p_limit, 1)
$$;
