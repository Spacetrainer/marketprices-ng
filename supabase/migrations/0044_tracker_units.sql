-- ============================================================================
-- 0044_tracker_units.sql
--
-- The 36 units the Lagos tracker actually prices in, and one rename.
--
-- SOURCE. data/tracker-map.json, the reviewed mapping from the tracker's
-- "Portion / Unit" column to database units. Every string in that column now
-- resolves to a unit; nothing is left PENDING. The owner ruled on the ones that
-- were ambiguous on 2026-09-30:
--   * the bunch family -- leaves, herbs and stalk bundles take the EXISTING Big
--     bundle / Small bundle; a hand of banana or plantain is a stem of fruit,
--     not a tied bundle, and takes the new Bunch (large) / Bunch (small).
--   * "Per pack" and "Per sachet" are correct as sold, so Pack and Sachet are
--     created with no base_multiplier, exactly like the Derica.
--   * vegetables are never sold by the bag. Leafy wholesale is by number of big
--     bundles, hence the new "5 big bundles" for the Ugu and Bitter Leaf
--     wholesale rows.
--   * cucumber is sold by the sack, not the carton, so the unsized "Per carton"
--     string is gone from the tracker and NO unsized carton unit is created
--     here. Carton (20 kg) and 10 kg carton are sized and real.
--
-- BASE_MULTIPLIER IS OMITTED, not written as NULL. The column has no default,
-- so omitting it stores NULL, and writing it out would read like a value was
-- considered. Null means "not yet weighed" (0036). Nothing may convert across
-- these units until real weights come back from the field.
--
-- ABBREVIATIONS ARE DERIVED, and are the one thing here worth a second read.
-- units.abbreviation is NOT NULL UNIQUE and the tracker carries no
-- abbreviations, so the 36 below are shortened from the unit names in the style
-- of the eighteen already seeded ('bg bundle', 'sm pack', 'tuber md'). They are
-- display shorthand; nothing computes on them. Checked unique against each
-- other and against the existing eighteen.
--
-- THE RENAME: Sack -> Bag (50 kg). The tracker never writes "Sack". It writes
-- "Big bag (50kg)", "Per 50kg bag" and "Per bag (50kg)", all one 50 kg sack.
-- The id is kept, so anything already pointing at it keeps pointing at it; only
-- the display name and abbreviation change. Guarded three ways: it fires only
-- if a row named 'Sack' exists, only if no row is already named 'Bag (50 kg)',
-- and it is a no-op on a fresh database where seed.sql has not run yet.
--
-- FRESH DATABASE AND PRODUCTION. Migrations run before seed.sql on a reset, so
-- on a fresh database this inserts into an empty table and the rename finds
-- nothing to rename -- both correct. seed.sql has been updated to write
-- 'Bag (50 kg)' rather than 'Sack' so the two cannot disagree. On production
-- the insert adds 36 rows and the rename fires once. Re-runnable: ON CONFLICT
-- (name) DO NOTHING plus the guards above.
--
-- IS_ACTIVE. Every unit here is inserted active. The column arrives in 0043;
-- retiring any of these is a later human decision.
-- ============================================================================

begin;

insert into units (name, abbreviation) values
  ('1 kg pack'             , '1kg pack'      ),
  ('10 kg carton'          , 'carton 10kg'   ),
  ('5 big bundles'         , '5 bg bundles'  ),
  ('Bag (100 kg)'          , 'bag 100kg'     ),
  ('Bag (25 kg)'           , 'bag 25kg'      ),
  ('Bag (5 kg)'            , 'bag 5kg'       ),
  ('Bunch (large)'         , 'bunch lg'      ),
  ('Bunch (small)'         , 'bunch sm'      ),
  ('Bundle'                , 'bundle'        ),
  ('Bundle of 10 sticks'   , 'bundle 10'     ),
  ('Carton (20 kg)'        , 'carton 20kg'   ),
  ('Carton of 10'          , 'carton 10'     ),
  ('Cup'                   , 'cup'           ),
  ('Dozen'                 , 'dozen'         ),
  ('Half cow'              , 'half cow'      ),
  ('Half dozen'            , 'half dozen'    ),
  ('Half goat'             , 'half goat'     ),
  ('Half piece'            , 'half piece'    ),
  ('Head (large)'          , 'head lg'       ),
  ('Head (small)'          , 'head sm'       ),
  ('Heap'                  , 'heap'          ),
  ('Mudu'                  , 'mudu'          ),
  ('Pack'                  , 'pack'          ),
  ('Per cob'               , 'cob'           ),
  ('Per finger'            , 'finger'        ),
  ('Per stick'             , 'stick'         ),
  ('Quarter cow'           , 'quarter cow'   ),
  ('Rubber (bowl)'         , 'rubber'        ),
  ('Sachet'                , 'sachet'        ),
  ('Single (large)'        , 'single lg'     ),
  ('Single (small)'        , 'single sm'     ),
  ('Single tuber (large)'  , 'tuber lg'      ),
  ('Single tuber (small)'  , 'tuber sm'      ),
  ('Small basket'          , 'sm basket'     ),
  ('Whole goat'            , 'whole goat'    ),
  ('Wrap'                  , 'wrap'          )
on conflict (name) do nothing;


-- Sack -> Bag (50 kg). Same row, same id, new label.
update units
   set name         = 'Bag (50 kg)',
       abbreviation = 'bag 50kg',
       updated_at   = now()
 where name = 'Sack'
   and not exists (select 1 from units where name = 'Bag (50 kg)');

commit;
