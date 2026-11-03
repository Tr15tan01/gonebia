-- Watch changes the user hasn't looked at yet. A watch has unseen changes
-- when last_changed_at is newer than seen_at (or than created_at, if it was
-- never opened). The dashboard's Watching tile lights up for these; opening
-- the Watch tab marks them seen.
-- Safe to run more than once.

alter table watches add column if not exists seen_at timestamptz;

-- the dashboard reads "active watches that changed recently" on every load
create index if not exists watches_user_changed_idx on watches (user_id, last_changed_at desc);
