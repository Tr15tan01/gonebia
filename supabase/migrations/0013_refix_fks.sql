-- Re-runs the FK-repoint logic, using pg_constraint directly (Postgres's
-- own catalog) rather than the information_schema views used in the
-- original version of this migration - those views turned out to have a
-- real reliability gap: they under-reported which foreign keys still
-- referenced auth.users, letting some (memory_metadata, usage_counters,
-- confirmed in production) go undetected and unfixed across multiple runs.
-- pg_constraint is authoritative and doesn't have this issue.
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
      conrelid::regclass::text as table_name,
      conname as constraint_name,
      (select attname from pg_attribute where attrelid = conrelid and attnum = conkey[1]) as column_name
    from pg_constraint
    where contype = 'f'
      and connamespace = 'public'::regnamespace
      and confrelid = 'auth.users'::regclass
  loop
    execute format('alter table %s drop constraint %I', r.table_name, r.constraint_name);
    execute format(
      'alter table %s add constraint %I foreign key (%I) references public.users(id) on delete cascade',
      r.table_name, r.constraint_name, r.column_name
    );
    raise notice 'fixed %.%', r.table_name, r.column_name;
  end loop;
end $$;

-- Run this afterward (separately) to confirm nothing still points at
-- auth.users - it should return ZERO rows:
--
-- select conrelid::regclass as table_name, conname
-- from pg_constraint
-- where contype = 'f' and connamespace = 'public'::regnamespace
--   and confrelid = 'auth.users'::regclass;
