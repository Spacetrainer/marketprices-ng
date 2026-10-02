-- ============================================================================
-- 0045_tracker_commodities.sql
--
-- The Lagos tracker's catalogue: 77 new commodities, 10 renames, one merge, one
-- row retired, and the tracked set expanded from 17 to 243.
--
-- SOURCE. data/tracker-map.json -- the reviewed mapping from the tracker's
-- 244 (Product, Variety) keys to database commodities, settled with the project
-- owner on 2026-09-30. Every row below traces to a key in that file. Nothing
-- here was invented: where the owner had not decided, the row is not in this
-- migration. Ayoo (confirm species) is the one key still unresolved; it has no
-- slug, it is NOT inserted, and the importer refuses its rows.
--
-- WHY THE SLUG NEVER CHANGES, EVEN WHEN IT IS WRONG. A slug is the unique key
-- every price hangs off. kote-croaker-frozen is the clearest case: the fish is
-- a horse mackerel, not a croaker, and the row is renamed below to
-- "Kote (Horse Mackerel, frozen)" -- but the slug keeps the word "croaker"
-- forever. Croaker now gets its own fresh and frozen rows, so leaving the
-- misnomer in the DISPLAY name would put two different fish under one label;
-- changing the SLUG would break the series key that its already-published
-- observations hang off. The name is corrected, the key is not. Same rule for
-- garri-white (now "White Garri (Ijebu)"), tatase-bell-pepper (now
-- "Tatashe (Red Pepper)" -- it is a long red pepper, never a bell pepper) and
-- sweet-potatoes (now "White Sweet Potato", with the orange- and purple-flesh
-- rows arriving as their own commodities below).
--
-- EVERY RENAME, AND WHY. Old names are never dropped: each goes into aliases,
-- so search and the ingest matcher keep resolving them.
--   * tomato-hausa-yoruba: "Tomato (Hausa/Yoruba)" -> "Tomato (Hausa)"
--     Yoruba tomato becomes its own commodity, so this row is the Hausa
--     tomato alone.
--   * tatase-bell-pepper: "Tatase (Bell Pepper)" -> "Tatashe (Red Pepper)"
--     Tatashe is a long red pepper; the bell-pepper name was wrong and the
--     bell peppers now have their own rows.
--   * garri-white: "Garri White" -> "White Garri (Ijebu)"
--     Matches the tracker row. garri-ijebu is left in place, untracked.
--   * kote-croaker-frozen: "Kote (Croaker, frozen)" -> "Kote (Horse Mackerel, frozen)"
--     Slug unchanged. Croaker gets its own fresh and frozen rows, so the
--     misnomer has to go.
--   * ginger: "Ginger" -> "Fresh Ginger"
--     Dried ginger becomes its own commodity.
--   * sweet-potatoes: "Sweet Potatoes" -> "White Sweet Potato"
--     The unqualified catalogue row is the white sweet potato. Slug
--     unchanged; orange- and purple-flesh sweet potato become their own
--     commodities.
--   * shombo-cayenne-pepper: "Shombo (Cayenne Pepper)" -> "Shombo"
--     There is no green shombo; one commodity named Shombo. Old name goes to
--     aliases.
--   * tete-amaranth-green: "Tete (Amaranth Green)" -> "Efo Tete"
--     One Efo Tete commodity, no red/green split. Slug unchanged; old name
--     goes to aliases.
--   * beans-oloyin: "Beans Oloyin" -> "Beans (Oloyin)"
--     The owner's canonical set is Beans (Drum), Beans (Oloyin), Beans
--     (Oloo). Old name goes to aliases.
--   * beans-oloo: "Beans Oloo" -> "Beans (Oloo)"
--     Same canonical set; also resolves the sheet's 'confirm type' marker.
--     Old name goes to aliases.
--
-- THE MERGE. guinea-corn-flour and sorghum-flour are the same product under two
-- names. Neither row has price history, so sorghum-flour survives, "Guinea Corn
-- Flour" becomes one of its aliases, and guinea-corn-flour is set is_active =
-- false. It is NOT deleted -- a commodity id is referenced by
-- price_observations and a delete would orphan a price. "Merged away" in the
-- counts means deactivated and aliased.
--
-- THE RETIREMENT. yellow-red-pepper is set is_active = false and never reused:
-- red and yellow bell pepper each become their own commodity below, and one row
-- cannot be both. Never deleted, for the same reason as above.
--
-- UNTRACKED, NOT RETIRED. garri-ijebu stays active but is_tracked = false: the
-- tracker's Ijebu garri row maps to garri-white, so garri-ijebu is a duplicate
-- label nobody prices weekly. It keeps its row in case it is wanted later.
--
-- CATEGORY IS DERIVED, AND THIS IS THE PART TO CHECK. The tracker's own
-- Category / Sub-Category columns ("CASSAVA PRODUCTS", "COOKING GREENS") are
-- not the database's 21 categories. Each new commodity therefore takes the
-- category of the EXISTING catalogue rows it sits beside in the tracker,
-- matching on (sheet, category, sub-category, product) first and falling back
-- to (sheet, category, sub-category): 51 rows matched at the tighter key, 26 at
-- the looser one, and none needed a wider fallback. Where the existing siblings
-- disagreed, the tie went to the majority, or to the "Processed ..." category
-- when the variety says dried, ground, powder, sliced, washed or shredded. Two
-- rows were not unanimous and are worth a second read:
--     sweet-basil                    -> Leafy Vegetables              (siblings: Leafy Vegetables x3, Vegetables x1)
--     melon-seed-egusi-unshelled     -> Spices & Seeds                (siblings: Spices & Seeds x1, Processed Spices x1)
--
-- THREE INHERITED ODDITIES, PROPAGATED ON PURPOSE. Because category is
-- inherited, three placements that already look wrong in the catalogue are
-- carried into the new rows rather than quietly corrected:
--     * tomato-cherry, tomato-plum, tomato-roma and tomato-yoruba take
--       'Peppers', because tomato-hausa-yoruba is already 'Peppers' and
--       blended-tomato is already 'Processed Peppers'.
--     * onions-yellow takes 'Spices & Seeds', following onions-red and
--       onions-white.
--     * cucumber-short-local takes 'Fruits', following cucumber.
--   Fixing any of these means moving the EXISTING rows too, which changes what
--   the public category pages show. That is a separate editorial decision and is
--   deliberately not smuggled into this migration.
--
-- DISPLAY_ORDER IS APPENDED, NOT CURATED. New rows take 269.. in category order
-- then alphabetically by slug. That keeps each category's new rows together and
-- touches no existing row's order. Ordering WITHIN a category is an editorial
-- job for later; nothing computes on display_order.
--
-- DEFAULT_UNIT_ID is the commodity's approved PRIMARY RETAIL unit from
-- data/tracker-map.json, joined by unit name so no UUID is baked into this
-- file. The primary/secondary unit ROLE itself is not stored here -- it binds at
-- ingest on price_observations.unit_role (0041) -- but the catalogue's default
-- is the consumer-facing figure, so it is the retail primary. 1 row has no
-- published tier at all (column A blank on every one of its tracker rows), so
-- its default comes from the first portion listed:
--     ugwu-leaf-shredded             default unit Big bundle, from the first portion listed
--
-- TRACKING. is_tracked goes true for the 243 commodities the tracker prices --
-- 77 new plus 166 existing. All 17 rows tracked today are inside that set, so no
-- row loses tracking here except garri-ijebu, handled above. is_tracked = true
-- is an editorial commitment that someone prices this commodity every week;
-- that commitment is exactly what the tracker is.
--
-- NO PRICES. Not one price, date, ISO week or observation appears in this file
-- (P0.1). It is reference data only: slugs, names, categories, unit names,
-- display order and flags.
--
-- FRESH DATABASE AND PRODUCTION. Migrations run before seed.sql on a reset, so
-- on an empty database the inserts create these rows and every update matches
-- nothing -- all guarded by WHERE clauses, none asserting a row count. seed.sql
-- carries the same end state so a fresh database is born correct rather than
-- patched. Re-runnable: ON CONFLICT (slug) DO NOTHING, and every update is
-- idempotent.
--
-- DEPENDS ON 0044 for every unit name joined below, and on 0043 only in spirit.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Renames. Slug unchanged, old name preserved in aliases.
-- ----------------------------------------------------------------------------

