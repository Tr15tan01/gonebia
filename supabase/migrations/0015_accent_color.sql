alter table user_preferences
  add column if not exists accent_color text not null default 'amber'
  check (accent_color in ('amber','emerald','teal','sky','indigo','violet','rose','slate'));
