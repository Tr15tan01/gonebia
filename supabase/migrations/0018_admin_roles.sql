alter table users add column if not exists role text not null default 'user' check (role in ('user','admin'));
alter table users add column if not exists disabled_at timestamptz;
alter table users add column if not exists ai_paused_at timestamptz;

-- Promote yourself manually after running this migration, e.g.:
--   update users set role = 'admin' where email = 'you@yourdomain.com';
-- Deliberately not automated - nobody should become admin just by being
-- first to sign up or by any client-controllable action.

create table if not exists admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references users(id) on delete cascade,
  target_user_id uuid references users(id) on delete set null,
  action text not null,          -- e.g. "disable_account", "enable_account", "pause_ai", "resume_ai"
  details jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_log_target_idx on admin_audit_log (target_user_id, created_at desc);
create index if not exists admin_audit_log_admin_idx on admin_audit_log (admin_user_id, created_at desc);

-- Service-role only, same pattern as `users` - admin tooling never goes
-- through the anon key.
alter table admin_audit_log enable row level security;
