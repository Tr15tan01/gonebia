-- ============ TimelyMemo upgrade: billing, usage, notifications, agents, google ============
-- This file is safe to run multiple times: every "create policy" is preceded
-- by "drop policy if exists" (unlike "create table", Postgres has no
-- "create policy if not exists", so re-running an unmodified copy of this
-- file used to fail with "policy already exists" once it got partway through
-- on a previous attempt).

-- subscription state (written ONLY by Paddle webhooks via service role)
create table if not exists subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free','pro')),
  status text not null default 'none',
  paddle_customer_id text,
  paddle_subscription_id text,
  price_id text,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);
alter table subscriptions enable row level security;
drop policy if exists "owner read" on subscriptions;
create policy "owner read" on subscriptions for select using (auth.uid() = user_id);

-- monthly usage counters (incremented by RPC)
create table if not exists usage_counters (
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null,
  text_month int not null default 0,
  voice_month int not null default 0,
  chat_month int not null default 0,
  chat_today int not null default 0,
  chat_day date,
  discover_month int not null default 0,
  agent_month int not null default 0,
  ystb_month int not null default 0,
  primary key (user_id, month)
);
alter table usage_counters enable row level security;
drop policy if exists "owner read" on usage_counters;
create policy "owner read" on usage_counters for select using (auth.uid() = user_id);

create or replace function bump_usage(p_user uuid, p_field text, p_amount int default 1)
returns int language plpgsql security definer set search_path = public as $$ declare v_allowed text[] := array['text_month','voice_month','discover_month','agent_month','ystb_month'];
        v_new int;
begin
  if not (p_field = any(v_allowed)) then raise exception 'invalid field'; end if;
  execute format(
    'insert into usage_counters (user_id, month, %I) values ($1, to_char(now(),''YYYY-MM''), $2)
     on conflict (user_id, month) do update set %I = usage_counters.%I + $2
     returning %I into v_new', p_field, p_field, p_field, p_field)
  using p_user, p_amount;
  return v_new;
end $$;
grant execute on function bump_usage(uuid, text, int) to authenticated;

create or replace function bump_chat_usage(p_user uuid)
returns table (chat_month int, chat_today int)
language sql security definer set search_path = public as $$   insert into usage_counters (user_id, month, chat_month, chat_today, chat_day)
  values (p_user, to_char(now(),'YYYY-MM'), 1, 1, current_date)
  on conflict (user_id, month) do update set
    chat_month = usage_counters.chat_month + 1,
    chat_today = case when usage_counters.chat_day = current_date then usage_counters.chat_today + 1 else 1 end,
    chat_day = current_date
  returning usage_counters.chat_month, usage_counters.chat_today;
 $$;
grant execute on function bump_chat_usage(uuid) to authenticated;

-- notifications: read state + dedupe
alter table notifications add column if not exists dedupe_key text;
alter table notifications drop constraint if exists notifications_status_check;
alter table notifications add constraint notifications_status_check
  check (status in ('unread','read','done','snoozed','dismissed','not_relevant'));
create unique index if not exists notifications_dedupe_idx
  on notifications (user_id, dedupe_key) where dedupe_key is not null;

-- discover cached results
create table if not exists discover_results (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  time_window text not null default 'all',
  result jsonb not null default '{}',
  source_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (user_id, kind, time_window)
);
alter table discover_results enable row level security;
drop policy if exists "owner all" on discover_results;
create policy "owner all" on discover_results for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- agent runs
create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('research','buying','solver')),
  input text not null,
  status text not null default 'done' check (status in ('running','done','failed')),
  result jsonb not null default '{}',
  source_memory_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
alter table agent_runs enable row level security;
drop policy if exists "owner all" on agent_runs;
create policy "owner all" on agent_runs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- price watches (buying agent)
create table if not exists price_watches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  query text not null,
  target_price numeric(12,2),
  last_price numeric(12,2),
  last_url text,
  last_checked timestamptz,
  status text not null default 'active' check (status in ('active','stopped')),
  created_at timestamptz not null default now()
);
alter table price_watches enable row level security;
drop policy if exists "owner all" on price_watches;
create policy "owner all" on price_watches for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- google oauth tokens (server-side only)
create table if not exists google_integrations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  google_sub text,
  email text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table google_integrations enable row level security;
drop policy if exists "owner read" on google_integrations;
create policy "owner read" on google_integrations for select using (auth.uid() = user_id);
drop policy if exists "owner delete" on google_integrations;
create policy "owner delete" on google_integrations for delete using (auth.uid() = user_id);