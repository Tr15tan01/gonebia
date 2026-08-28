-- Gonebia: Books feature
-- If your SQL editor wraps everything in one transaction and errors on
-- "unsafe use of new value", run this first line alone, then the rest.
alter type memory_type add value if not exists 'book';

create table if not exists books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_id uuid references memories(id) on delete set null,
  title text not null,
  title_normalized text not null,
  author text,
  status text not null default 'want_to_read'
    check (status in ('want_to_read','reading','finished','abandoned')),
  rating int check (rating between 1 and 5),
  notes text,
  recommended_by text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, title_normalized)
);
create index if not exists books_user_status_idx on books (user_id, status);

alter table books enable row level security;
create policy "owner all" on books for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
