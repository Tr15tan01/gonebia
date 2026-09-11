create table if not exists ai_usage_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  feature text not null,       -- e.g. "extraction", "chat_answer", "discover", "agent_research"
  job text not null,           -- the AiJob tier key from lib/ai/models.ts, e.g. "fast" | "general" | "reasoning" | "embedding"
  model text not null,         -- actual model id used, e.g. "gemini-3.6-flash"
  input_tokens int,
  output_tokens int,
  estimated_cost_usd numeric(12,8),
  success boolean not null default true,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_log_user_idx on ai_usage_log (user_id, created_at desc);
create index if not exists ai_usage_log_created_idx on ai_usage_log (created_at desc);

-- Service-role only, same pattern as `users` - this is operational/billing
-- data, nobody reads it through the anon key or client-side RLS.
alter table ai_usage_log enable row level security;
