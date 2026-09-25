-- TimelyMemo: books are identified by title AND author.
--
-- Before: one shelf entry per title, so "Free Will" (Sam Harris) could never
-- sit next to "Free Will" (Mark Balaguer), and the app's matching leaned on
-- title similarity alone. Now two books may share a title when their authors
-- differ. Safe to run more than once, and on a database with existing books
-- (every existing row is already unique by title, so it's unique by title +
-- author too).

alter table books drop constraint if exists books_user_id_title_normalized_key;

create unique index if not exists books_user_title_author_uidx
  on books (user_id, title_normalized, (lower(coalesce(author, ''))));

-- the shelf lookup reads a user's books most-recent first
create index if not exists books_user_updated_idx on books (user_id, updated_at desc);

-- the Books page and cleanup-on-delete look notes up by book
create index if not exists memory_metadata_book_idx on memory_metadata (book_id) where book_id is not null;