-- tomato-hausa-yoruba: Tomato (Hausa/Yoruba) -> Tomato (Hausa)
-- Yoruba tomato becomes its own commodity, so this row is the Hausa tomato
-- alone.
update commodities
   set canonical_name = 'Tomato (Hausa)',
       aliases        = (
         select array_agg(distinct a order by a) from unnest(aliases || array['Tomato (Hausa/Yoruba)']) a
       ),
       updated_at     = now()
 where slug = 'tomato-hausa-yoruba'
   and canonical_name <> 'Tomato (Hausa)';

-- tatase-bell-pepper: Tatase (Bell Pepper) -> Tatashe (Red Pepper)
-- Tatashe is a long red pepper; the bell-pepper name was wrong and the
-- bell peppers now have their own rows.
update commodities
   set canonical_name = 'Tatashe (Red Pepper)',
       aliases        = (
         select array_agg(distinct a order by a) from unnest(aliases || array['Tatase (Bell Pepper)']) a
       ),
       updated_at     = now()
 where slug = 'tatase-bell-pepper'
   and canonical_name <> 'Tatashe (Red Pepper)';

-- garri-white: Garri White -> White Garri (Ijebu)
-- Matches the tracker row. garri-ijebu is left in place, untracked.
update commodities
   set canonical_name = 'White Garri (Ijebu)',
       aliases        = (
         select array_agg(distinct a order by a) from unnest(aliases || array['Garri White']) a
       ),
       updated_at     = now()
 where slug = 'garri-white'
   and canonical_name <> 'White Garri (Ijebu)';

