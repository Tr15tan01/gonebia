alter table users add column if not exists email_verified_at timestamptz;

create table if not exists email_verification_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists email_verification_tokens_user_idx on email_verification_tokens (user_id);
alter table email_verification_tokens enable row level security;
-- No policies, same as password_reset_tokens - only the service-role key touches this.
