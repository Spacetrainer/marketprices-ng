-- ============================================================================
-- 0040_confirmed_commodities.sql
-- The 65 commodities confirmed on 2026-09-16/17, and the 9 retail units they
-- need.
--
-- WHY. data/marketprices-products.csv carries 261 products in two states: 201
-- marked `Template`, which seed.sql seeded, and 60 marked `Proposed - confirm`,
-- which it deliberately did not. seed.sql's header says why -- a proposed row
-- is a suggestion from the sheet, not a decision -- and leaves gaps in
-- display_order where they belong, "so when they are confirmed they slot back
-- into their original positions without renumbering anything already seeded".
-- This file is that confirmation.
--
-- THE DECISION THIS RECORDS. The 60 proposed rows were reviewed by the project
-- owner on 2026-09-16 and 2026-09-17, in conversation. That review corrected
-- the sheet in ten places, removed one row, added seven that the sheet never
-- had, and deferred one. No file in this repo recorded any of it until this
-- one, which is why the whole decision is written out below rather than
-- summarised.
--
--   60 proposed - 1 removed (Cocoa Fruit) + 7 new - 1 deferred (Crab) = 65
--
-- WHERE THIS DEPARTS FROM THE SHEET, each one an owner decision of
-- 2026-09-16/17 and not a transcription:
--
--   1. Old Yam, New Yam, Water Yam   wholesale  Bundle of 100 tubers -> Bundle
--                                    of 10 tubers. A hundred tubers is not a
--                                    trading unit anybody quotes.
--   2. Sugarcane                     Single (medium) / Big basket -> Per cut /
--                                    Per stick. Cane is sold by the cut piece
--                                    at retail and by the whole stick above it;
--                                    neither is a "medium single".
--   3. Beef (with bone), (boneless)  wholesale  1 kg (abattoir bulk) -> Half
--                                    cow. The real wholesale quantity for beef
--                                    is a side, not a kilogram.
--   4. Ponmo (Cow Skin),             retail  1 kg -> Per piece. Both are sold
--      Cow Leg (Bokoto)              as pieces over the counter, not weighed.
--   5. Turkey (frozen)               renamed  Whole Turkey (frozen), and
--                                    Per bird / Lot of 10 birds -> 1 kg /
--                                    Carton of 5. Frozen turkey is sold by
--                                    weight; the live-bird units were carried
--                                    over from the rows above it in error.
--   6. Titus, Kote, Panla, Sardine,  wholesale  Carton (20 kg) -> 1 kg.
--      Prawns, Shrimp
--   7. Prawns, Shrimp                renamed  Prawns (frozen), Shrimp (frozen),
--                                    matching the four rows beside them.
--   8. Catfish (fresh),              wholesale  1 kg (bulk) -> 1 kg. Same
--      Tilapia (fresh)               measure, one spelling.
--   9. Ram / Mutton                  renamed  Ram/Mutton, no spaces.
--  10. Cocoa Fruit (MP-0069)         REMOVED. Not a food-price commodity for
--                                    this product. Its display_order 69 stays
--                                    a permanent gap, like every other gap in
--                                    this sequence.
--
-- SEVEN ROWS THE SHEET NEVER HAD, all frozen poultry, all confirmed in the same
-- review: Whole Chicken (frozen) and the six cuts. They have no MP-#### number,
-- so they take display_order 262-268, after the sheet's last row. That puts
-- them apart from the rest of Poultry in a global ordering whose only consumer
-- is the sort in scripts/generate-form-options.ts; renumbering the sheet's own
-- rows to interleave them would have been the worse trade.
--
-- CRAB IS DEFERRED, not dropped. The row is confirmed in substance -- Per piece
-- at retail, by the bundle at wholesale -- but its canonical name is undecided
-- ("Crab" or "Crab (fresh)"), and a commodity slug is not a thing to guess and
-- change later: the slug is the unique key and every price ever collected hangs
-- off it. It arrives in its own migration once the name is chosen, together
-- with the `Bundle` unit it needs, which is itself worth a second look sitting
-- beside the existing Big bundle and Small bundle.
--
-- THE FULL LIST, as decided. Retail unit / wholesale unit. The number is
-- display_order, which is the sheet's MP-#### for every row that has one.
--
--   TUBERS (3)
--      43  Old Yam    Single tuber (medium) / Bundle of 10 tubers
--      44  New Yam    Single tuber (medium) / Bundle of 10 tubers
--      45  Water Yam  Single tuber (medium) / Bundle of 10 tubers
--
--   FRUITS (11)
--      59  Watermelon             Single (medium) / Big basket
--      60  Pineapple Local        Single (medium) / Big basket
--      61  Pineapple Cotonou      Single (medium) / Big basket
--      62  Coconut                Single (medium) / Big basket
--      63  Golden Melon           Single (medium) / Big basket
--      64  Pawpaw                 Single (medium) / Big basket
--      65  Sugarcane              Per cut         / Per stick
--      66  Kiwano Horned Melon    Single (medium) / Big basket
--      67  Bread Fruit            Single (medium) / Big basket
--      68  Custard Apple/Soursop  Single (medium) / Big basket
--      70  Plum                   Single (medium) / Big basket
--
--   OILS (6)
--     217  Palm Oil       1 litre bottle / 25-litre keg
--     218  Groundnut Oil  1 litre bottle / 25-litre keg
--     219  Vegetable Oil  1 litre bottle / 25-litre keg
--     220  Coconut Oil    1 litre bottle / 25-litre keg
--     221  Soya Oil       1 litre bottle / 25-litre keg
--     222  Chilli Oil     1 litre bottle / 25-litre keg
--
--   MEAT (12)
--     223  Beef (with bone)  1 kg      / Half cow
--     224  Beef (boneless)   1 kg      / Half cow
--     225  Cow Leg (Bokoto)  Per piece / 1 kg abattoir bulk
--     226  Shaki (Tripe)     1 kg      / 1 kg abattoir bulk
--     227  Ponmo (Cow Skin)  Per piece / 1 kg abattoir bulk
--     228  Cow Liver         1 kg      / 1 kg abattoir bulk
--     229  Cow Kidney        1 kg      / 1 kg abattoir bulk
--     230  Cow Tail          1 kg      / 1 kg abattoir bulk
--     231  Goat Meat         1 kg      / 1 kg abattoir bulk
--     232  Ram/Mutton        1 kg      / 1 kg abattoir bulk
--     233  Pork              1 kg      / 1 kg abattoir bulk
--     234  Assorted Offal    1 kg      / 1 kg abattoir bulk
--
--   POULTRY (16)
--     235  Broiler Chicken (live)        Per bird / Lot of 10 birds
--     236  Broiler Chicken (dressed)     Per bird / Lot of 10 birds
--     237  Old Layer                     Per bird / Lot of 10 birds
--     238  Cockerel                      Per bird / Lot of 10 birds
--     239  Local Chicken                 Per bird / Lot of 10 birds
--     240  Turkey (live)                 Per bird / Lot of 10 birds
--     241  Whole Turkey (frozen)         1 kg     / Carton of 5
--     242  Duck                          Per bird / Lot of 10 birds
--     243  Guinea Fowl                   Per bird / Lot of 10 birds
--     262  Whole Chicken (frozen)        1 kg     / Carton of 10
--     263  Chicken Laps/Thighs (frozen)  1 kg     / 10 kg carton
--     264  Chicken Wings (frozen)        1 kg     / 10 kg carton
--     265  Chicken Breast (frozen)       1 kg     / 10 kg carton
--     266  Turkey Laps/Thighs (frozen)   1 kg     / 10 kg carton
--     267  Turkey Wings (frozen)         1 kg     / 10 kg carton
--     268  Turkey Breast (frozen)        1 kg     / 10 kg carton
--
--   EGGS (2)
--     244  Chicken Eggs  Crate of 30 / Pack of 12 crates
--     245  Quail Eggs    Pack of 20  / Carton of 50 packs
--
--   FISH & SEAFOOD (15)
--     246  Titus (Mackerel, frozen)  1 kg         / 1 kg
--     247  Kote (Croaker, frozen)    1 kg         / 1 kg
--     248  Panla (Hake, frozen)      1 kg         / 1 kg
--     249  Sardine (frozen)          1 kg         / 1 kg
--     250  Prawns (frozen)           1 kg         / 1 kg
--     251  Shrimp (frozen)           1 kg         / 1 kg
--     253  Catfish (fresh)           1 kg         / 1 kg
--     254  Tilapia (fresh)           1 kg         / 1 kg
--     255  Dried Fish (Eja Gbigbe)   Paint bucket / Sack
--     256  Stockfish Head            Paint bucket / Sack
--     257  Stockfish Body            Paint bucket / Sack
--     258  Crayfish                  Paint bucket / Sack
--     259  Periwinkle                Paint bucket / Sack
--     260  Snails (Big)              Per piece    / Bag of 100
--     261  Snails (Medium)           Per piece    / Bag of 100
--
-- ONLY THE RETAIL UNITS ARE CREATED HERE. commodities.default_unit_id is one
-- column and 0039 settled what it means: it is the RETAIL unit. The wholesale
-- side of every pairing above has nowhere in the schema to live -- the
-- tier-specific unit lives on price_submissions and price_observations, next to
-- their `tier` column -- so the pairings are recorded here, in full, and that
-- record is the only place the corrected wholesale side exists for these rows.
-- data/marketprices-products.csv still reads Carton (20 kg) and Bundle of 100
-- tubers, because it is the received document and is never edited.
--
-- THE WHOLESALE-ONLY UNITS ARE DELIBERATELY NOT CREATED. Twelve names appear on
-- the wholesale side and nowhere else: Bundle of 10 tubers, Per stick, 25-litre
-- keg, Half cow, Lot of 10 birds, Carton of 5, Carton of 10, 10 kg carton, Pack
-- of 12 crates, Carton of 50 packs, Bag of 100, and the deferred Bundle.
-- scripts/generate-form-options.ts reads `units` with NO filter -- the table has
-- no is_active column and, as that script says, a unit cannot be retired once
-- it exists -- so every unit created here goes straight into the dropdown a
-- collector sees. None of the 65 rows below is tracked, so none of them can be
-- priced yet, and twelve units that nothing references would be twelve wrong
-- answers offered to someone pricing ugwu leaf. They arrive when there is a
-- wholesale price to record in them, or when `units` gains a way to be filtered.
-- This is the same rule seed.sql already followed when it seeded 9 of the
-- sheet's 25 units rather than all of them.
--
-- WHAT EVERY ROW GETS, and why:
--   is_tracked  false, all 65. Tracking is an editorial decision made per
--               commodity; seed.sql writes false for all 201 and the 17 that
--               are tracked today were turned on by hand afterwards. A row
--               that is not tracked cannot reach data/form-options.json, which
--               filters on is_tracked.
--   commodity_group  omitted, so NULL. 0037 removed the NOT NULL because the
--               product list supplies one taxonomy axis and the schema wants
--               two, and ruled out copying `category` across as an assertion
--               that the two are identical. All 201 existing rows are NULL.
--   base_multiplier  omitted on all 9 units, so NULL. Nobody has weighed a
--               paint bucket, a derica, a bird or a cut of sugarcane, and 0036
--               made null mean "not yet weighed" rather than 1 (P0.2).
--   aliases, icon, seasonality_profile, site_offset_pct  all defaults.
--   Units are joined by name, so no UUID is hardcoded -- seed.sql's rule.
--
-- FIVE NEW CATEGORIES arrive with these rows: Oils, Meat, Poultry, Eggs and
-- Fish & Seafood. Tubers and Fruits already exist. The spellings are the
-- sheet's own `category` column, not new coinages. Nothing in app/, lib/ or
-- components/ reads `category` today.
--
-- THIS FILE IS ORDER-INDEPENDENT, which is the lesson of 0039. That migration
-- corrected rows seed.sql creates, so on a fresh database -- where migrations
-- run first and seed.sql second -- it ran before its subject existed and died.
-- This one only ADDS rows, and it asserts nothing about rows it does not name:
--   - no precondition on the catalogue being seeded. An empty `commodities` is
--     a normal, correct run.
--   - no table totals anywhere. `count(*) from units` is 30 on production after
--     this and 9 on a fresh database before seed.sql -- both correct, so
--     neither is worth asserting.
--   - the verification block checks exactly the 10 units and 65 slugs below.
--   - it ENSURES Paint bucket rather than assuming it. Five of the fish rows
--     default to that unit, and it already exists on production -- but not on a
--     fresh database at the moment this file runs, because seed.sql has not
--     loaded yet. Left as an assumption, the inner join below would have
--     dropped those five rows silently on every fresh database; caught by the
--     verification block, which named all five. It is inserted with ON CONFLICT
--     DO NOTHING, so it is inert on production, and it is listed apart from the
--     nine NEW units because it is not new -- see the price guard at the foot.
-- supabase/seed.sql carries the same 9 units and 65 rows, so a fresh database
-- is born with them and this file is inert there. Both sides use ON CONFLICT DO
-- NOTHING against the natural key, and the slug and name sets are disjoint from
-- everything already seeded -- verified against production, no collisions.
--
-- WHAT THIS DOES NOT DO. It changes no schema: no column, constraint, policy or
-- type. types/database.ts is unaffected. It writes no price and touches no
-- existing row -- the guard at the foot proves no price row references any unit
-- created here, because a unit created today cannot be the unit a past price
-- was collected in (P1, append-only). It does not regenerate
-- data/form-options.json: that file is produced from the live database by
-- `pnpm gen:form-options` and must be regenerated AFTER this is applied.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- units -- the 10 retail units these rows need: 9 new, plus Paint bucket.
--
-- PAINT BUCKET IS NOT NEW and is here anyway. Dried Fish, both Stockfish rows,
-- Crayfish and Periwinkle default to it. On production it has existed since
-- seed.sql and this insert does nothing; on a FRESH database, where migrations
-- run before seed.sql, it does not exist yet and the join below would quietly
-- match nothing for those five rows. Ensuring it costs one inert statement on
-- production and is the difference between 65 rows and 60 on a fresh one.
-- Its abbreviation must stay in step with seed.sql, which is what the
-- verification block checks.
--
-- Abbreviations are display shorthand and nothing computes on them; they follow
-- the lowercase style of the nine already seeded.
-- ----------------------------------------------------------------------------