-- kote-croaker-frozen: Kote (Croaker, frozen) -> Kote (Horse Mackerel, frozen)
-- Slug unchanged. Croaker gets its own fresh and frozen rows, so the
-- misnomer has to go.
update commodities
   set canonical_name = 'Kote (Horse Mackerel, frozen)',
       aliases        = (
         select array_agg(distinct a order by a) from unnest(aliases || array['Kote (Croaker, frozen)']) a
       ),
       updated_at     = now()
 where slug = 'kote-croaker-frozen'
   and canonical_name <> 'Kote (Horse Mackerel, frozen)';

-- ginger: Ginger -> Fresh Ginger
-- Dried ginger becomes its own commodity.
update commodities
   set canonical_name = 'Fresh Ginger',
       aliases        = (
         select array_agg(distinct a order by a) from unnest(aliases || array['Ginger']) a
       ),
       updated_at     = now()
 where slug = 'ginger'
   and canonical_name <> 'Fresh Ginger';

-- sweet-potatoes: Sweet Potatoes -> White Sweet Potato
-- The unqualified catalogue row is the white sweet potato. Slug unchanged;
-- orange- and purple-flesh sweet potato become their own commodities.
update commodities
   set canonical_name = 'White Sweet Potato',
       aliases        = (
         select array_agg(distinct a order by a) from unnest(aliases || array['Sweet Potatoes']) a
       ),
       updated_at     = now()
 where slug = 'sweet-potatoes'
   and canonical_name <> 'White Sweet Potato';

-- shombo-cayenne-pepper: Shombo (Cayenne Pepper) -> Shombo
-- There is no green shombo; one commodity named Shombo. Old name goes to
-- aliases.
update commodities
   set canonical_name = 'Shombo',
       aliases        = (
         select array_agg(distinct a order by a) from unnest(aliases || array['Shombo (Cayenne Pepper)']) a
       ),
       updated_at     = now()
 where slug = 'shombo-cayenne-pepper'
   and canonical_name <> 'Shombo';

