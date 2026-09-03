-- Password reset tokens. Only the SHA-256 hash of the token is stored -
-- never the raw token - so a database read alone can't be used to reset
-- anyone's password; the raw token only ever exists in the emailed link.
create table if not exists password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists password_reset_tokens_user_idx on password_reset_tokens (user_id);
alter table password_reset_tokens enable row level security;
-- No policies defined on purpose, same as `users` - only the service-role
-- key should ever touch this table.
