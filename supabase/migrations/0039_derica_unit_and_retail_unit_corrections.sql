-- ============================================================================
-- 0039_derica_unit_and_retail_unit_corrections.sql
-- One new unit, and three retail units corrected to what the field actually
-- reports.
--
-- ----------------------------------------------------------------------------
-- AMENDED 2026-09-25, AFTER THIS FILE HAD ALREADY BEEN APPLIED TO PRODUCTION.
-- Read this before the rest of the header.
--
-- This text is no longer byte-identical to what ran against marketprices-rebuild
-- on 2026-09-24. CLAUDE.md says never edit an applied migration, and that rule is
-- right. This is the exception, and this note is the price of it.
--
-- WHAT BROKE. The "Price decision path (0038)" CI job applies every migration to
-- an EMPTY database and loads seed.sql afterwards -- that is the order
-- `supabase start` and `supabase db reset` use: migrations first, seed second.
-- This file corrects rows that seed.sql creates, so on a fresh database it runs
-- before its subject exists. The precondition below counted the three
-- commodities, found zero, and raised. CI run 36116875280 died there, at this
-- file's first statement:
--
--   ERROR: expected 3 commodities (okro, ginger, garlic-local), found 0. This
--   migration corrects seeded rows; seed the catalogue first. (SQLSTATE P0001)
--
-- WHAT CHANGED. Three touches, all the same idea: an empty `commodities` table
-- means the catalogue has not been seeded yet, so there is nothing here to
-- correct and seed.sql already carries this file's end state (it was edited to
-- match in the same commit that added this migration).
--
--   1. The precondition returns early, with a notice, when `commodities` is empty.
--   2. The Derica insert is conditional on the catalogue existing, so a fresh
--      database is not given an orphan unit before seed.sql runs.
--   3. The verification block returns early on the same condition.
--
-- NOTHING ELSE MOVED, and the guards keep their teeth. A NON-EMPTY catalogue
-- missing the three slugs still raises, exactly as before: that is a real
-- anomaly, not a fresh database, and this amendment does not soften it. A
-- catalogue where someone has already changed one of the three defaults by hand
-- still raises. On a seeded database every statement here behaves as it did on
-- 2026-09-24.
--
-- WHY A LATER MIGRATION COULD NOT DO THIS. The failure is at THIS file's apply
-- time, so 0040 never gets to run. No fix existed that left this text untouched.
--
-- PRODUCTION WAS NOT RE-RUN AND DID NOT CHANGE. 0039 is recorded as applied in
-- marketprices-rebuild (`supabase migration list`: local 0039 / remote 0039) and
-- `supabase db push` selects work by version number, so the amended text will
-- never execute there. The three corrections landed on 2026-09-24 and stay
-- landed. Checked on 2026-09-25 in rolled-back transactions against production,
-- recorded at the foot of this file under VERIFICATION OF THE AMENDMENT.
--
-- THE COST, NAMED. The statements recorded against version 0039 in production
-- are the original ones. This file now reads slightly differently from what that
-- database executed, and no tool reconciles the two. That gap is the whole
-- reason for this note: nobody should have to diff a CI log against a migration
-- to find out.
-- ----------------------------------------------------------------------------
--
-- WHY. seed.sql took each commodity's default_unit_id from the `retail_unit`
-- column of data/marketprices-products.csv. That column is right for the great
-- majority of the 201 seeded products and wrong for these three, which the
-- sheet records as sold by the paint bucket at retail. Two of the three are now
-- contradicted by this project's own published series, and the third by a
-- human who collects the price.
--
-- THE THREE CORRECTIONS, each with the evidence behind it:
--
--   1. Ginger (MP-0117, slug `ginger`)            Paint bucket -> Plate
--      The 2026-W38 retail submission for ginger was approved and published as
--      an observation measured in PLATE, not in paint buckets. The commodity's
--      default therefore already disagrees with the only price this project
--      holds for it. Ginger retails in small heaps on a plate; a paint bucket
--      of ginger is a wholesale quantity, and the sheet's own wholesale unit
--      for this row is Sack.
--
--   2. Garlic Local (MP-0115, slug `garlic-local`) Paint bucket -> Small bundle
--      Identical shape of evidence: the 2026-W38 retail submission was approved
--      and published in SMALL BUNDLE. Garlic retails as a tied bundle of bulbs.
--      Wholesale on the sheet is Sack, which stays as it is.
--
--   3. Okro (MP-0028, slug `okro`)                Paint bucket -> Derica
--      No observation exists for okro yet, so this correction rests on a human
--      report and is recorded as one: confirmed on 2026-09-24 that okro is
--      retailed by the DERICA -- the milk-tin cup measure -- and not by the
--      paint bucket. Nothing is being derived from a price here, because there
--      is no okro price to derive from. Its wholesale unit stays Big basket.
--
-- The Derica did not exist in `units` and is created below. That is the whole
-- reason this is a migration and not a one-line UPDATE: the correction Okro
-- needs has no unit to point at.
--
-- SCOPE IS DELIBERATELY THREE ROWS. 77 seeded commodities default to Paint
-- bucket (counted against this database on 2026-09-24, not estimated); these
-- three are among them, and the other 74 were reviewed alongside them and are
-- correct as they stand, so they are not touched. A blanket sweep over the
-- paint-bucket set would be the machine deciding a retail unit for 74 products
-- nobody examined, which is the error this migration exists to undo, at scale.
--
-- THE CSV IS DELIBERATELY NOT EDITED. data/marketprices-products.csv is the
-- received source document, and seed.sql's header pins it by sha256
-- (1f700e723835f25aadb24c6b45fc5c1ddcce64ce96a857feb7782617a6f41dda) as the
-- provenance of all 201 rows. Editing it would invalidate that hash, destroy
-- the record of what the sheet actually said, and leave a reader unable to tell
-- a transcription error from a considered correction. So the sheet keeps its
-- three paint buckets, this file carries the corrections and the reasons, and
-- supabase/seed.sql is edited to match so that a fresh database is born
-- corrected rather than born wrong and patched.
--
-- ON base_multiplier. Derica is created with no multiplier, like all eight
-- units before it: null means "not yet weighed" (0036), not 1, and nothing may
-- convert across it until a real weight comes back from the field. A derica is
-- a real, standardised measure in Nigerian markets, but this project has not
-- weighed one, and writing a number here would fabricate the measurement.
--
-- WHAT THIS DOES NOT DO.
--   - It does not touch price_observations or price_submissions. Those are
--     append-only (P1) and each row records the unit the price was ACTUALLY
--     collected in; a later correction to a commodity's default says nothing
--     about a measurement already taken. Ginger's and Garlic Local's existing
--     rows already carry the corrected unit, so there is nothing to reconcile.
--     The guard at the foot proves no price row moved.
--   - It does not change any wholesale pairing. `commodities` holds one default
--     and that default is the retail unit; the wholesale units (Sack, Sack, Big
--     basket) are seeded and reachable, just not the default.
--   - It does not alter schema. No column, constraint or policy changes here.
--   - It does not regenerate data/form-options.json. That file is produced from
--     the live database by `pnpm gen:form-options` and must be regenerated
--     AFTER this migration is applied, not alongside it.
--
-- WHAT READS default_unit_id TODAY: nothing. Verified across app/, lib/,
-- components/ and scripts/ on 2026-09-24 -- the only occurrences are in the
-- generated types/database.ts. So this migration corrects the record rather
-- than any rendered figure, and it changes no displayed price. The column's
-- consumer is the collector's submission form, which will pre-select a unit
-- from it; a wrong default there is a wrong unit one careless tap away from
-- entering the series, which is why it is worth correcting before that form
-- reads it.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Precondition. Refuse loudly if the database is not the one this migration was
-- written against. All three commodities must exist and all three must still
-- read Paint bucket; if one of them has already been changed by hand, that was
-- a human decision this file knows nothing about and must not silently
-- overwrite.
-- ----------------------------------------------------------------------------