-- tete-amaranth-green: Tete (Amaranth Green) -> Efo Tete
-- One Efo Tete commodity, no red/green split. Slug unchanged; old name
-- goes to aliases.
update commodities
   set canonical_name = 'Efo Tete',
       aliases        = (
         select array_agg(distinct a order by a) from unnest(aliases || array['Tete (Amaranth Green)']) a
       ),
       updated_at     = now()
 where slug = 'tete-amaranth-green'
   and canonical_name <> 'Efo Tete';

-- beans-oloyin: Beans Oloyin -> Beans (Oloyin)
-- The owner's canonical set is Beans (Drum), Beans (Oloyin), Beans (Oloo).
-- Old name goes to aliases.
update commodities
   set canonical_name = 'Beans (Oloyin)',
       aliases        = (
         select array_agg(distinct a order by a) from unnest(aliases || array['Beans Oloyin']) a
       ),
       updated_at     = now()
 where slug = 'beans-oloyin'
   and canonical_name <> 'Beans (Oloyin)';

-- beans-oloo: Beans Oloo -> Beans (Oloo)
-- Same canonical set; also resolves the sheet's 'confirm type' marker. Old
-- name goes to aliases.
update commodities
   set canonical_name = 'Beans (Oloo)',
       aliases        = (
         select array_agg(distinct a order by a) from unnest(aliases || array['Beans Oloo']) a
       ),
       updated_at     = now()
 where slug = 'beans-oloo'
   and canonical_name <> 'Beans (Oloo)';


-- ----------------------------------------------------------------------------
-- 2. The merge: guinea-corn-flour folded into sorghum-flour.
-- ----------------------------------------------------------------------------

update commodities
   set aliases    = (select array_agg(distinct a order by a) from unnest(aliases || array['Guinea Corn Flour']) a),
       updated_at = now()
 where slug = 'sorghum-flour'
   and not ('Guinea Corn Flour' = any (aliases));

update commodities
   set is_active  = false,
       is_tracked = false,
       updated_at = now()
 where slug = 'guinea-corn-flour'
   and is_active;


-- ----------------------------------------------------------------------------
-- 3. Retire yellow-red-pepper. Never deleted, never reused.
-- ----------------------------------------------------------------------------

update commodities
   set is_active  = false,
       is_tracked = false,
       updated_at = now()
 where slug = 'yellow-red-pepper'
   and is_active;


-- ----------------------------------------------------------------------------
-- 4. The 77 new commodities.
--
--    Units are joined by name, so no UUID is hardcoded here. The join is inner:
--    if 0044 has not run, this inserts nothing rather than inserting a row with
--    the wrong unit.
-- ----------------------------------------------------------------------------

insert into commodities
  (slug, canonical_name, category, default_unit_id, display_order, is_tracked, is_active)
