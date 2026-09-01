-- Gonebia: connect every memory about a book (not just the one that first
-- added it) to that book's shelf entry - thoughts, quotes, reflections, etc.
alter table memory_metadata add column if not exists book_id uuid references books(id) on delete set null;
create index if not exists metadata_book_idx on memory_metadata (book_id) where book_id is not null;
