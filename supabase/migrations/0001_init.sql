-- Gonebia schema - run in Supabase SQL editor or `supabase db push`
create extension if not exists vector;

-- ============ PROFILES & PREFERENCES ============
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now()
);
create table user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'system' check (theme in ('light','dark','system')),
  quiet_hours_start int not null default 22,
  quiet_hours_end int not null default 8,
  push_enabled boolean not null default false,
  insight_sensitivity real not null default 0.75,
  updated_at timestamptz not null default now()
);
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$ begin
  insert into profiles (id, email, full_name)
  values (new.id, coalesce(new.email,''), coalesce(new.raw_user_meta_data->>'full_name',''))
  on conflict do nothing;
  insert into user_preferences (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function handle_new_user();

-- ============ MEMORIES ============
create type memory_type as enum (
  'thought','idea','task','event','purchase','expense','knowledge','question',
  'decision','promise','commitment','goal','habit','person','place','project',
  'observation','reflection','reminder'
);
create table memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  original_text text not null,
  source text not null default 'typed' check (source in ('typed','voice')),
  fts tsvector generated always as (to_tsvector('english', original_text)) stored,
  created_at timestamptz not null default now(),
  occurred_at timestamptz,
  deleted_at timestamptz
);
create index memories_user_created_idx on memories (user_id, created_at desc);
create index memories_fts_idx on memories using gin (fts);

create table memory_metadata (
  memory_id uuid primary key references memories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type memory_type not null default 'thought',
  title text not null default '',
  summary text not null default '',
  people text[] not null default '{}',
  places text[] not null default '{}',
  objects text[] not null default '{}',
  products text[] not null default '{}',
  companies text[] not null default '{}',
  amounts jsonb not null default '[]',
  category text not null default 'general',
  importance int not null default 3 check (importance between 1 and 5),
  status text not null default 'open' check (status in ('open','done','archived')),
  sentiment text check (sentiment in ('positive','neutral','negative')),
  confidence real not null default 0.5,
  is_decision boolean not null default false,
  decision_reason text,
  alternatives text[] not null default '{}',
  due_at timestamptz,
  reminder_at timestamptz,
  review_at timestamptz,
  extraction_status text not null default 'complete' check (extraction_status in ('complete','pending','failed')),
  corrected boolean not null default false,
  created_at timestamptz not null default now()
);
create index metadata_user_type_idx on memory_metadata (user_id, type);
create index metadata_user_status_idx on memory_metadata (user_id, status);
create index metadata_due_idx on memory_metadata (user_id, due_at) where status = 'open';

-- ============ EMBEDDINGS (pgvector) ============
create table memory_embeddings (
  memory_id uuid primary key references memories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  embedding vector(768) not null,
  model text not null default 'gemini-embedding-001',
  created_at timestamptz not null default now()
);
create index embeddings_hnsw_idx on memory_embeddings using hnsw (embedding vector_cosine_ops);

-- ============ TYPED DETAILS ============
create table tasks (
  memory_id uuid primary key references memories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'open' check (status in ('open','done','cancelled')),
  due_at timestamptz,
  completed_at timestamptz
);
create table events (
  memory_id uuid primary key references memories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_at timestamptz,
  place text
);
create table purchases (
  memory_id uuid primary key references memories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  product text, company text,
  amount numeric(12,2), currency text default 'GEL',
  purchased_at timestamptz
);
create table decisions (
  memory_id uuid primary key references memories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  decided_at timestamptz not null default now(),
  reason text,
  alternatives text[] not null default '{}'
);
create table goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  status text not null default 'active' check (status in ('active','achieved','dropped')),
  from_memory_id uuid references memories(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============ PEOPLE ============
create table people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  normalized text not null,
  notes text,
  first_seen_at timestamptz not null default now(),
  last_mentioned_at timestamptz not null default now(),
  unique (user_id, normalized)
);
create table memory_people (
  memory_id uuid references memories(id) on delete cascade,
  person_id uuid references people(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (memory_id, person_id)
);
create index memory_people_person_idx on memory_people (person_id);

-- ============ RELATIONSHIPS / INSIGHTS / BRIEFINGS ============
create table memory_relationships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  from_memory_id uuid not null references memories(id) on delete cascade,
  to_memory_id uuid not null references memories(id) on delete cascade,
  kind text not null check (kind in ('similar','duplicate','cluster','explicit')),
  score real not null default 0,
  created_at timestamptz not null default now(),
  unique (from_memory_id, to_memory_id, kind)
);
create table insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('forgotten','connection','intention','pattern','future_note')),
  title text not null,
  body text not null default '',
  data jsonb not null default '{}',
  source_memory_ids uuid[] not null default '{}',
  status text not null default 'new' check (status in ('new','dismissed','done','not_relevant','goal_created')),
  created_at timestamptz not null default now()
);
create index insights_user_idx on insights (user_id, kind, created_at desc);
create table daily_briefings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  briefing_date date not null,
  content jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (user_id, briefing_date)
);
create table weekly_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  content jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

