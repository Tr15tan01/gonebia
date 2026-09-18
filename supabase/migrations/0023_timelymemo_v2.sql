-- TimelyMemo v2
--   * new memory types: movie, sleep (+ sleep_hours metric)
--   * agents: Buying Agent and Problem Solver removed (with their data),
--     Deep Research agent added
--   * Watch agent: URL-based price / job / content tracking (replaces price_watches)
--   * Knowledge base: user-added notes, links and quotes next to research runs
--
-- NOTE: "alter type ... add value" cannot run inside the same transaction as
-- statements that USE the new value. The two lines below only add values and
-- nothing in this file uses them, so the file is safe to run as a whole in the
-- Supabase SQL editor. If your runner wraps everything in one transaction and
-- complains, run the first two lines on their own, then the rest.
alter type memory_type add value if not exists 'movie';
alter type memory_type add value if not exists 'sleep';

-- occurred_at is written by every capture; make sure it exists (older
-- databases created before it was added would otherwise fail the sleep stats)
alter table memory_metadata add column if not exists occurred_at timestamptz;
create index if not exists memory_metadata_sleep_idx
  on memory_metadata (user_id, type, occurred_at desc);

alter table memory_metadata add column if not exists sleep_hours numeric(4,2)
  check (sleep_hours is null or (sleep_hours >= 0 and sleep_hours <= 24));

-- ============ AGENTS ============
-- Remove the retired agents and everything they produced.
delete from agent_runs where kind in ('buying', 'solver');
alter table agent_runs drop constraint if exists agent_runs_kind_check;
alter table agent_runs add constraint agent_runs_kind_check
  check (kind in ('research', 'deep_research'));
create index if not exists agent_runs_user_kind_idx on agent_runs (user_id, kind, created_at desc);

-- price_watches belonged to the Buying Agent only.
drop table if exists price_watches;

-- ============ WATCH AGENT ============
create table if not exists watches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  url text not null,
  kind text not null default 'price' check (kind in ('price', 'jobs', 'content')),
  label text not null default '',
  instructions text,
  target_price numeric(14,2),
  currency text,
  status text not null default 'active' check (status in ('active', 'paused')),
  image_url text,
  last_value numeric(14,2),
  last_snapshot jsonb not null default '{}',
  history jsonb not null default '[]',
  last_checked_at timestamptz,
  last_changed_at timestamptz,
  last_error text,
  check_count int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists watches_user_idx on watches (user_id, created_at desc);
create index if not exists watches_due_idx on watches (status, last_checked_at);

create table if not exists watch_events (
  id uuid primary key default gen_random_uuid(),
  watch_id uuid not null references watches(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null check (kind in (
    'baseline', 'price_drop', 'price_rise', 'target_hit', 'back_in_stock', 'out_of_stock',
    'jobs_added', 'jobs_removed', 'changed', 'error'
  )),
  summary text not null default '',
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists watch_events_watch_idx on watch_events (watch_id, created_at desc);
create index if not exists watch_events_user_idx on watch_events (user_id, created_at desc);

alter table watches enable row level security;
alter table watch_events enable row level security;

-- ============ KNOWLEDGE BASE ============
create table if not exists knowledge_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null default 'note' check (kind in ('note', 'link', 'quote')),
  title text not null,
  content text not null default '',
  url text,
  tags text[] not null default '{}',
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists knowledge_items_user_idx on knowledge_items (user_id, created_at desc);
alter table knowledge_items enable row level security;

-- Research runs can be pinned / tagged from the knowledge base too.
alter table agent_runs add column if not exists pinned boolean not null default false;
alter table agent_runs add column if not exists tags text[] not null default '{}';