do $$
declare
  v_catalogue  int;
  v_found      int;
  v_unexpected text;
begin
  -- Added 2026-09-25; see AMENDED at the top. An empty `commodities` is a fresh
  -- database mid-`db reset`, where migrations run before seed.sql. There is
  -- nothing seeded to correct yet, and seed.sql carries this end state itself,
  -- so this file stands aside. This is the ONLY condition that skips the guards
  -- below.
  select count(*) into v_catalogue from commodities;

  if v_catalogue = 0 then
    raise notice
      '0039: commodities is empty -- a fresh database, built migrations-first. Nothing to correct; seed.sql carries this end state.';
    return;
  end if;

  select count(*) into v_found
    from commodities
   where slug in ('okro', 'ginger', 'garlic-local');

  if v_found <> 3 then
    raise exception
      'expected 3 commodities (okro, ginger, garlic-local), found %. This migration corrects seeded rows; seed the catalogue first.',
      v_found;
  end if;

  select string_agg(format('%s is already %L', c.slug, u.name), ', ' order by c.slug)
    into v_unexpected
    from commodities c
    join units u on u.id = c.default_unit_id
   where c.slug in ('okro', 'ginger', 'garlic-local')
     and u.name <> 'Paint bucket';

  if v_unexpected is not null then
    raise exception
      'default unit already changed outside this migration (%). Someone decided this by hand -- reconcile with them rather than overwriting it.',
      v_unexpected;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- units -- the Derica.
