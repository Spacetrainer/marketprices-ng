-- 0007_collection_sites.sql
-- MarketPrices — Stage 2, migration batch 2
--
-- collection_sites (§9.2): id, name, type, city, state, lat, lng, is_active.
-- PROVENANCE ONLY (P1.8/M3) — this table exists to say where a price came
-- from, never to enable a market-vs-market view. No aggregate/ranking column
-- (an "average price at this site", a rank, a comparison score) belongs here,
-- now or later — collected_at_site_id on price_observations may be displayed
-- but is never a filter or grouping axis. A small, flat list of places.
--
-- type is text + check, not a third enum — same call as entitlements.source.

create table collection_sites (
  id          uuid primary key default extensions.uuid_generate_v4(),
  name        text not null,
  type        text not null check (type in ('produce_market', 'abattoir')),
  city        text not null,
  state       text not null,

  -- Nullable, no default: a site can be entered before it's geocoded, and
  -- 0/0 is a real coordinate off the coast of Ghana — a false-precision
  -- default would be worse than absent, same P0.2 logic as seasonality_profile.
  lat         double precision check (lat between -90 and 90),
  lng         double precision check (lng between -180 and 180),

  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table collection_sites enable row level security;

-- collection_sites_select_active: anyone, signed in or not, can read an active
-- site; a deactivated one disappears from reads entirely.
create policy collection_sites_select_active
  on collection_sites
  for select
  to anon, authenticated
  using (is_active);

-- collection_sites_insert_staff: an admin or editor can add a new site.
create policy collection_sites_insert_staff
  on collection_sites
  for insert
  to authenticated
  with check (is_admin_or_editor(auth.uid()));

-- collection_sites_update_staff: an admin or editor can edit an existing site,
-- including flipping is_active.
create policy collection_sites_update_staff
  on collection_sites
  for update
  to authenticated
  using (is_admin_or_editor(auth.uid()))
  with check (is_admin_or_editor(auth.uid()));

-- No delete policy: RLS enabled + zero matching policies = default deny.
-- A retired site is deactivated, never deleted — price_observations
-- .collected_at_site_id must keep resolving.