insert into units (name, abbreviation)
values
  ('1 kg'                 , 'kg'),
  ('1 litre bottle'       , '1 litre'),
  ('Crate of 30'          , 'crate 30'),
  ('Pack of 20'           , 'pack 20'),
  ('Paint bucket'         , 'bucket'),
  ('Per bird'             , 'bird'),
  ('Per cut'              , 'cut'),
  ('Per piece'            , 'piece'),
  ('Single (medium)'      , 'single md'),
  ('Single tuber (medium)', 'tuber md')
on conflict (name) do nothing;

-- ----------------------------------------------------------------------------
-- commodities -- the 65 confirmed rows.
-- ----------------------------------------------------------------------------

insert into commodities
  (slug, canonical_name, category, default_unit_id, display_order, is_tracked)
select
  v.slug, v.canonical_name, v.category, u.id, v.display_order, false
from (values
  ('old-yam'                   , 'Old Yam'                     , 'Tubers'        , 'Single tuber (medium)',  43),
  ('new-yam'                   , 'New Yam'                     , 'Tubers'        , 'Single tuber (medium)',  44),
  ('water-yam'                 , 'Water Yam'                   , 'Tubers'        , 'Single tuber (medium)',  45),
  ('watermelon'                , 'Watermelon'                  , 'Fruits'        , 'Single (medium)'      ,  59),
  ('pineapple-local'           , 'Pineapple Local'             , 'Fruits'        , 'Single (medium)'      ,  60),
  ('pineapple-cotonou'         , 'Pineapple Cotonou'           , 'Fruits'        , 'Single (medium)'      ,  61),
  ('coconut'                   , 'Coconut'                     , 'Fruits'        , 'Single (medium)'      ,  62),
  ('golden-melon'              , 'Golden Melon'                , 'Fruits'        , 'Single (medium)'      ,  63),
  ('pawpaw'                    , 'Pawpaw'                      , 'Fruits'        , 'Single (medium)'      ,  64),
  ('sugarcane'                 , 'Sugarcane'                   , 'Fruits'        , 'Per cut'              ,  65),
  ('kiwano-horned-melon'       , 'Kiwano Horned Melon'         , 'Fruits'        , 'Single (medium)'      ,  66),
  ('bread-fruit'               , 'Bread Fruit'                 , 'Fruits'        , 'Single (medium)'      ,  67),
  ('custard-apple-soursop'     , 'Custard Apple/Soursop'       , 'Fruits'        , 'Single (medium)'      ,  68),
  ('plum'                      , 'Plum'                        , 'Fruits'        , 'Single (medium)'      ,  70),
  ('palm-oil'                  , 'Palm Oil'                    , 'Oils'          , '1 litre bottle'       , 217),
  ('groundnut-oil'             , 'Groundnut Oil'               , 'Oils'          , '1 litre bottle'       , 218),
  ('vegetable-oil'             , 'Vegetable Oil'               , 'Oils'          , '1 litre bottle'       , 219),
  ('coconut-oil'               , 'Coconut Oil'                 , 'Oils'          , '1 litre bottle'       , 220),
  ('soya-oil'                  , 'Soya Oil'                    , 'Oils'          , '1 litre bottle'       , 221),
  ('chilli-oil'                , 'Chilli Oil'                  , 'Oils'          , '1 litre bottle'       , 222),
  ('beef-with-bone'            , 'Beef (with bone)'            , 'Meat'          , '1 kg'                 , 223),
  ('beef-boneless'             , 'Beef (boneless)'             , 'Meat'          , '1 kg'                 , 224),
  ('cow-leg-bokoto'            , 'Cow Leg (Bokoto)'            , 'Meat'          , 'Per piece'            , 225),
  ('shaki-tripe'               , 'Shaki (Tripe)'               , 'Meat'          , '1 kg'                 , 226),
  ('ponmo-cow-skin'            , 'Ponmo (Cow Skin)'            , 'Meat'          , 'Per piece'            , 227),
  ('cow-liver'                 , 'Cow Liver'                   , 'Meat'          , '1 kg'                 , 228),
  ('cow-kidney'                , 'Cow Kidney'                  , 'Meat'          , '1 kg'                 , 229),
  ('cow-tail'                  , 'Cow Tail'                    , 'Meat'          , '1 kg'                 , 230),
  ('goat-meat'                 , 'Goat Meat'                   , 'Meat'          , '1 kg'                 , 231),
  ('ram-mutton'                , 'Ram/Mutton'                  , 'Meat'          , '1 kg'                 , 232),
  ('pork'                      , 'Pork'                        , 'Meat'          , '1 kg'                 , 233),
  ('assorted-offal'            , 'Assorted Offal'              , 'Meat'          , '1 kg'                 , 234),
  ('broiler-chicken-live'      , 'Broiler Chicken (live)'      , 'Poultry'       , 'Per bird'             , 235),
  ('broiler-chicken-dressed'   , 'Broiler Chicken (dressed)'   , 'Poultry'       , 'Per bird'             , 236),
  ('old-layer'                 , 'Old Layer'                   , 'Poultry'       , 'Per bird'             , 237),
  ('cockerel'                  , 'Cockerel'                    , 'Poultry'       , 'Per bird'             , 238),
  ('local-chicken'             , 'Local Chicken'               , 'Poultry'       , 'Per bird'             , 239),
  ('turkey-live'               , 'Turkey (live)'               , 'Poultry'       , 'Per bird'             , 240),
  ('whole-turkey-frozen'       , 'Whole Turkey (frozen)'       , 'Poultry'       , '1 kg'                 , 241),
  ('duck'                      , 'Duck'                        , 'Poultry'       , 'Per bird'             , 242),
  ('guinea-fowl'               , 'Guinea Fowl'                 , 'Poultry'       , 'Per bird'             , 243),
  ('chicken-eggs'              , 'Chicken Eggs'                , 'Eggs'          , 'Crate of 30'          , 244),
  ('quail-eggs'                , 'Quail Eggs'                  , 'Eggs'          , 'Pack of 20'           , 245),
  ('titus-mackerel-frozen'     , 'Titus (Mackerel, frozen)'    , 'Fish & Seafood', '1 kg'                 , 246),
  ('kote-croaker-frozen'       , 'Kote (Croaker, frozen)'      , 'Fish & Seafood', '1 kg'                 , 247),
  ('panla-hake-frozen'         , 'Panla (Hake, frozen)'        , 'Fish & Seafood', '1 kg'                 , 248),
  ('sardine-frozen'            , 'Sardine (frozen)'            , 'Fish & Seafood', '1 kg'                 , 249),
  ('prawns-frozen'             , 'Prawns (frozen)'             , 'Fish & Seafood', '1 kg'                 , 250),
  ('shrimp-frozen'             , 'Shrimp (frozen)'             , 'Fish & Seafood', '1 kg'                 , 251),
  ('catfish-fresh'             , 'Catfish (fresh)'             , 'Fish & Seafood', '1 kg'                 , 253),
  ('tilapia-fresh'             , 'Tilapia (fresh)'             , 'Fish & Seafood', '1 kg'                 , 254),
  ('dried-fish-eja-gbigbe'     , 'Dried Fish (Eja Gbigbe)'     , 'Fish & Seafood', 'Paint bucket'         , 255),
  ('stockfish-head'            , 'Stockfish Head'              , 'Fish & Seafood', 'Paint bucket'         , 256),
  ('stockfish-body'            , 'Stockfish Body'              , 'Fish & Seafood', 'Paint bucket'         , 257),
  ('crayfish'                  , 'Crayfish'                    , 'Fish & Seafood', 'Paint bucket'         , 258),
  ('periwinkle'                , 'Periwinkle'                  , 'Fish & Seafood', 'Paint bucket'         , 259),
  ('snails-big'                , 'Snails (Big)'                , 'Fish & Seafood', 'Per piece'            , 260),
  ('snails-medium'             , 'Snails (Medium)'             , 'Fish & Seafood', 'Per piece'            , 261),
  ('whole-chicken-frozen'      , 'Whole Chicken (frozen)'      , 'Poultry'       , '1 kg'                 , 262),
  ('chicken-laps-thighs-frozen', 'Chicken Laps/Thighs (frozen)', 'Poultry'       , '1 kg'                 , 263),
  ('chicken-wings-frozen'      , 'Chicken Wings (frozen)'      , 'Poultry'       , '1 kg'                 , 264),
  ('chicken-breast-frozen'     , 'Chicken Breast (frozen)'     , 'Poultry'       , '1 kg'                 , 265),
  ('turkey-laps-thighs-frozen' , 'Turkey Laps/Thighs (frozen)' , 'Poultry'       , '1 kg'                 , 266),
  ('turkey-wings-frozen'       , 'Turkey Wings (frozen)'       , 'Poultry'       , '1 kg'                 , 267),
  ('turkey-breast-frozen'      , 'Turkey Breast (frozen)'      , 'Poultry'       , '1 kg'                 , 268)
    ) as v (slug, canonical_name, category, retail_unit, display_order)