select v.slug, v.canonical_name, v.category, u.id, v.display_order, true, true
from (values
  ('dried-atama-leaves'        , 'Dried Atama Leaves'                   , 'Leafy Vegetables', 'Pack'                ,  269),
  ('ewuro-bitter-leaf-washed'  , 'Ewuro (Bitter Leaf) Washed'           , 'Leafy Vegetables', 'Big bundle'          ,  270),
  ('okazi-leaf-sliced'         , 'Okazi Leaf Sliced'                    , 'Leafy Vegetables', 'Big bundle'          ,  271),
  ('sweet-basil'               , 'Sweet Basil'                          , 'Leafy Vegetables', 'Big bundle'          ,  272),
  ('ugwu-leaf-shredded'        , 'Ugwu Leaf Shredded'                   , 'Leafy Vegetables', 'Big bundle'          ,  273),
  ('black-pepper-powder'       , 'Black Pepper Powder'                  , 'Peppers'         , 'Pack'                ,  274),
  ('red-pepper-bell'           , 'Red Pepper (Bell)'                    , 'Peppers'         , 'Per piece'           ,  275),
  ('rodo-mild'                 , 'Rodo Mild'                            , 'Peppers'         , 'Paint bucket'        ,  276),
  ('rodo-yellow'               , 'Rodo Yellow'                          , 'Peppers'         , 'Paint bucket'        ,  277),
  ('tomato-cherry'             , 'Tomato Cherry'                        , 'Peppers'         , 'Small basket'        ,  278),
  ('tomato-plum'               , 'Tomato Plum'                          , 'Peppers'         , 'Small basket'        ,  279),
  ('tomato-roma'               , 'Tomato Roma'                          , 'Peppers'         , 'Small basket'        ,  280),
  ('tomato-yoruba'             , 'Tomato (Yoruba)'                      , 'Peppers'         , 'Small basket'        ,  281),
  ('yellow-pepper-bell'        , 'Yellow Pepper (Bell)'                 , 'Peppers'         , 'Per piece'           ,  282),
  ('garden-egg-purple'         , 'Garden Egg Purple'                    , 'Vegetables'      , 'Rubber (bowl)'       ,  283),
  ('cassava-yellow'            , 'Cassava Yellow'                       , 'Tubers'          , '1 kg'                ,  284),
  ('cocoyam-new-ede-oyibo'     , 'New Cocoyam (Ede Oyibo)'              , 'Tubers'          , 'Paint bucket'        ,  285),
  ('efuru-yam'                 , 'Efuru Yam'                            , 'Tubers'          , 'Single tuber (large)',  286),
  ('irish-potato-diamant'      , 'Irish Potato Diamant'                 , 'Tubers'          , 'Paint bucket'        ,  287),
  ('irish-potato-nicola'       , 'Irish Potato Nicola'                  , 'Tubers'          , 'Paint bucket'        ,  288),
  ('puna-yam'                  , 'Puna Yam'                             , 'Tubers'          , 'Single tuber (large)',  289),
  ('sweet-potato-orange-flesh' , 'Sweet Potato Orange-flesh'            , 'Tubers'          , 'Rubber (bowl)'       ,  290),
  ('sweet-potato-purple'       , 'Sweet Potato Purple'                  , 'Tubers'          , 'Rubber (bowl)'       ,  291),
  ('yellow-yam'                , 'Yellow Yam'                           , 'Tubers'          , 'Single tuber (large)',  292),
  ('maize-popcorn'             , 'Maize Popcorn'                        , 'Grains'          , 'Paint bucket'        ,  293),
  ('rice-basmati'              , 'Rice Basmati'                         , 'Grains'          , 'Bag (5 kg)'          ,  294),
  ('sweet-corn'                , 'Sweet Corn'                           , 'Grains'          , 'Paint bucket'        ,  295),
  ('banana-local-unripe'       , 'Banana Local Unripe'                  , 'Fruits'          , 'Bunch (large)'       ,  296),
  ('cashew-fruit'              , 'Cashew Fruit'                         , 'Fruits'          , 'Heap'                ,  297),
  ('cucumber-short-local'      , 'Cucumber Short Local'                 , 'Fruits'          , 'Per piece'           ,  298),
  ('grape-green'               , 'Grape Green'                          , 'Fruits'          , '1 kg'                ,  299),
  ('orange-navel'              , 'Orange Navel'                         , 'Fruits'          , 'Dozen'               ,  300),
  ('orange-valencia'           , 'Orange Valencia'                      , 'Fruits'          , 'Dozen'               ,  301),
  ('tigernut-dried'            , 'Tigernut Dried'                       , 'Fruits'          , 'Cup'                 ,  302),
  ('ukwa-dehulled-seeds'       , 'Ukwa (Dehulled Breadfruit Seeds)'     , 'Fruits'          , 'Cup'                 ,  303),
  ('watermelon-yellow-flesh'   , 'Watermelon Yellow Flesh'              , 'Fruits'          , 'Single (large)'      ,  304),
  ('ginger-dried'              , 'Ginger Dried'                         , 'Spices & Seeds'  , 'Cup'                 ,  305),
  ('locust-beans-iru-pete'     , 'Locust Beans (Iru Pete)'              , 'Spices & Seeds'  , 'Wrap'                ,  306),
  ('melon-seed-egusi-unshelled', 'Melon Seed (Egusi) Unshelled'         , 'Spices & Seeds'  , 'Paint bucket'        ,  307),
  ('moringa-leaf-powder'       , 'Moringa Leaf Powder'                  , 'Spices & Seeds'  , 'Pack'                ,  308),
  ('onions-yellow'             , 'Onions Yellow'                        , 'Spices & Seeds'  , 'Paint bucket'        ,  309),
  ('beans-drum'                , 'Beans (Drum)'                         , 'Beans & Nuts'    , 'Paint bucket'        ,  310),
  ('garri-okirika'             , 'Garri Okirika'                        , 'Processed Tubers', 'Paint bucket'        ,  311),
  ('beef-brisket'              , 'Beef Brisket'                         , 'Meat'            , '1 kg'                ,  312),
  ('beef-chuck'                , 'Beef Chuck'                           , 'Meat'            , '1 kg'                ,  313),
  ('beef-flank'                , 'Beef Flank'                           , 'Meat'            , '1 kg'                ,  314),
  ('beef-rib-meat'             , 'Beef Rib Meat'                        , 'Meat'            , '1 kg'                ,  315),
  ('beef-round'                , 'Beef Round (Soft Meat)'               , 'Meat'            , '1 kg'                ,  316),
  ('beef-shank-leg'            , 'Beef Shank/Leg'                       , 'Meat'            , '1 kg'                ,  317),
  ('cow-head-meat'             , 'Cow Head Meat'                        , 'Meat'            , '1 kg'                ,  318),
  ('cow-intestine-towel'       , 'Cow Intestine (Towel)'                , 'Meat'            , '1 kg'                ,  319),
  ('goat-head'                 , 'Goat Head'                            , 'Meat'            , '1 kg'                ,  320),
  ('goat-kidney'               , 'Goat Kidney'                          , 'Meat'            , '1 kg'                ,  321),
  ('goat-liver'                , 'Goat Liver'                           , 'Meat'            , '1 kg'                ,  322),
  ('goat-tripe'                , 'Goat Tripe'                           , 'Meat'            , '1 kg'                ,  323),
  ('live-goat'                 , 'Live Goat'                            , 'Meat'            , '1 kg'                ,  324),
  ('whole-goat-dressed'        , 'Whole Goat (Dressed)'                 , 'Meat'            , '1 kg'                ,  325),
  ('chicken-gizzard-frozen'    , 'Chicken Gizzard (frozen)'             , 'Poultry'         , '1 kg'                ,  326),
  ('baby-stockfish-okporoko'   , 'Baby Stockfish (Okporoko)'            , 'Fish & Seafood'  , 'Single (large)'      ,  327),
  ('catfish-live'              , 'Catfish (live)'                       , 'Fish & Seafood'  , '1 kg'                ,  328),
  ('catfish-smoked'            , 'Catfish (smoked)'                     , 'Fish & Seafood'  , '1 kg'                ,  329),
  ('crab'                      , 'Crab'                                 , 'Fish & Seafood'  , 'Per piece'           ,  330),
  ('crayfish-ground'           , 'Crayfish Ground'                      , 'Fish & Seafood'  , 'Paint bucket'        ,  331),
  ('croaker-fresh'             , 'Croaker (fresh)'                      , 'Fish & Seafood'  , '1 kg'                ,  332),
  ('croaker-frozen'            , 'Croaker (frozen)'                     , 'Fish & Seafood'  , '1 kg'                ,  333),
  ('lobster-frozen'            , 'Lobster (frozen)'                     , 'Fish & Seafood'  , '1 kg'                ,  334),
  ('mullet-fresh'              , 'Mullet (fresh)'                       , 'Fish & Seafood'  , '1 kg'                ,  335),
  ('ojuyobo-argentina-frozen'  , 'Ojuyobo (Argentina, frozen)'          , 'Fish & Seafood'  , '1 kg'                ,  336),
  ('panla-osan-pollock-frozen' , 'Panla Osan (Alaska Pollock, frozen)'  , 'Fish & Seafood'  , '1 kg'                ,  337),
  ('periwinkle-shelled'        , 'Periwinkle Shelled'                   , 'Fish & Seafood'  , 'Cup'                 ,  338),
  ('prawns-fresh'              , 'Prawns (fresh)'                       , 'Fish & Seafood'  , '1 kg'                ,  339),
  ('red-pacu-owere-frozen'     , 'Red Pacu (Owere, frozen)'             , 'Fish & Seafood'  , '1 kg'                ,  340),
  ('shawa-herring-frozen'      , 'Shawa (Herring, frozen)'              , 'Fish & Seafood'  , '1 kg'                ,  341),
  ('shrimp-fresh'              , 'Shrimp (fresh)'                       , 'Fish & Seafood'  , '1 kg'                ,  342),
  ('shrimp-smoked'             , 'Shrimp (smoked)'                      , 'Fish & Seafood'  , 'Paint bucket'        ,  343),
  ('tilapia-frozen'            , 'Tilapia (frozen)'                     , 'Fish & Seafood'  , '1 kg'                ,  344),
  ('titus-kampala-frozen'      , 'Titus Kampala (Chub Mackerel, frozen)', 'Fish & Seafood'  , '1 kg'                ,  345)
) as v(slug, canonical_name, category, unit_name, display_order)
join units u on u.name = v.unit_name
on conflict (slug) do nothing;


