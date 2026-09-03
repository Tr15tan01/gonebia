-- ============ Independent auth: stop depending on Supabase Auth (auth.users) ============
-- This does NOT touch or drop anything in the `auth` schema - Supabase's own
-- tables are left alone, untouched, in case of rollback. It adds a plain
-- `public.users` table that the app now owns entirely, migrates existing
-- accounts (including their password hashes, so nobody has to reset their
-- password), and re-points every foreign key that used to reference
-- auth.users(id) to reference public.users(id) instead.
--
-- RLS is deliberately left exactly as it was on every table - the app no
-- longer relies on it (there is no Supabase-issued auth.uid() anymore, so
-- every policy checking auth.uid() = user_id will simply never match under
-- the new auth system). It stays enabled as a dormant safety net: if any
-- code path ever accidentally queries with the old anon/publishable key
-- instead of the service-role key, RLS will deny it rather than leak data.
-- All real application access now goes through the service-role key with
-- explicit `.eq('user_id', ...)` filters written by hand in the app code.

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  full_name text,
  created_at timestamptz not null default now()
);
-- No policies defined on purpose: nobody except the service-role key (which
-- bypasses RLS entirely) should ever read this table directly.
alter table users enable row level security;

-- One-time backfill of existing accounts, including their password hash -
-- Supabase Auth stores bcrypt hashes in auth.users.encrypted_password, which
-- is the exact same hashing scheme bcryptjs verifies, so existing users keep
-- their current password with zero disruption.
insert into users (id, email, password_hash, full_name, created_at)
select
  u.id,
  u.email,
  u.encrypted_password,
  coalesce(u.raw_user_meta_data->>'full_name', p.full_name, ''),
  u.created_at
from auth.users u
left join public.profiles p on p.id = u.id
where u.encrypted_password is not null
on conflict (id) do nothing;

-- Re-point every foreign key that referenced auth.users(id) to reference
-- public.users(id) instead - generic so it doesn't matter what Postgres
-- auto-named each constraint, or which column it's on (most are "user_id",
-- profiles' is "id").
do $$
declare
  r record;
begin
  for r in
    select
      tc.table_name,
      tc.constraint_name,
      kcu.column_name
    from information_schema.table_constraints tc
    join information_schema.constraint_column_usage ccu
      on tc.constraint_name = ccu.constraint_name and tc.constraint_schema = ccu.constraint_schema
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name and tc.constraint_schema = kcu.constraint_schema
    where tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema = 'public'
      and ccu.table_schema = 'auth' and ccu.table_name = 'users'
  loop
    execute format('alter table public.%I drop constraint %I', r.table_name, r.constraint_name);
    execute format(
      'alter table public.%I add constraint %I foreign key (%I) references public.users(id) on delete cascade',
      r.table_name, r.constraint_name, r.column_name
    );
    raise notice 'repointed %.% -> public.users(id)', r.table_name, r.column_name;
  end loop;
end $$;

-- handle_new_user() used to fire "after insert on auth.users" to create a
-- profiles/user_preferences row for every new signup. New signups no longer
-- insert into auth.users at all (the app's own /api/register route does the
-- equivalent inserts directly), so this trigger is now permanently dormant.
-- Left in place rather than dropped - harmless, and avoids touching the auth
-- schema at all.