join units u on u.name = v.retail_unit
on conflict (slug) do nothing;

-- ----------------------------------------------------------------------------
-- Verification, in the file so it runs on every environment rather than only on
-- the one this was drafted against.
--
-- Everything below is scoped to the rows this file names. Nothing counts a
-- whole table, and nothing assumes seed.sql has run -- see ORDER-INDEPENDENT in
-- the header.
-- ----------------------------------------------------------------------------

do $$
declare
  v_problem   text;
  v_price_use int;
begin
  -- The 10 units these rows need: present, with the abbreviation stated above,
  -- and with no invented weight. Paint bucket is included because a fresh
  -- database only has it if this file put it there.
  select string_agg(msg, E'\n  ' order by msg) into v_problem
    from (
      select case
               when u.name is null then format('unit %L is missing', want.name)
               when u.abbreviation <> want.abbreviation
                 then format('unit %L has abbreviation %L, not %L', want.name, u.abbreviation, want.abbreviation)
               else format('unit %L has base_multiplier %s; null means not yet weighed and must not be invented (0036, P0.2)', want.name, u.base_multiplier)
             end as msg
        from (values
           ('1 kg'                 , 'kg'),
           ('1 litre bottle'       , '1 litre'),
           ('Crate of 30'          , 'crate 30'),
           ('Pack of 20'           , 'pack 20'),
           ('Paint bucket'         , 'bucket'),
           ('Per bird'             , 'bird'),
           ('Per cut'              , 'cut'),
           ('Per piece'            , 'piece'),
           ('Single (medium)'      , 'single md'),
           ('Single tuber (medium)', 'tuber md')
             ) as want (name, abbreviation)
        left join units u on u.name = want.name
       where u.name is null
          or u.abbreviation <> want.abbreviation
          or u.base_multiplier is not null
    ) as bad;

  if v_problem is not null then
    raise exception E'the units this migration creates are not as declared:\n  %', v_problem;
  end if;

  -- The 65 commodities: present, with the stated name, category and RETAIL
  -- default unit, untracked, and with no coarse group invented for them.
  select string_agg(msg, E'\n  ' order by msg) into v_problem
    from (
      select case
               when c.slug is null then format('commodity %L is missing', want.slug)
               when c.canonical_name <> want.canonical_name
                 then format('%L is named %L, not %L', want.slug, c.canonical_name, want.canonical_name)
               when c.category <> want.category
                 then format('%L is in category %L, not %L', want.slug, c.category, want.category)
               when u.name is distinct from want.retail_unit
                 then format('%L defaults to %L, not %L', want.slug, u.name, want.retail_unit)
               when c.is_tracked
                 then format('%L is tracked; every row here arrives untracked and tracking is decided per commodity', want.slug)
               else format('%L has commodity_group %L; it must be null (0037)', want.slug, c.commodity_group)
             end as msg
        from (values
           ('old-yam'                   , 'Old Yam'                     , 'Tubers'        , 'Single tuber (medium)'),
           ('new-yam'                   , 'New Yam'                     , 'Tubers'        , 'Single tuber (medium)'),
           ('water-yam'                 , 'Water Yam'                   , 'Tubers'        , 'Single tuber (medium)'),
           ('watermelon'                , 'Watermelon'                  , 'Fruits'        , 'Single (medium)'),
           ('pineapple-local'           , 'Pineapple Local'             , 'Fruits'        , 'Single (medium)'),
           ('pineapple-cotonou'         , 'Pineapple Cotonou'           , 'Fruits'        , 'Single (medium)'),
           ('coconut'                   , 'Coconut'                     , 'Fruits'        , 'Single (medium)'),
           ('golden-melon'              , 'Golden Melon'                , 'Fruits'        , 'Single (medium)'),
           ('pawpaw'                    , 'Pawpaw'                      , 'Fruits'        , 'Single (medium)'),
           ('sugarcane'                 , 'Sugarcane'                   , 'Fruits'        , 'Per cut'),
           ('kiwano-horned-melon'       , 'Kiwano Horned Melon'         , 'Fruits'        , 'Single (medium)'),
           ('bread-fruit'               , 'Bread Fruit'                 , 'Fruits'        , 'Single (medium)'),
           ('custard-apple-soursop'     , 'Custard Apple/Soursop'       , 'Fruits'        , 'Single (medium)'),
           ('plum'                      , 'Plum'                        , 'Fruits'        , 'Single (medium)'),
           ('palm-oil'                  , 'Palm Oil'                    , 'Oils'          , '1 litre bottle'),
           ('groundnut-oil'             , 'Groundnut Oil'               , 'Oils'          , '1 litre bottle'),
           ('vegetable-oil'             , 'Vegetable Oil'               , 'Oils'          , '1 litre bottle'),
           ('coconut-oil'               , 'Coconut Oil'                 , 'Oils'          , '1 litre bottle'),
           ('soya-oil'                  , 'Soya Oil'                    , 'Oils'          , '1 litre bottle'),
           ('chilli-oil'                , 'Chilli Oil'                  , 'Oils'          , '1 litre bottle'),
           ('beef-with-bone'            , 'Beef (with bone)'            , 'Meat'          , '1 kg'),
           ('beef-boneless'             , 'Beef (boneless)'             , 'Meat'          , '1 kg'),
           ('cow-leg-bokoto'            , 'Cow Leg (Bokoto)'            , 'Meat'          , 'Per piece'),
           ('shaki-tripe'               , 'Shaki (Tripe)'               , 'Meat'          , '1 kg'),
           ('ponmo-cow-skin'            , 'Ponmo (Cow Skin)'            , 'Meat'          , 'Per piece'),
           ('cow-liver'                 , 'Cow Liver'                   , 'Meat'          , '1 kg'),
           ('cow-kidney'                , 'Cow Kidney'                  , 'Meat'          , '1 kg'),
           ('cow-tail'                  , 'Cow Tail'                    , 'Meat'          , '1 kg'),
           ('goat-meat'                 , 'Goat Meat'                   , 'Meat'          , '1 kg'),
           ('ram-mutton'                , 'Ram/Mutton'                  , 'Meat'          , '1 kg'),
           ('pork'                      , 'Pork'                        , 'Meat'          , '1 kg'),
           ('assorted-offal'            , 'Assorted Offal'              , 'Meat'          , '1 kg'),
           ('broiler-chicken-live'      , 'Broiler Chicken (live)'      , 'Poultry'       , 'Per bird'),
           ('broiler-chicken-dressed'   , 'Broiler Chicken (dressed)'   , 'Poultry'       , 'Per bird'),
           ('old-layer'                 , 'Old Layer'                   , 'Poultry'       , 'Per bird'),
           ('cockerel'                  , 'Cockerel'                    , 'Poultry'       , 'Per bird'),
           ('local-chicken'             , 'Local Chicken'               , 'Poultry'       , 'Per bird'),
           ('turkey-live'               , 'Turkey (live)'               , 'Poultry'       , 'Per bird'),
           ('whole-turkey-frozen'       , 'Whole Turkey (frozen)'       , 'Poultry'       , '1 kg'),
           ('duck'                      , 'Duck'                        , 'Poultry'       , 'Per bird'),
           ('guinea-fowl'               , 'Guinea Fowl'                 , 'Poultry'       , 'Per bird'),
           ('chicken-eggs'              , 'Chicken Eggs'                , 'Eggs'          , 'Crate of 30'),
           ('quail-eggs'                , 'Quail Eggs'                  , 'Eggs'          , 'Pack of 20'),
           ('titus-mackerel-frozen'     , 'Titus (Mackerel, frozen)'    , 'Fish & Seafood', '1 kg'),
           ('kote-croaker-frozen'       , 'Kote (Croaker, frozen)'      , 'Fish & Seafood', '1 kg'),
           ('panla-hake-frozen'         , 'Panla (Hake, frozen)'        , 'Fish & Seafood', '1 kg'),
           ('sardine-frozen'            , 'Sardine (frozen)'            , 'Fish & Seafood', '1 kg'),
           ('prawns-frozen'             , 'Prawns (frozen)'             , 'Fish & Seafood', '1 kg'),
           ('shrimp-frozen'             , 'Shrimp (frozen)'             , 'Fish & Seafood', '1 kg'),
           ('catfish-fresh'             , 'Catfish (fresh)'             , 'Fish & Seafood', '1 kg'),
           ('tilapia-fresh'             , 'Tilapia (fresh)'             , 'Fish & Seafood', '1 kg'),
           ('dried-fish-eja-gbigbe'     , 'Dried Fish (Eja Gbigbe)'     , 'Fish & Seafood', 'Paint bucket'),
           ('stockfish-head'            , 'Stockfish Head'              , 'Fish & Seafood', 'Paint bucket'),
           ('stockfish-body'            , 'Stockfish Body'              , 'Fish & Seafood', 'Paint bucket'),
           ('crayfish'                  , 'Crayfish'                    , 'Fish & Seafood', 'Paint bucket'),
           ('periwinkle'                , 'Periwinkle'                  , 'Fish & Seafood', 'Paint bucket'),
           ('snails-big'                , 'Snails (Big)'                , 'Fish & Seafood', 'Per piece'),
           ('snails-medium'             , 'Snails (Medium)'             , 'Fish & Seafood', 'Per piece'),
           ('whole-chicken-frozen'      , 'Whole Chicken (frozen)'      , 'Poultry'       , '1 kg'),
           ('chicken-laps-thighs-frozen', 'Chicken Laps/Thighs (frozen)', 'Poultry'       , '1 kg'),
           ('chicken-wings-frozen'      , 'Chicken Wings (frozen)'      , 'Poultry'       , '1 kg'),
           ('chicken-breast-frozen'     , 'Chicken Breast (frozen)'     , 'Poultry'       , '1 kg'),
           ('turkey-laps-thighs-frozen' , 'Turkey Laps/Thighs (frozen)' , 'Poultry'       , '1 kg'),
           ('turkey-wings-frozen'       , 'Turkey Wings (frozen)'       , 'Poultry'       , '1 kg'),
           ('turkey-breast-frozen'      , 'Turkey Breast (frozen)'      , 'Poultry'       , '1 kg')
             ) as want (slug, canonical_name, category, retail_unit)
        left join commodities c on c.slug = want.slug
        left join units u on u.id = c.default_unit_id
       where c.slug is null
          or c.canonical_name <> want.canonical_name
          or c.category <> want.category
          or u.name is distinct from want.retail_unit
          or c.is_tracked
          or c.commodity_group is not null
    ) as bad;

  if v_problem is not null then
    raise exception E'the commodities this migration creates are not as declared:\n  %', v_problem;
  end if;

  -- No price row may reference a unit CREATED here. This file adds reference
  -- data; a unit that did not exist until today cannot be the unit a past price
  -- was collected in (P1, append-only). The nine new names only -- Paint bucket
  -- is ensured above, not created, and carries 13 published observations.
  select (select count(*)
            from price_observations o
            join units u on u.id = o.unit_id
           where u.name in ('1 kg','1 litre bottle','Crate of 30','Pack of 20','Per bird','Per cut','Per piece','Single (medium)','Single tuber (medium)'))
       + (select count(*)
            from price_submissions s
            join units u on u.id = s.unit_id
           where u.name in ('1 kg','1 litre bottle','Crate of 30','Pack of 20','Per bird','Per cut','Per piece','Single (medium)','Single tuber (medium)'))
    into v_price_use;

  if v_price_use <> 0 then
    raise exception
      'the units created here already appear on % price rows. A unit created in this migration cannot be the unit a past price was collected in.',
      v_price_use;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- VERIFIED 2026-09-25 against marketprices-rebuild, and against the shape of a
