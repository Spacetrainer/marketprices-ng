-- 0002_sections.sql
-- MarketPrices — Stage 2, migration batch 1
--
-- The seven editorial sections. Reference data (P0.1) — seed.sql may assert
-- these rows, never article content.
--
-- Admin-only write policies (INSERT/UPDATE) are deferred to 0003_profiles.sql:
-- they check profiles.role, and profiles doesn't exist yet at this point in
-- the sequence. Until 0003 runs, this table has no write policy at all, so
-- writes are blocked outright — RLS enabled, zero matching policies, default
-- deny. That is a fail-closed gap, not a fail-open one.

create table sections (
  id           uuid primary key default extensions.uuid_generate_v4(),
  slug         text not null unique,
  name         text not null,
  descriptor   text,
  chip_bg      text not null check (chip_bg ~ '^--[a-z0-9-]+$'),
  chip_fg      text not null check (chip_fg ~ '^--[a-z0-9-]+$'),
  nav_order    smallint not null,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table sections enable row level security;

create policy sections_select_active
  on sections
  for select
  to anon, authenticated
  using (is_active);