-- ----------------------------------------------------------------------------
-- 5. Tracking: the 243 commodities the tracker prices.
-- ----------------------------------------------------------------------------

update commodities
   set is_tracked = true,
       updated_at = now()
 where slug in (
    'african-walnut-asala', 'agbalumo', 'alligator-pepper', 'apple-green',
    'apple-red', 'atama-leaves', 'avocado-ripe', 'avocado-unripe',
    'baby-stockfish-okporoko', 'bambara-nuts-okpa', 'banana-imported',
    'banana-local-native', 'banana-local-unripe', 'banga-stick', 'barley',
    'barley-flour', 'bay-leaf', 'beans-drum', 'beans-oloo',
    'beans-oloyin', 'beef-brisket', 'beef-chuck', 'beef-flank',
    'beef-rib-meat', 'beef-round', 'beef-shank-leg', 'beetroot',
    'black-eyed-beans', 'black-pepper-powder', 'bread-fruit', 'broccoli',
    'cabbage-green', 'cabbage-red', 'carrot', 'cashew-fruit',
    'cashew-nut', 'cassava', 'cassava-yellow', 'catfish-fresh',
    'catfish-live', 'catfish-smoked', 'cauliflower', 'celery-leaf',
    'chicken-breast-frozen', 'chicken-gizzard-frozen',
    'chicken-laps-thighs-frozen', 'chicken-wings-frozen',
    'chilli-pepper-green-habanero', 'chilli-pepper-red-habanero',
    'cinnamon', 'cinnamon-powder', 'cloves', 'coconut', 'cocoyam',
    'cocoyam-new-ede-oyibo', 'coriander-leaf', 'cow-head-meat',
    'cow-intestine-towel', 'cow-kidney', 'cow-leg-bokoto', 'cow-liver',
    'crab', 'crayfish', 'crayfish-ground', 'croaker-fresh',
    'croaker-frozen', 'cucumber', 'cucumber-short-local',
    'custard-apple-soursop', 'dates', 'dragon-fruit',
    'dried-atama-leaves', 'dried-ewedu', 'dried-soko', 'dried-uziza',
    'editan-leaf', 'efuru-yam', 'eggplant', 'ehuru', 'ewedu',
    'ewuro-bitter-leaf', 'ewuro-bitter-leaf-washed', 'garden-egg-green',
    'garden-egg-purple', 'garden-egg-white', 'garlic-imported',
    'garlic-local', 'garri-okirika', 'garri-white', 'garri-yellow',
    'ginger', 'ginger-dried', 'goat-head', 'goat-kidney', 'goat-liver',
    'goat-meat', 'goat-tripe', 'golden-melon', 'grape', 'grape-green',
    'green-pepper-bell', 'ground-egusi', 'ground-ogbono',
    'groundnut-uncooked', 'guava', 'guinea-corn-red-sorghum',
    'guinea-corn-white-sorghum', 'irish-potato-diamant',
    'irish-potato-nicola', 'irish-potatoes', 'kale',
    'kiwano-horned-melon', 'kote-croaker-frozen', 'leek', 'lemon',
    'lemon-grass', 'lentils', 'lettuce', 'limes', 'live-goat',
    'lobster-frozen', 'locust-beans-iru', 'locust-beans-iru-pete',
    'maize-flour', 'maize-popcorn', 'maize-white', 'maize-yellow',
    'mango-julie', 'mango-sheri', 'melon-seed-egusi',
    'melon-seed-egusi-unshelled', 'millet', 'millet-flour',
    'moringa-leaf', 'moringa-leaf-powder', 'mullet-fresh', 'new-yam',
    'nutmeg', 'oats', 'oats-flour', 'ogbono-seed', 'ogiri',
    'ojuyobo-argentina-frozen', 'okazi-leaf-sliced',
    'okazi-leaf-wild-spinach', 'okro', 'old-yam', 'onions-red',
    'onions-white', 'onions-yellow', 'orange-navel', 'orange-valencia',
    'oranges', 'panla-hake-frozen', 'panla-osan-pollock-frozen',
    'passion-fruit', 'pawpaw', 'pear', 'peppercorn', 'periwinkle',
    'periwinkle-shelled', 'pineapple-cotonou', 'pineapple-local',
    'plantain-flour', 'plantain-ripe', 'plantain-unripe', 'plum',
    'pomegranate', 'prawns-fresh', 'prawns-frozen', 'puna-yam',
    'red-pacu-owere-frozen', 'red-pepper-bell', 'rice-basmati',
    'rice-flour', 'rice-long-grain', 'rice-short-grain', 'rodo-mild',
    'rodo-scotch-bonnet', 'rodo-yellow', 'rosemary', 'runner-beans',
    'scent-leaf-basil', 'sesame-seed', 'shaki-tripe',
    'shawa-herring-frozen', 'shombo-cayenne-pepper', 'shrimp-fresh',
    'shrimp-smoked', 'soko-nigerian-spinach', 'sorghum-flour',
    'soyabeans', 'spring-onion', 'star-fruit', 'stockfish-body',
    'stockfish-head', 'strawberry', 'sugarcane', 'sweet-basil',
    'sweet-corn', 'sweet-potato-orange-flesh', 'sweet-potato-purple',
    'sweet-potatoes', 'tamarind', 'tangelo-imported', 'tangerine-local',
    'tatase-bell-pepper', 'tete-amaranth-green', 'thyme-leaf', 'tigernut',
    'tigernut-dried', 'tilapia-fresh', 'tilapia-frozen',
    'titus-kampala-frozen', 'titus-mackerel-frozen', 'tomato-cherry',
    'tomato-hausa-yoruba', 'tomato-plum', 'tomato-roma', 'tomato-yoruba',
    'turkey-laps-thighs-frozen', 'turkey-wings-frozen', 'turmeric',
    'turmeric-powder', 'uda-seed', 'ugba', 'ugwu-leaf-fluted-pumpkin',
    'ugwu-leaf-shredded', 'ukwa-dehulled-seeds',
    'uziza-leaf-piper-guineense', 'water-leaf', 'water-yam', 'watercress',
    'watermelon', 'watermelon-yellow-flesh', 'wheat-flour',
    'wheat-imported', 'wheat-local', 'whole-chicken-frozen',
    'whole-goat-dressed', 'yellow-pepper-bell', 'yellow-yam',
    'zobo-leaves'
   )
   and is_active
   and not is_tracked;


-- garri-ijebu is a duplicate label; the tracker's row maps to garri-white.
update commodities
   set is_tracked = false,
       updated_at = now()
 where slug = 'garri-ijebu'
   and is_tracked;

commit;