-- ============ REMINDERS / NOTIFICATIONS / PUSH ============
create table reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_id uuid references memories(id) on delete cascade,
  remind_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','fired','cancelled')),
  created_at timestamptz not null default now()
);
create index reminders_due_idx on reminders (remind_at) where status = 'pending';
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_id uuid references memories(id) on delete set null,
  insight_id uuid references insights(id) on delete set null,
  kind text not null,
  title text not null,
  body text not null default '',
  data jsonb not null default '{}',
  status text not null default 'unread' check (status in ('unread','done','snoozed','dismissed','not_relevant')),
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications (user_id, created_at desc);
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  created_at timestamptz not null default now()
);

-- ============ ROW LEVEL SECURITY ============
alter table profiles enable row level security;
alter table user_preferences enable row level security;
alter table memories enable row level security;
alter table memory_metadata enable row level security;
alter table memory_embeddings enable row level security;
alter table tasks enable row level security;
alter table events enable row level security;
alter table purchases enable row level security;
alter table decisions enable row level security;
alter table goals enable row level security;
alter table people enable row level security;
alter table memory_people enable row level security;
alter table memory_relationships enable row level security;
alter table insights enable row level security;
alter table daily_briefings enable row level security;
alter table weekly_analyses enable row level security;
alter table reminders enable row level security;
alter table notifications enable row level security;
alter table push_subscriptions enable row level security;

create policy "own profile" on profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "own prefs read" on user_preferences for select using (auth.uid() = user_id);
create policy "own prefs update" on user_preferences for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own prefs insert" on user_preferences for insert with check (auth.uid() = user_id);

do $$ declare t text;
begin
  foreach t in array array[
    'memories','memory_metadata','memory_embeddings','tasks','events','purchases',
    'decisions','goals','people','memory_people','memory_relationships','insights',
    'daily_briefings','weekly_analyses','reminders','notifications','push_subscriptions'
  ] loop
    execute format($f$       create policy "owner all" on %I for all
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
    $f$, t);
  end loop;
end $$;

-- ============ VECTOR + HYBRID SEARCH ============
create or replace function match_memories(
  p_query_embedding vector(768),
  p_match_count int default 5,
  p_min_similarity float default 0.80
)
returns table (memory_id uuid, similarity float)
language sql stable as $$   select e.memory_id, 1 - (e.embedding <=> p_query_embedding) as similarity
  from memory_embeddings e
  where e.user_id = auth.uid()
    and 1 - (e.embedding <=> p_query_embedding) >= p_min_similarity
  order by e.embedding <=> p_query_embedding
  limit greatest(p_match_count, 1);
 $$;

create or replace function hybrid_search(
  p_query text default '',
  p_embedding vector(768) default null,
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
    where m.user_id = auth.uid() and m.deleted_at is null
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
      0::int as r2_placeholder,
      row_number() over (order by e.embedding <=> p_embedding) as r,
      1 - (e.embedding <=> p_embedding) as vsim
    from memories m
    join memory_embeddings e on e.memory_id = m.id
    join memory_metadata md on md.memory_id = m.id
    where m.user_id = auth.uid() and m.deleted_at is null and p_embedding is not null
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
