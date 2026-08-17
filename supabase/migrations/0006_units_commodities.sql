-- 0006_units_commodities.sql
-- MarketPrices — Stage 2, migration batch 2
--
-- units and commodities (§9.2). Both are on P9.1's anon-SELECT allowlist —
-- reference data, readable by everyone. commodities gates on is_active like
-- sections did in 0002; units has no such gate, so it's a flat anon SELECT.
--
-- "group" is a reserved SQL word, renamed to commodity_group rather than quoted.

-- units
create table units (
  id               uuid primary key default extensions.uuid_generate_v4(),
  name             text not null unique,
  abbreviation     text not null unique,

  -- Conversion factor to the canonical base unit (kg). The only legal path
  -- from a 50kg-bag price to a per-kg price runs through this column.
  base_multiplier  numeric not null check (base_multiplier > 0),

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table units enable row level security;

-- commodities
create table commodities (
  id                   uuid primary key default extensions.uuid_generate_v4(),
  slug                 text not null unique,
  canonical_name       text not null,

  -- Alternate names fed to the pg_trgm fuzzy match during fusion/ingest.
  aliases              text[] not null default '{}'::text[],

  commodity_group      text not null,
  category             text not null,

  default_unit_id      uuid not null references units (id) on delete restrict,

  icon                 text,
  display_order        smallint not null,

  is_tracked           boolean not null default true,
  is_active            boolean not null default true,

  -- Null = not yet assessed. Defaulting to '{}'/0 would assert "no seasonality"
  -- / "no site variance" as if measured, which P0.2 rules out.
  seasonality_profile  jsonb,
  site_offset_pct      numeric,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table commodities enable row level security;

-- is_admin_or_editor() — write gate for master-data tables: admin and editor
-- share write access here, unlike sections (admin-only). security definer.
create function is_admin_or_editor(uid uuid) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = uid and is_active and role in ('admin', 'editor')
  );
$$;

-- units_select_public: anyone, signed in or not, can read the full unit list.
create policy units_select_public
  on units
  for select
  to anon, authenticated
  using (true);

-- units_insert_staff: an admin or editor can add a new unit.
create policy units_insert_staff
  on units
  for insert
  to authenticated
  with check (is_admin_or_editor(auth.uid()));

-- units_update_staff: an admin or editor can edit an existing unit.
create policy units_update_staff
  on units
  for update
  to authenticated
  using (is_admin_or_editor(auth.uid()))
  with check (is_admin_or_editor(auth.uid()));

-- commodities_select_active: anyone can read an active commodity; a deactivated
-- one disappears from public/authenticated reads entirely.
create policy commodities_select_active
  on commodities
  for select
  to anon, authenticated
  using (is_active);

-- commodities_insert_staff: an admin or editor can add a new commodity.
create policy commodities_insert_staff
  on commodities
  for insert
  to authenticated
  with check (is_admin_or_editor(auth.uid()));

-- commodities_update_staff: an admin or editor can edit an existing commodity.
create policy commodities_update_staff
  on commodities
  for update
  to authenticated
  using (is_admin_or_editor(auth.uid()))
  with check (is_admin_or_editor(auth.uid()));

-- No delete policy on either table: RLS enabled + zero matching policies = default deny.