-- fresh database, both inside transactions that were rolled back. Production
-- confirmed untouched afterwards on a fresh connection.
--
--   PRODUCTION (201 commodities, 9 units, 16 published prices)
--     INSERT 0 9  units -- ten offered, Paint bucket already there and inert
--     INSERT 0 65 commodities
--     verification passed
--     units        9 -> 18       commodities  201 -> 266
--     tracked      17 -> 17      commodity_group not null  0 -> 0
--     observations 16 -> 16      submissions  16 -> 16
--     categories   16 -> 21: Eggs 2, Fish & Seafood 15, Meat 12, Oils 6,
--                  Poultry 16 arrive; Fruits 35 -> 46; Tubers 5 -> 8
--     retail units across the 65: 1 kg 26, Single (medium) 10, Per bird 8,
--                  1 litre bottle 6, Paint bucket 5, Per piece 4,
--                  Single tuber (medium) 3, Crate of 30 1, Pack of 20 1,
--                  Per cut 1
--     all nine new units created with base_multiplier NULL
--
--   FRESH-DATABASE SHAPE (empty stand-ins for `units` and `commodities`, put in
--   front of the real tables on the search_path -- a simulation of the shape,
--   not a substitute for the CI job that applies every migration to a real
--   empty Postgres)
--     INSERT 0 10 units -- including Paint bucket, which is why this works
--     INSERT 0 65 commodities
--     verification passed; 65 rows, 10 units, 0 tracked, 0 with a group
--
--   MIGRATION THEN SEED, END TO END, on the same empty stand-ins -- the order a
--   fresh database actually uses:
--     0040        INSERT 0 10 units, INSERT 0 65 commodities, verified
--     seed.sql    INSERT 0 8 units, INSERT 0 201 commodities -- the rest
--     end state   18 units, 266 commodities, 0 tracked, 0 with a
--                 commodity_group, 0 with a base_multiplier
--     all 65 rows from 0040 still read exactly what 0040 declared: neither
--     file's ON CONFLICT DO NOTHING swallowed a disagreement, because there is
--     none. The 9 units and 65 rows are byte-identical in both files, compared
--     field by field rather than by eye.
--
-- THE FIRST DRAFT OF THIS FILE FAILED THAT SECOND CHECK, and the failure is
-- worth keeping on the record. It assumed Paint bucket existed, as it does on
-- production. On the empty catalogue the inner join matched nothing for the
-- five fish rows that default to it, so 60 rows landed instead of 65 -- and the
-- verification block named all five by slug rather than letting a short
-- catalogue through. That is the 0039 lesson arriving a second time from a new
-- direction: on a fresh database, seed.sql has not run, so nothing it creates
-- can be assumed by a migration.
-- ----------------------------------------------------------------------------
