-- Re-runs the SAME repoint logic as 0009, safely, in case any table's
-- foreign key drifted back to auth.users(id) after 0009 already ran - e.g.
-- if 0005_upgrade.sql (or another earlier migration) was re-applied
-- afterward, which would recreate that table with its original
-- "references auth.users(id)" definition, undoing 0009's fix for that one
-- table specifically.
--
-- Safe to run as many times as you want: it only touches constraints that
-- CURRENTLY reference auth.users - anything already pointing at
-- public.users is left untouched.
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

-- Run this SELECT afterward (separately) to confirm nothing still points at
-- auth.users - it should return ZERO rows:
--
-- select tc.table_name, tc.constraint_name
-- from information_schema.table_constraints tc
-- join information_schema.constraint_column_usage ccu
--   on tc.constraint_name = ccu.constraint_name and tc.constraint_schema = ccu.constraint_schema
-- where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
--   and ccu.table_schema = 'auth' and ccu.table_name = 'users';
