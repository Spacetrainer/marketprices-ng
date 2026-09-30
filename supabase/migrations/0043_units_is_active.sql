-- ============================================================================
-- 0043_units_is_active.sql
--
-- units gains is_active, the same retirement switch commodities and
-- collection_sites already have.
--
-- WHY NOW. seed.sql's own header records the problem: "`units` has NO is_active
-- column, so unlike commodities and collection_sites a unit cannot be retired
-- once it exists, and generate-form-options.ts reads the whole table with no
-- filter: every row here is a choice offered to a collector. A unit nothing
-- references is a wrong answer put in front of someone pricing ugwu leaf."
-- That is why the eighteen seeded units are only the retail ones. 0044 adds 36
-- more, most of them wholesale, and the table stops being a safe thing to read
-- unfiltered on the day it does. This column is the filter.
--
-- NOT NULL DEFAULT TRUE. Every unit that exists today is in use and stays
-- offered; nothing is retired by this migration. is_active = false is a human
-- decision taken later, one unit at a time, and never a delete: a unit id is
-- referenced by price_observations and by commodities.default_unit_id, so a
-- deleted unit would orphan a published price.
--
-- NO FUNCTIONAL CHANGE. Nothing reads the column yet. Teaching
-- generate-form-options.ts and the form builders to filter on it is a code
-- change in its own PR, not a migration.
--
-- FRESH DATABASE. `add column if not exists` on a table created by 0001, so it
-- runs identically on an empty database and on production. Re-runnable.
--
-- RLS. units already has RLS enabled with an anon SELECT policy; adding a
-- column changes no policy and needs none.
-- ============================================================================

begin;

alter table units
  add column if not exists is_active boolean not null default true;

comment on column units.is_active is 'False retires a unit from the collector-facing pickers. Never delete a unit: price_observations.unit_id and commodities.default_unit_id reference it, and a deleted unit orphans a published price.';

commit;