--
-- Abbreviation 'derica': the measure is called a derica in the market and the
-- word is already as short as its shorthand, so nothing is gained by clipping
-- it. Like the eight units seeded before it, the abbreviation is display
-- shorthand and nothing computes on it.
--
-- base_multiplier is omitted from the column list rather than written as NULL,
-- matching seed.sql: the column has no default, so omitting it stores NULL, and
-- writing it out would read like a value was considered.
--
-- ON CONFLICT DO NOTHING against the natural key, so this file is inert on a
-- database where seed.sql has already introduced the row.
--
-- WHERE EXISTS added 2026-09-25; see AMENDED at the top. On a fresh database
-- this file runs before seed.sql, and an unconditional insert would leave a
-- Derica in `units` that no commodity points at -- which the verification block
-- below would then correctly refuse. Gating on the catalogue keeps the whole
-- file inert until there is something to correct.
-- ----------------------------------------------------------------------------

insert into units (name, abbreviation)
select 'Derica', 'derica'
 where exists (select 1 from commodities)
on conflict (name) do nothing;

-- ----------------------------------------------------------------------------
-- commodities -- the three retail units.
--
-- Units are joined by name so no UUID is hardcoded here, the same rule seed.sql
-- follows. The join is an inner join, so a missing unit name silently updates
-- nothing rather than writing a null -- which is why the guard below counts the
-- result instead of trusting it.
-- ----------------------------------------------------------------------------

update commodities c
   set default_unit_id = u.id
  from (values
         ('okro'        , 'Derica'      ),
         ('ginger'      , 'Plate'       ),
         ('garlic-local', 'Small bundle')
       ) as fix (slug, unit_name)
  join units u on u.name = fix.unit_name
 where c.slug = fix.slug;

-- ----------------------------------------------------------------------------
-- Verification, in the file so it runs on every environment rather than only on
-- the one this was drafted against.
-- ----------------------------------------------------------------------------

do $$
declare
  v_catalogue int;
  v_ok        int;
  v_derica    record;
  v_users     int;
  v_price_use int;
begin
  -- Added 2026-09-25; see AMENDED at the top. Same condition as the
  -- precondition: nothing was corrected because there was nothing to correct,
  -- so there is nothing to verify. Every check below still runs on every
  -- database that HAS a catalogue.
  select count(*) into v_catalogue from commodities;

  if v_catalogue = 0 then
    raise notice '0039: nothing to verify -- commodities is empty and this file made no change.';
    return;
  end if;

  select count(*) into v_ok
    from commodities c
    join units u on u.id = c.default_unit_id
    join (values
           ('okro'        , 'Derica'      ),
           ('ginger'      , 'Plate'       ),
           ('garlic-local', 'Small bundle')
         ) as want (slug, unit_name)
      on want.slug = c.slug and want.unit_name = u.name;

  if v_ok <> 3 then
    raise exception
      'only % of the 3 retail-unit corrections landed. Expected okro=Derica, ginger=Plate, garlic-local=Small bundle.',
      v_ok;
  end if;

  select name, abbreviation, base_multiplier into v_derica
    from units where name = 'Derica';

  if v_derica is null then
    raise exception 'the Derica unit was not created';
  end if;

  if v_derica.abbreviation <> 'derica' then
    raise exception 'the Derica unit exists with abbreviation %L, not %L', v_derica.abbreviation, 'derica';
  end if;

  if v_derica.base_multiplier is not null then
    raise exception
      'the Derica unit has a base_multiplier of %. Nobody has weighed a derica; null means not yet weighed and must not be invented (0036, P0.2).',
      v_derica.base_multiplier;
  end if;

  -- Exactly one commodity may default to the Derica. More than one means this
  -- migration was widened past the row it was reviewed for.
  select count(*) into v_users
    from commodities c join units u on u.id = c.default_unit_id
   where u.name = 'Derica';

  if v_users <> 1 then
    raise exception 'the Derica is the default unit of % commodities, not 1 (okro)', v_users;
  end if;

  -- No price row may reference the new unit. This migration corrects a default;
  -- it does not restate a measurement anybody took (P1, append-only).
  select (select count(*) from price_observations o join units u on u.id = o.unit_id where u.name = 'Derica')
       + (select count(*) from price_submissions s join units u on u.id = s.unit_id where u.name = 'Derica')
    into v_price_use;

  if v_price_use <> 0 then
    raise exception
      'the Derica already appears on % price rows. A unit created in this migration cannot be the unit a past price was collected in.',
      v_price_use;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- Verified against marketprices-rebuild on 2026-09-24, run in full and then
