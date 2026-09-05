-- ============================================================================
-- 0036_unit_base_multiplier_nullable.sql
-- units.base_multiplier becomes "not yet weighed" rather than "must be invented".
--
-- WHY. 0006 declared the column `numeric not null check (base_multiplier > 0)`.
-- NOT NULL plus a positive-only check means there is no way to record a unit
-- whose weight nobody has measured yet: NULL is refused and 0 is refused, so
-- the column offers no sentinel and no abstention. The only way to seed a
-- "bunch", a "paint rubber", a "congo" or a "tuber" today is to type a number
-- that no one weighed.
--
-- That number would be a fabricated measurement. `base_multiplier = 1` on a
-- bunch of plantain does not mean "unknown" -- it means "one bunch weighs one
-- kilogram", and every per-kg figure derived from it afterwards inherits that
-- claim silently. This is exactly P0.2: every displayed value came from human
-- input or is a labelled derivation of it.
--
-- The schema already made this call three times, in this codebase's own words:
--
--   commodities.seasonality_profile / site_offset_pct (0006):
--     "Null = not yet assessed. Defaulting to '{}'/0 would assert 'no
--      seasonality' / 'no site variance' as if measured, which P0.2 rules out."
--
--   collection_sites.lat / lng (0007):
--     "Nullable, no default: a site can be entered before it's geocoded, and
--      0/0 is a real coordinate off the coast of Ghana -- a false-precision
--      default would be worse than absent, same P0.2 logic."
--
-- base_multiplier was the odd one out. This migration makes it consistent with
-- the other three. Null means the unit exists and its weight has not been
-- established yet; it does not mean the unit is weightless, and it must never
-- be read as 1.
--
-- WHAT THIS UNBLOCKS. commodities.default_unit_id is `not null references
-- units (id)`, so a commodity cannot be seeded until its unit exists. Under the
-- old constraint, seeding the real product list meant either inventing a weight
-- for every non-metric unit or dropping every product that uses one. Neither is
-- acceptable, and the second silently shrinks the catalogue for a reason that
-- has nothing to do with the catalogue.
--
-- THE CHECK IS DELIBERATELY NOT TOUCHED. In Postgres a CHECK constraint passes
-- when it evaluates to NULL, and `NULL > 0` is NULL, not false. So
-- `check (base_multiplier > 0)` already tolerates NULL and continues to refuse
-- 0 and every negative the moment a real value is supplied. Rewriting it as
-- `base_multiplier is null or base_multiplier > 0` would be the same constraint
-- with more words and a new name in the catalogue. Verified rather than
-- assumed -- see the verification note at the foot of this file.
--
-- WHAT THIS DOES NOT DO. It does not make a null multiplier convertible.
-- 0006 calls this column "the only legal path from a 50kg-bag price to a per-kg
-- price", and that is still true: a unit with no multiplier cannot be converted
-- at all. Every caller that normalises across units must branch on null and
-- REFUSE, never coerce to 1 and never skip the row silently. Concretely, the
-- ingest route's outlier check compares a submitted price against the series'
-- last observation, and where either unit has no multiplier it must fall back
-- to flagging the unit change for human review rather than computing a ratio
-- across two units it cannot relate. A null that gets defaulted to 1 somewhere
-- downstream reintroduces the fabricated measurement this migration exists to
-- prevent, one layer further from the schema where it is harder to see.
--
-- REVERSIBILITY. Re-adding NOT NULL later requires every row to carry a value,
-- which is the intended end state once the weights come back from the field.
-- Nothing here forecloses that.
-- ============================================================================

alter table units
  alter column base_multiplier drop not null;

comment on column units.base_multiplier is
  'Conversion factor to the canonical base unit (kg). NULL = not yet weighed '
  '(P0.2) -- the unit is real, its weight has not been established. NULL is '
  'NOT 1 and must never be coerced to 1: a caller that cannot convert must '
  'refuse rather than assume. The CHECK (> 0) still governs every non-null '
  'value, because a CHECK passes on NULL and NULL > 0 is NULL.';

-- ----------------------------------------------------------------------------
-- Verification, run against this project inside a transaction that was rolled
-- back (units still NOT NULL afterwards, zero rows left behind, table still
-- empty):
--
--   check_def   = CHECK ((base_multiplier > (0)::numeric))   -- unchanged
--   null value  = ACCEPTED
--   0           = REFUSED (check_violation)
--   -1          = REFUSED (check_violation)
--   50          = ACCEPTED
--   backfill    = OK      -- a null row can later be updated to a real weight
-- ----------------------------------------------------------------------------
