-- ============================================================================
-- 0022_functions.sql
-- MarketPrices -- Stage 2, the functions batch (partial, deliberately).
--
-- Ships ONE function: set_updated_at(), and the twelve BEFORE UPDATE triggers
-- that use it. Every table in this build carrying an `updated_at` column gets
-- one, in a single migration, so that the column means the same thing
-- everywhere on the day it starts being maintained at all.
--
-- THE SANCTION FOR DOING IT THIS WAY is written into 0013_articles.sql, above
-- articles.updated_at:
--
--     "Nothing currently maintains this column: no set_updated_at trigger
--      exists on any table in this build. The editor's Update action sets it.
--      If that ever becomes a trigger it should become one for every table at
--      once, not for this one alone."
--
-- This is that migration, and this is that shape: all twelve at once, not one
-- table now and the rest whenever each is next touched. A column maintained by
-- a trigger on some tables and by hand on others is worse than either, because
-- nothing downstream can tell which kind of `updated_at` it is holding.
--
-- THE TWELVE, verified against pg_attribute on 2026-08-31 as exactly the set
-- of tables in `public` with an `updated_at` column -- no more, no fewer:
--   articles, collection_sites, collectors, commodities, content_templates,
--   entitlements, media, profiles, sections, sources, tags, units.
--
-- videos.last_synced_at IS NOT ONE OF THEM, against the apparent invitation in
-- 0016_videos.sql (~176), which anticipates this batch by name. Declined: the
-- column is not an `updated_at` wearing a different name. It means "when the
-- sync last saw this row", and it exists to tell a current mirror apart from
-- the last thing a job that has been failing for a week managed to write --
-- P2.9's staleness problem in another table. A generic BEFORE UPDATE trigger
-- would stamp it on any editorial write to a videos row, asserting a sync that
-- never ran and destroying the exact signal the column carries. It stays
-- written by the sync, the only writer that knows whether a sync happened. If
-- videos ever grows a real updated_at, that column joins the twelve and
-- last_synced_at still does not.
--
-- NO WHEN GUARD ON ANY OF THE TWELVE, and it is a decision rather than an
-- omission. The obvious optimisation -- `when (old.* is distinct from new.*)`
-- -- is refused for two reasons:
--
--   1. It changes what the column means. With the guard, updated_at is "when
--      this row last CHANGED"; without it, "when this row was last WRITTEN".
--      This build wants the second. An editor who opens a record and saves it
--      has acted on it, and the timestamp that orders editorial work should
--      move even when the save happened to change nothing.
--   2. A row-wise `old.* is distinct from new.*` requires every column in the
--      table to have an equality operator. None of the twelve breaks that
--      today, but adding one column of a type that lacks one (json, notably)
--      would turn a working trigger into a runtime error on every update --
--      a latent failure adopted in exchange for skipping one assignment.
--
-- CHECKED AGAINST THE EXISTING GUARDS. Two of the twelve already carry a
-- BEFORE UPDATE trigger: articles_protect_provenance and
-- profiles_protect_privileges. Both compare NAMED columns (agent_assisted,
-- content_item_id; role, is_active, is_2fa_enabled) rather than whole rows, so
-- neither can be tripped by a changed updated_at regardless of firing order.
-- Postgres fires same-timing triggers in name order, which puts *_protect_*
-- before *_set_updated_at on both tables, but nothing here depends on that.
--
-- updated_at BECOMES UNWRITABLE BY HAND, which is the point. The trigger
-- overwrites whatever a caller supplies. Per P0.2 the column is a labelled
-- derivation -- the moment the database wrote the row -- and not an input any
-- caller gets to assert. Application code that currently sets it explicitly is
-- not broken by this; its value is simply replaced with the true one.
--
-- FOUR APPLIED MIGRATIONS CARRY A COMMENT THIS MIGRATION MAKES FALSE:
-- 0013_articles.sql (~182), 0016_videos.sql (~176), 0017_engine_sources.sql
-- (~165) and 0018_content_items.sql (~85) each state that no set_updated_at
-- trigger exists anywhere in this build. True when written, false from here.
-- Applied migrations are never edited to correct a comment in place; the
-- durable record is the [Functions] entry in docs/exceptions.md. Read those
-- four as dated statements, not as current fact.
--
-- THIS IS A PARTIAL BATCH. The build plan's migration table (~line 728) names
-- four functions: iso_week_of(), zscore_12wk(), basket_cost() and
-- set_updated_at(). Only the last ships here. Verified against pg_proc on
-- 2026-08-31 that none of the other three exists, so nothing depends on them.
-- The reason is testability, not effort: all three are price/analytics
-- functions with no current callers and no job to exercise them, and a
-- function shipped without a caller is one whose first real test happens in
-- production. iso_week_of() additionally must not be written before it is
-- reconciled with lib/weeks.ts, the stated single source of ISO week
-- arithmetic on the application side -- two independent implementations of the
-- same week boundaries is the failure this project can least afford. They land
-- as their own migration when Stage 4 gives them callers.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- set_updated_at()
--
-- Not SECURITY DEFINER and no search_path pin: the body touches no table, no
-- schema-qualified object and no other function -- only NEW and now(), which
-- is pg_catalog and always resolvable. Same posture as this build's other
-- plain trigger functions (protect_audit_log, protect_content_status,
-- protect_weight_proposal).
--
-- now() is transaction start time, so every row touched by one transaction
-- carries the same updated_at. That is the intended reading: a save is one
-- moment, not a scatter of microseconds.
-- ----------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function set_updated_at() is
  'BEFORE UPDATE trigger function. Stamps updated_at with the transaction '
  'timestamp on every update, overwriting any caller-supplied value: the '
  'column is a derivation, not an input (P0.2). Installed on all twelve '
  'tables carrying updated_at, deliberately without a WHEN guard, so the '
  'column means "last written" and means the same thing on every table.';

-- ----------------------------------------------------------------------------
-- The twelve triggers. Alphabetical, one per table, identical in every
-- respect. Named <table>_set_updated_at.
-- ----------------------------------------------------------------------------

create trigger articles_set_updated_at
  before update on articles
  for each row execute function set_updated_at();

create trigger collection_sites_set_updated_at
  before update on collection_sites
  for each row execute function set_updated_at();

create trigger collectors_set_updated_at
  before update on collectors
  for each row execute function set_updated_at();

create trigger commodities_set_updated_at
  before update on commodities
  for each row execute function set_updated_at();

create trigger content_templates_set_updated_at
  before update on content_templates
  for each row execute function set_updated_at();

create trigger entitlements_set_updated_at
  before update on entitlements
  for each row execute function set_updated_at();

create trigger media_set_updated_at
  before update on media
  for each row execute function set_updated_at();

create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function set_updated_at();

create trigger sections_set_updated_at
  before update on sections
  for each row execute function set_updated_at();

create trigger sources_set_updated_at
  before update on sources
  for each row execute function set_updated_at();

create trigger tags_set_updated_at
  before update on tags
  for each row execute function set_updated_at();

create trigger units_set_updated_at
  before update on units
  for each row execute function set_updated_at();