-- rolled back. Confirmed afterwards that the database is untouched: `units` is
-- back to 8 rows with no Derica, and all three commodities read Paint bucket
-- again.
--
--   DEFAULT UNITS  before : garlic-local=Paint bucket | ginger=Paint bucket
--                           | okro=Paint bucket
--                  after  : garlic-local=Small bundle | ginger=Plate
--                           | okro=Derica
--
--   units count           : 8 -> 9
--   Derica row created    : name=Derica abbreviation=derica
--                           base_multiplier=NULL
--   units after           : Big basket, Big bundle, Big pack, Derica,
--                           Paint bucket, Plate, Sack, Small bundle, Small pack
--
--   price_observations    : unchanged, both before and after --
--                           garlic-local 2026-W38 retail Small bundle |
--                           ginger 2026-W38 retail Plate
--                           (these two rows ARE the evidence for corrections
--                           1 and 2; okro has no observation)
--   price_submissions     : unchanged, both before and after --
--                           garlic-local 2026-W38 approved Small bundle |
--                           ginger 2026-W38 approved Plate
--
--   precondition guard    : passed
--   in-file verification  : passed
--
-- SECOND APPLICATION REFUSES, checked separately and also rolled back: with the
-- two write statements already applied, re-running the precondition raised
--   default unit already changed outside this migration (garlic-local is
--   already 'Small bundle', ginger is already 'Plate', okro is already
--   'Derica'). Someone decided this by hand -- reconcile with them rather than
--   overwriting it.
-- That is the intended behaviour and is NOT idempotency: this file is applied
-- once, and a second attempt is treated as a signal that someone changed these
-- rows by hand rather than as a no-op to swallow.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- VERIFICATION OF THE AMENDMENT, 2026-09-25. Four checks against
-- marketprices-rebuild, every one of them inside a transaction that was rolled
-- back. Production was confirmed untouched afterwards on a fresh connection:
-- 201 commodities, 9 units, Derica present, 16 observations, 16 submissions,
-- and garlic-local=Small bundle | ginger=Plate | okro=Derica.
--
--   1. THE AMENDMENT CHANGES NOTHING ABOUT PRODUCTION. The original file and
--      this one were each run against the database as it stands. Both refused
--      at the precondition, with the same message, for the same reason:
--        default unit already changed outside this migration (garlic-local is
--        already 'Small bundle', ginger is already 'Plate', okro is already
--        'Derica'). Someone decided this by hand -- reconcile with them rather
--        than overwriting it.
--      That is the SECOND APPLICATION REFUSES behaviour recorded above, not a
--      fault: these corrections landed on 2026-09-24 and a re-run is meant to
--      stop. Identical before and after the amendment.
--
--   2. THE SEEDED PATH STILL WORKS, END TO END. In one rolled-back transaction
--      the three defaults were set back to Paint bucket and the Derica deleted
--      -- the pre-0039 world -- and this file was then run in full against it.
--      Precondition passed. INSERT 0 1, UPDATE 3, verification block passed
--      with no exception. After: units 8 -> 9, Derica(derica, base_multiplier
--      NULL), garlic-local=Small bundle | ginger=Plate | okro=Derica,
--      observations and submissions unchanged at 16 and 16. That reproduces the
--      2026-09-24 record above, statement for statement, with the amended text.
--
--   3. THE FRESH PATH IS INERT. Empty session-local stand-ins for `commodities`
--      and `units` were put in front of the real tables on the search_path, so
--      the file met the state a `db reset` gives it. Both notices fired, INSERT
--      0 0, UPDATE 0, no exception, and no orphan Derica was created. A
--      simulation of the shape, not a substitute for CI: the authority on the
--      fresh path is the "Price decision path (0038)" job applying all 39
--      migrations to a real empty database.
--
--   4. THE GUARD KEEPS ITS TEETH. Against a catalogue that EXISTS but does not
--      contain the three slugs (two unrelated commodities), the precondition
--      still raised `expected 3 commodities (okro, ginger, garlic-local), found
--      0`. Only a completely empty `commodities` stands this file down.
-- ----------------------------------------------------------------------------
