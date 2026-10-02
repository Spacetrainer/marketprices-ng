-- ============================================================================
-- 0037_commodity_group_nullable.sql
-- commodities.commodity_group becomes "not yet assigned" rather than "duplicate
-- the category and hope".
--
-- WHY. 0006 declared commodity_group and category as two separate `text not
-- null` columns. §9.2 of the architecture lists them side by side --
-- `commodities (id, slug, canonical_name, aliases, group, category, ...)` --
-- and never says what distinguishes them. Neither column carries a CHECK or a
-- foreign key; both are free text. There is no taxonomy anywhere in the specs
-- that fills two axes: the only fixed vocabulary is the basket's four
-- sub-indices (staples, protein, vegetables, oils & condiments), and that lives
-- on basket_definition.sub_index, not here.
--
-- The real product list supplies ONE axis -- the finer bucket, which belongs in
-- `category`. That leaves commodity_group with no honest value, and under NOT
-- NULL only three ways to seed:
--
--   1. Copy category into commodity_group. This is not a placeholder, it is an
--      assertion: it claims the two taxonomies are identical. They are not --
--      there is one axis and the schema wants two. Every consumer that later
--      groups by commodity_group would silently get the fine-grained list back
--      and read it as a coarse roll-up.
--
--   2. Derive a coarse grouping by collapsing the categories. The mapping would
--      then be the machine's invention rather than an editorial decision, and
--      it would go on to drive basket sub-index membership and radar grouping.
--      A taxonomy nobody chose is worse than no taxonomy.
--
--   3. Drop every product until the grouping exists -- which blocks the whole
--      catalogue on a column nothing reads yet.
--
-- All three are worse than recording the truth: this commodity's coarse group
-- has not been decided. That is P0.2, and it is the call the schema already
-- makes for commodities.seasonality_profile and site_offset_pct ("Null = not
-- yet assessed"), and for collection_sites.lat/lng ("a false-precision default
-- would be worse than absent"). 0036 made the same call for
-- units.base_multiplier. This migration is the fourth instance of one pattern,
-- not a new idea.
--
-- CATEGORY IS DELIBERATELY UNTOUCHED. It stays NOT NULL, because the product
-- list does supply it for every row. Only the axis that has no source becomes
-- nullable. Verified rather than assumed -- see the foot of this file.
--
-- SEPARATE FROM 0036 ON PURPOSE. The two changes share a rationale and touch
-- different tables for different reasons: 0036 unblocks units whose weight
-- nobody has measured, this one unblocks a taxonomy nobody has defined. They
-- are reviewed, applied and reverted independently.
--
-- WHAT THIS DOES NOT DO. It does not decide what commodity_group means. When
-- the coarse grouping is defined, it is backfilled with a plain UPDATE (proven
-- below) and this column can be made NOT NULL again in its own migration.
-- Until then, any query that groups by commodity_group must treat null as its
-- own bucket and say so on screen -- never fold nulls into an arbitrary group,
-- and never render the null as the category's value.
-- ============================================================================

alter table commodities
  alter column commodity_group drop not null;

comment on column commodities.commodity_group is
  'Coarse roll-up above category. NULL = not yet assigned (P0.2) -- the '
  'product list supplies only the finer `category` axis, and copying it in '
  'here would assert the two taxonomies are the same. Null is its own bucket: '
  'never folded into another group, never displayed as the category value. '
  'Backfill with a plain UPDATE once the grouping is decided.';

-- ----------------------------------------------------------------------------
-- Verification, run against this project inside a transaction that was rolled
-- back (commodity_group still NOT NULL afterwards, category still NOT NULL,
-- both tables still empty):
--
--   checks_on_column = (none)     -- no CHECK references commodity_group
--   group  = null   -> ACCEPTED
--   group  = 'Staples' -> ACCEPTED
--   category = null -> REFUSED (not_null_violation)   -- untouched, as intended
--   backfill null -> 'Staples' -> OK
-- ----------------------------------------------------------------------------
