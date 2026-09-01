-- Gonebia: price watches now track a specific product (with image + store
-- link) chosen from the buying agent's results, not just a free-text query.
alter table price_watches add column if not exists image_url text;
alter table price_watches add column if not exists product_url text;
