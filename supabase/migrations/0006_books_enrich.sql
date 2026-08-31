-- Books enrichment: online lookup results (user text is never modified)
alter table books add column if not exists topic text;
alter table books add column if not exists pub_year int;
alter table books add column if not exists description text;
alter table books add column if not exists cover_url text;
alter table books add column if not exists isbn text;
alter table books add column if not exists enrich_status text not null default 'none'
  check (enrich_status in ('none','enriched','not_found'));
