-- ============================================================================
-- seed.sql -- REFERENCE DATA ONLY (P0.1)
--
-- Sections, commodities, units, collection sites, sources, templates and seed
-- rules are the only things permitted in this file. There are no prices here,
-- no articles, no collectors, no signals, no sample anything. If this file ever
-- grows a figure, that figure is fabricated content and the protocol has been
-- broken.
--
-- SOURCE. Generated from data/marketprices-products.csv
--   sha256 1f700e723835f25aadb24c6b45fc5c1ddcce64ce96a857feb7782617a6f41dda
--   261 data rows -> 266 products across 21 categories, using 16 distinct
--   units from the sheet plus two that are in none of its 25: the Derica,
--   which arrived with 0039, and Per cut, which arrived with 0040.
--
-- IN TWO PASSES, and the file no longer distinguishes them. 201 rows marked
-- unit_source = 'Template' were seeded first. The 60 marked 'Proposed -
-- confirm' were held back -- a proposed row is a suggestion from the sheet, not
-- a decision -- and were reviewed by the project owner on 2026-09-16/17. That
-- review corrected ten of them, removed Cocoa Fruit, added seven frozen-poultry
-- rows the sheet never had, and deferred Crab pending its name:
--
--   201 + 60 - 1 (Cocoa Fruit) + 7 (new) - 1 (Crab, deferred) = 266
--
-- 0040_confirmed_commodities.sql carries that decision, every correction and
-- the wholesale pairing for all 65 of its rows. This file carries the same end
-- state so a fresh database is born with them rather than patched into them.
-- Crab and the `Bundle` unit it needs are absent from BOTH, and arrive together
-- once the name is chosen.
--
-- DEPENDS ON TWO MIGRATIONS. This file will fail loudly without both:
--   0036 -- units.base_multiplier nullable. Every one of the 18 units below is
--          non-metric and has no weight anywhere in the source file (both
--          size/weight columns are empty on all 261 rows); nobody has weighed a
--          derica either, so it is seeded with no multiplier too. Under the old NOT
--          NULL constraint not one unit could be created, and therefore not one
--          commodity, because commodities.default_unit_id is NOT NULL.
--   0037 -- commodities.commodity_group nullable. The source gives one taxonomy
--          axis, which goes into `category`. commodity_group is left unset
--          rather than duplicated from it.
--
-- IDEMPOTENT. Re-runnable: both inserts are ON CONFLICT DO NOTHING against the
-- natural keys (units.name, commodities.slug), and units are joined by name
-- rather than by a hardcoded UUID, so a second run changes nothing and no id
-- is baked into this file.
--
-- THREE THINGS A HUMAN STILL HAS TO DECIDE, none of them invented here:
--
--   1. is_tracked. It was FALSE for all 266 rows until the Lagos tracker was
--      mapped. The owner settled that mapping on 2026-09-30, and the tracking
--      block at the end of this file sets is_tracked = true for the 243
--      commodities the tracker prices -- 77 of them new in the block above it.
--      It remains an editorial commitment, not a property of the source file:
--      true asserts that someone prices this commodity every week. What changed
--      is that the commitment now exists in writing.
--
--   2. base_multiplier is NULL on every unit. Null means "not yet weighed", not
--      1. Nothing may convert across these units until real weights come back
--      from the field (see 0036).
--
--   3. units.abbreviation is in neither the source CSV nor the tracker. The
--      column is NOT NULL UNIQUE and neither document carries abbreviations, so
--      all 54 below are derived from the unit names and are worth a second read
--      before they ship -- the 36 that came with 0044 as much as the original
--      eighteen. They are display shorthand, nothing computes on them.
--
--      Two unit NAMES are also absent from the sheet: the Derica (0039) and
--      Per cut (0040, for Sugarcane). The commodities whose default unit this
--      file states against the sheet's own retail_unit column are okro, ginger
--      and garlic-local (0039), and the thirteen rows 0040 corrected. Each
--      migration records the evidence for its own.
--
-- NOT SEEDED. collection_sites is deliberately empty -- the source sheet
-- dropped per-market tracking and names no real sites, and a site name renders
-- as provenance on every price (P1.6). It waits for real names. Note that
-- price_submissions.collection_site_id is NOT NULL, so no submission can be
-- accepted until at least one real site exists.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- units -- the 54 the catalogue now needs
--
-- Eighteen of these were the retail units of the originally seeded products;
-- sixteen of those came from the source file, the Derica and Per cut did not and
-- are noted below. The other 36 arrived with 0044: the units the Lagos tracker
-- actually prices in, wholesale ones included, settled with the project owner on
-- 2026-09-30. 0043 gave `units` an is_active column first, so a unit can now be
-- retired without being deleted -- which matters, because the table stopped being
-- small on the same day. Nothing filters on is_active yet:
-- generate-form-options.ts still reads the whole table, so until the form
-- builders honour the column every row here is a choice offered to a collector,
-- and a unit nothing references is a wrong answer put in front of someone pricing
-- ugwu leaf. All 54 are inserted active; retiring any of them is a later human
-- decision.
--
-- Sack is gone from this list. 0044 renamed it "Bag (50 kg)" -- the tracker never
-- writes "Sack", it writes Big bag (50kg), Per 50kg bag and Per bag (50kg), all
-- one 50 kg sack. Migrations run BEFORE this file on a reset, so seeding 'Sack'
-- here would undo that rename on every fresh database.
--
-- THE DERICA is in none of the source file's 25 units.
-- It was added by 0039_derica_unit_and_retail_unit_corrections.sql, which
-- corrects three retail units the sheet records as Paint bucket -- okro to
-- Derica, ginger to Plate, garlic-local to Small bundle. That migration carries
-- the evidence for each of the three; this file carries the same end state so
-- that a fresh database is born corrected rather than born wrong and patched.
-- data/marketprices-products.csv is deliberately NOT edited and still reads
-- Paint bucket for all three: it is the received source document, pinned by the
-- sha256 above, and it stays the record of what the sheet actually said.
--
-- PER CUT is the other name absent from the sheet. Sugarcane is recorded there
-- as Single (medium) / Big basket; it is sold by the cut piece at retail and by
-- the whole stick above that, confirmed 2026-09-17. 0040 carries that and the
-- nine other corrections, and the CSV keeps its original reading for the same
-- reason it keeps Paint bucket.
--
-- base_multiplier is omitted from the column list rather than written as NULL:
-- the column has no default, so omitting it stores NULL, and writing it out
-- would read like a value was considered.
-- ----------------------------------------------------------------------------

insert into units (name, abbreviation) values
  ('1 kg'                 , 'kg'),
  ('1 kg pack'            , '1kg pack'),
  ('1 litre bottle'       , '1 litre'),
  ('10 kg carton'         , 'carton 10kg'),
  ('5 big bundles'        , '5 bg bundles'),
  ('Bag (100 kg)'         , 'bag 100kg'),
  ('Bag (25 kg)'          , 'bag 25kg'),
  ('Bag (5 kg)'           , 'bag 5kg'),
  ('Bag (50 kg)'          , 'bag 50kg'),
  ('Big basket'           , 'basket'),
  ('Big bundle'           , 'bg bundle'),
  ('Big pack'             , 'bg pack'),
  ('Bunch (large)'        , 'bunch lg'),
  ('Bunch (small)'        , 'bunch sm'),
  ('Bundle'               , 'bundle'),
  ('Bundle of 10 sticks'  , 'bundle 10'),
  ('Carton (20 kg)'       , 'carton 20kg'),
  ('Carton of 10'         , 'carton 10'),
  ('Crate of 30'          , 'crate 30'),
  ('Cup'                  , 'cup'),
  ('Derica'               , 'derica'),
  ('Dozen'                , 'dozen'),
  ('Half cow'             , 'half cow'),
  ('Half dozen'           , 'half dozen'),
  ('Half goat'            , 'half goat'),
  ('Half piece'           , 'half piece'),
  ('Head (large)'         , 'head lg'),
  ('Head (small)'         , 'head sm'),
  ('Heap'                 , 'heap'),
  ('Mudu'                 , 'mudu'),
  ('Pack'                 , 'pack'),
  ('Pack of 20'           , 'pack 20'),
  ('Paint bucket'         , 'bucket'),
  ('Per bird'             , 'bird'),
  ('Per cob'              , 'cob'),
  ('Per cut'              , 'cut'),
  ('Per finger'           , 'finger'),
  ('Per piece'            , 'piece'),
  ('Per stick'            , 'stick'),
  ('Plate'                , 'plate'),
  ('Quarter cow'          , 'quarter cow'),
  ('Rubber (bowl)'        , 'rubber'),
  ('Sachet'               , 'sachet'),
  ('Single (large)'       , 'single lg'),
  ('Single (medium)'      , 'single md'),
  ('Single (small)'       , 'single sm'),
  ('Single tuber (large)' , 'tuber lg'),
  ('Single tuber (medium)', 'tuber md'),
  ('Single tuber (small)' , 'tuber sm'),
  ('Small basket'         , 'sm basket'),
  ('Small bundle'         , 'sm bundle'),
  ('Small pack'           , 'sm pack'),
  ('Whole goat'           , 'whole goat'),
  ('Wrap'                 , 'wrap')
on conflict (name) do nothing;


-- ----------------------------------------------------------------------------
-- commodities -- 266 products
--
-- default_unit_id is each product's RETAIL unit. The source gives two units per
-- product, retail and wholesale, from disjoint sets; the schema holds one
-- default. The tier-specific unit is not lost -- price_observations carries its
-- own unit_id alongside tier -- but the commodity's default is the
-- consumer-facing one, because that is the figure the public surfaces quote.
--
-- The wholesale units are seeded above and reachable; they are simply not the
-- default. For reference, the five pairings in the source are:
--   Small pack -> Big pack, Paint bucket -> Sack, Plate -> Big basket,
--   Paint bucket -> Big basket, Small bundle -> Big bundle.
--
-- display_order is the source file's own MP-#### sequence. The 60 confirmed
-- rows slotted back into their original positions, exactly as this note
-- promised they would, and nothing already seeded was renumbered. Two gaps
-- remain and are permanent: 69 (Cocoa Fruit, removed) and 252 (Crab,
-- deferred). The seven rows the sheet never had take 262-268, after its last.
--
-- commodity_group is omitted (0037): one axis in, one axis stored.
-- aliases, icon, seasonality_profile and site_offset_pct all take their
-- defaults -- empty array and NULL. Null seasonality means "not yet assessed",
-- which is what the anomaly check reads before it flags anything.
--
-- Units are joined by name so no UUID is hardcoded here.
-- ----------------------------------------------------------------------------

insert into commodities
  (slug, canonical_name, category, default_unit_id, display_order, is_tracked)
select
  v.slug, v.canonical_name, v.category, u.id, v.display_order, false
from (values
  ('soko-nigerian-spinach'       , 'Soko (Nigerian Spinach)'       , 'Leafy Vegetables'          , 'Small bundle'         ,   1),
  ('tete-amaranth-green'         , 'Tete (Amaranth Green)'         , 'Leafy Vegetables'          , 'Small bundle'         ,   2),
  ('ewuro-bitter-leaf'           , 'Ewuro (Bitter Leaf)'           , 'Leafy Vegetables'          , 'Small bundle'         ,   3),
  ('water-leaf'                  , 'Water Leaf'                    , 'Leafy Vegetables'          , 'Small bundle'         ,   4),
  ('scent-leaf-basil'            , 'Scent Leaf (Basil)'            , 'Leafy Vegetables'          , 'Small bundle'         ,   5),
  ('ugwu-leaf-fluted-pumpkin'    , 'Ugwu Leaf (Fluted Pumpkin)'    , 'Leafy Vegetables'          , 'Small bundle'         ,   6),
  ('uziza-leaf-piper-guineense'  , 'Uziza Leaf (Piper Guineense)'  , 'Leafy Vegetables'          , 'Small bundle'         ,   7),
  ('okazi-leaf-wild-spinach'     , 'Okazi Leaf (Wild Spinach)'     , 'Leafy Vegetables'          , 'Small bundle'         ,   8),
  ('ewedu'                       , 'Ewedu'                         , 'Leafy Vegetables'          , 'Small bundle'         ,   9),
  ('atama-leaves'                , 'Atama Leaves'                  , 'Leafy Vegetables'          , 'Small bundle'         ,  10),
  ('editan-leaf'                 , 'Editan Leaf'                   , 'Leafy Vegetables'          , 'Small bundle'         ,  11),
  ('kale'                        , 'Kale'                          , 'Leafy Vegetables'          , 'Small bundle'         ,  12),
  ('coriander-leaf'              , 'Coriander Leaf'                , 'Leafy Vegetables'          , 'Small bundle'         ,  13),
  ('celery-leaf'                 , 'Celery Leaf'                   , 'Leafy Vegetables'          , 'Small bundle'         ,  14),
  ('rodo-scotch-bonnet'          , 'Rodo (Scotch Bonnet)'          , 'Peppers'                   , 'Paint bucket'         ,  15),
  ('tatase-bell-pepper'          , 'Tatase (Bell Pepper)'          , 'Peppers'                   , 'Paint bucket'         ,  16),
  ('shombo-cayenne-pepper'       , 'Shombo (Cayenne Pepper)'       , 'Peppers'                   , 'Paint bucket'         ,  17),
  ('tomato-hausa-yoruba'         , 'Tomato (Hausa/Yoruba)'         , 'Peppers'                   , 'Paint bucket'         ,  18),
  ('green-pepper-bell'           , 'Green Pepper (Bell)'           , 'Peppers'                   , 'Paint bucket'         ,  19),
  ('yellow-red-pepper'           , 'Yellow/Red Pepper'             , 'Peppers'                   , 'Paint bucket'         ,  20),
  ('peppercorn'                  , 'Peppercorn'                    , 'Peppers'                   , 'Paint bucket'         ,  21),
  ('alligator-pepper'            , 'Alligator Pepper'              , 'Peppers'                   , 'Paint bucket'         ,  22),
  ('chilli-pepper-green-habanero', 'Chilli Pepper Green (Habanero)', 'Peppers'                   , 'Paint bucket'         ,  23),
  ('chilli-pepper-red-habanero'  , 'Chilli Pepper Red (Habanero)'  , 'Peppers'                   , 'Paint bucket'         ,  24),
  ('leek'                        , 'Leek'                          , 'Vegetables'                , 'Paint bucket'         ,  25),
  ('lemon-grass'                 , 'Lemon Grass'                   , 'Vegetables'                , 'Paint bucket'         ,  26),
  ('carrot'                      , 'Carrot'                        , 'Vegetables'                , 'Paint bucket'         ,  27),
  ('okro'                        , 'Okro'                          , 'Vegetables'                , 'Derica'               ,  28),
  ('cabbage-green'               , 'Cabbage Green'                 , 'Vegetables'                , 'Paint bucket'         ,  29),
  ('cabbage-red'                 , 'Cabbage Red'                   , 'Vegetables'                , 'Paint bucket'         ,  30),
  ('lettuce'                     , 'Lettuce'                       , 'Vegetables'                , 'Paint bucket'         ,  31),
  ('cauliflower'                 , 'Cauliflower'                   , 'Vegetables'                , 'Paint bucket'         ,  32),
  ('garden-egg-green'            , 'Garden Egg Green'              , 'Vegetables'                , 'Paint bucket'         ,  33),
  ('garden-egg-white'            , 'Garden Egg White'              , 'Vegetables'                , 'Paint bucket'         ,  34),
  ('watercress'                  , 'Watercress'                    , 'Vegetables'                , 'Paint bucket'         ,  35),
  ('spring-onion'                , 'Spring Onion'                  , 'Vegetables'                , 'Paint bucket'         ,  36),
  ('broccoli'                    , 'Broccoli'                      , 'Vegetables'                , 'Paint bucket'         ,  37),
  ('beetroot'                    , 'Beetroot'                      , 'Tubers'                    , 'Paint bucket'         ,  38),
  ('cocoyam'                     , 'Cocoyam'                       , 'Tubers'                    , 'Paint bucket'         ,  39),
  ('sweet-potatoes'              , 'Sweet Potatoes'                , 'Tubers'                    , 'Paint bucket'         ,  40),
  ('irish-potatoes'              , 'Irish Potatoes'                , 'Tubers'                    , 'Paint bucket'         ,  41),
  ('cassava'                     , 'Cassava'                       , 'Tubers'                    , 'Paint bucket'         ,  42),
  ('old-yam'                     , 'Old Yam'                       , 'Tubers'                    , 'Single tuber (medium)',  43),
  ('new-yam'                     , 'New Yam'                       , 'Tubers'                    , 'Single tuber (medium)',  44),
  ('water-yam'                   , 'Water Yam'                     , 'Tubers'                    , 'Single tuber (medium)',  45),
  ('maize-yellow'                , 'Maize Yellow'                  , 'Grains'                    , 'Paint bucket'         ,  46),
  ('maize-white'                 , 'Maize White'                   , 'Grains'                    , 'Paint bucket'         ,  47),
  ('wheat-local'                 , 'Wheat Local'                   , 'Grains'                    , 'Paint bucket'         ,  48),
  ('wheat-imported'              , 'Wheat Imported'                , 'Grains'                    , 'Paint bucket'         ,  49),
  ('rice-short-grain'            , 'Rice Short Grain'              , 'Grains'                    , 'Paint bucket'         ,  50),
  ('rice-long-grain'             , 'Rice Long Grain'               , 'Grains'                    , 'Paint bucket'         ,  51),
  ('ofada-rice'                  , 'Ofada Rice'                    , 'Grains'                    , 'Paint bucket'         ,  52),
  ('millet'                      , 'Millet'                        , 'Grains'                    , 'Paint bucket'         ,  53),
  ('guinea-corn-white-sorghum'   , 'Guinea Corn White (Sorghum)'   , 'Grains'                    , 'Paint bucket'         ,  54),
  ('guinea-corn-red-sorghum'     , 'Guinea Corn Red (Sorghum)'     , 'Grains'                    , 'Paint bucket'         ,  55),
  ('barley'                      , 'Barley'                        , 'Grains'                    , 'Paint bucket'         ,  56),
  ('oats'                        , 'Oats'                          , 'Grains'                    , 'Paint bucket'         ,  57),
  ('quinoa'                      , 'Quinoa'                        , 'Grains'                    , 'Paint bucket'         ,  58),
  ('watermelon'                  , 'Watermelon'                    , 'Fruits'                    , 'Single (medium)'      ,  59),
  ('pineapple-local'             , 'Pineapple Local'               , 'Fruits'                    , 'Single (medium)'      ,  60),
  ('pineapple-cotonou'           , 'Pineapple Cotonou'             , 'Fruits'                    , 'Single (medium)'      ,  61),
  ('coconut'                     , 'Coconut'                       , 'Fruits'                    , 'Single (medium)'      ,  62),
  ('golden-melon'                , 'Golden Melon'                  , 'Fruits'                    , 'Single (medium)'      ,  63),
  ('pawpaw'                      , 'Pawpaw'                        , 'Fruits'                    , 'Single (medium)'      ,  64),
  ('sugarcane'                   , 'Sugarcane'                     , 'Fruits'                    , 'Per cut'              ,  65),
  ('kiwano-horned-melon'         , 'Kiwano Horned Melon'           , 'Fruits'                    , 'Single (medium)'      ,  66),
  ('bread-fruit'                 , 'Bread Fruit'                   , 'Fruits'                    , 'Single (medium)'      ,  67),
  ('custard-apple-soursop'       , 'Custard Apple/Soursop'         , 'Fruits'                    , 'Single (medium)'      ,  68),
  ('plum'                        , 'Plum'                          , 'Fruits'                    , 'Single (medium)'      ,  70),
  ('kiwi'                        , 'Kiwi'                          , 'Fruits'                    , 'Plate'                ,  71),
  ('plantain-ripe'               , 'Plantain Ripe'                 , 'Fruits'                    , 'Plate'                ,  72),
  ('plantain-unripe'             , 'Plantain Unripe'               , 'Fruits'                    , 'Plate'                ,  73),
  ('african-pear'                , 'African Pear'                  , 'Fruits'                    , 'Plate'                ,  74),
  ('cucumber'                    , 'Cucumber'                      , 'Fruits'                    , 'Plate'                ,  75),
  ('avocado-unripe'              , 'Avocado Unripe'                , 'Fruits'                    , 'Plate'                ,  76),
  ('avocado-ripe'                , 'Avocado Ripe'                  , 'Fruits'                    , 'Plate'                ,  77),
  ('eggplant'                    , 'Eggplant'                      , 'Fruits'                    , 'Plate'                ,  78),
  ('guava'                       , 'Guava'                         , 'Fruits'                    , 'Plate'                ,  79),
  ('tamarind'                    , 'Tamarind'                      , 'Fruits'                    , 'Plate'                ,  80),
  ('star-fruit'                  , 'Star Fruit'                    , 'Fruits'                    , 'Plate'                ,  81),
  ('dragon-fruit'                , 'Dragon Fruit'                  , 'Fruits'                    , 'Plate'                ,  82),
  ('tigernut'                    , 'Tigernut'                      , 'Fruits'                    , 'Plate'                ,  83),
  ('oranges'                     , 'Oranges'                       , 'Fruits'                    , 'Plate'                ,  84),
  ('grape'                       , 'Grape'                         , 'Fruits'                    , 'Plate'                ,  85),
  ('passion-fruit'               , 'Passion Fruit'                 , 'Fruits'                    , 'Plate'                ,  86),
  ('tangerine-local'             , 'Tangerine Local'               , 'Fruits'                    , 'Plate'                ,  87),
  ('tangelo-imported'            , 'Tangelo Imported'              , 'Fruits'                    , 'Plate'                ,  88),
  ('lemon'                       , 'Lemon'                         , 'Fruits'                    , 'Plate'                ,  89),
  ('limes'                       , 'Limes'                         , 'Fruits'                    , 'Plate'                ,  90),
  ('strawberry'                  , 'Strawberry'                    , 'Fruits'                    , 'Plate'                ,  91),
  ('raspberry'                   , 'Raspberry'                     , 'Fruits'                    , 'Plate'                ,  92),
  ('blackberry'                  , 'Blackberry'                    , 'Fruits'                    , 'Plate'                ,  93),
  ('dates'                       , 'Dates'                         , 'Fruits'                    , 'Plate'                ,  94),
  ('agbalumo'                    , 'Agbalumo'                      , 'Fruits'                    , 'Plate'                ,  95),
  ('banana-local-native'         , 'Banana Local/Native'           , 'Fruits'                    , 'Plate'                ,  96),
  ('banana-imported'             , 'Banana Imported'               , 'Fruits'                    , 'Plate'                ,  97),
  ('mango-sheri'                 , 'Mango Sheri'                   , 'Fruits'                    , 'Plate'                ,  98),
  ('mango-julie'                 , 'Mango Julie'                   , 'Fruits'                    , 'Plate'                ,  99),
  ('apricot'                     , 'Apricot'                       , 'Fruits'                    , 'Plate'                , 100),
  ('peaches'                     , 'Peaches'                       , 'Fruits'                    , 'Plate'                , 101),
  ('apple-green'                 , 'Apple Green'                   , 'Fruits'                    , 'Plate'                , 102),
  ('apple-red'                   , 'Apple Red'                     , 'Fruits'                    , 'Plate'                , 103),
  ('pomegranate'                 , 'Pomegranate'                   , 'Fruits'                    , 'Plate'                , 104),
  ('pear'                        , 'Pear'                          , 'Fruits'                    , 'Plate'                , 105),
  ('onions-red'                  , 'Onions Red'                    , 'Spices & Seeds'            , 'Paint bucket'         , 106),
  ('onions-white'                , 'Onions White'                  , 'Spices & Seeds'            , 'Paint bucket'         , 107),
  ('melon-seed-egusi'            , 'Melon Seed (Egusi)'            , 'Spices & Seeds'            , 'Paint bucket'         , 108),
  ('cinnamon'                    , 'Cinnamon'                      , 'Spices & Seeds'            , 'Paint bucket'         , 109),
  ('locust-beans-iru'            , 'Locust Beans (Iru)'            , 'Spices & Seeds'            , 'Paint bucket'         , 110),
  ('zobo-leaves'                 , 'Zobo Leaves'                   , 'Spices & Seeds'            , 'Paint bucket'         , 111),
  ('thyme-leaf'                  , 'Thyme Leaf'                    , 'Spices & Seeds'            , 'Paint bucket'         , 112),
  ('ogbono-seed'                 , 'Ogbono Seed'                   , 'Spices & Seeds'            , 'Paint bucket'         , 113),
  ('banga-stick'                 , 'Banga Stick'                   , 'Spices & Seeds'            , 'Paint bucket'         , 114),
  ('garlic-local'                , 'Garlic Local'                  , 'Spices & Seeds'            , 'Small bundle'         , 115),
  ('garlic-imported'             , 'Garlic Imported'               , 'Spices & Seeds'            , 'Paint bucket'         , 116),
  ('ginger'                      , 'Ginger'                        , 'Spices & Seeds'            , 'Plate'                , 117),
  ('bay-leaf'                    , 'Bay Leaf'                      , 'Spices & Seeds'            , 'Paint bucket'         , 118),
  ('cloves'                      , 'Cloves'                        , 'Spices & Seeds'            , 'Paint bucket'         , 119),
  ('nutmeg'                      , 'Nutmeg'                        , 'Spices & Seeds'            , 'Paint bucket'         , 120),
  ('rosemary'                    , 'Rosemary'                      , 'Spices & Seeds'            , 'Paint bucket'         , 121),
  ('turmeric'                    , 'Turmeric'                      , 'Spices & Seeds'            , 'Paint bucket'         , 122),
  ('ehuru'                       , 'Ehuru'                         , 'Spices & Seeds'            , 'Paint bucket'         , 123),
  ('ugba'                        , 'Ugba'                          , 'Spices & Seeds'            , 'Paint bucket'         , 124),
  ('ogiri'                       , 'Ogiri'                         , 'Spices & Seeds'            , 'Paint bucket'         , 125),
  ('uda-seed'                    , 'Uda Seed'                      , 'Spices & Seeds'            , 'Paint bucket'         , 126),
  ('moringa-leaf'                , 'Moringa Leaf'                  , 'Spices & Seeds'            , 'Paint bucket'         , 127),
  ('red-kidney-beans'            , 'Red Kidney Beans'              , 'Beans & Nuts'              , 'Paint bucket'         , 128),
  ('soyabeans'                   , 'Soyabeans'                     , 'Beans & Nuts'              , 'Paint bucket'         , 129),
  ('beans-oloyin'                , 'Beans Oloyin'                  , 'Beans & Nuts'              , 'Paint bucket'         , 130),
  ('beans-oloo'                  , 'Beans Oloo'                    , 'Beans & Nuts'              , 'Paint bucket'         , 131),
  ('groundnut-uncooked'          , 'Groundnut Uncooked'            , 'Beans & Nuts'              , 'Paint bucket'         , 132),
  ('black-eyed-beans'            , 'Black Eyed Beans'              , 'Beans & Nuts'              , 'Paint bucket'         , 133),
  ('bambara-nuts-okpa'           , 'Bambara Nuts (Okpa)'           , 'Beans & Nuts'              , 'Paint bucket'         , 134),
  ('lentils'                     , 'Lentils'                       , 'Beans & Nuts'              , 'Paint bucket'         , 135),
  ('rye-grain'                   , 'Rye Grain'                     , 'Beans & Nuts'              , 'Paint bucket'         , 136),
  ('sesame-seed'                 , 'Sesame Seed'                   , 'Beans & Nuts'              , 'Paint bucket'         , 137),
  ('flaxseed'                    , 'Flaxseed'                      , 'Beans & Nuts'              , 'Paint bucket'         , 138),
  ('runner-beans'                , 'Runner Beans'                  , 'Beans & Nuts'              , 'Paint bucket'         , 139),
  ('cashew-nut'                  , 'Cashew Nut'                    , 'Beans & Nuts'              , 'Paint bucket'         , 140),
  ('african-walnut-asala'        , 'African Walnut (Asala)'        , 'Beans & Nuts'              , 'Paint bucket'         , 141),
  ('dried-soko'                  , 'Dried Soko'                    , 'Processed Leafy Vegetables', 'Small pack'           , 142),
  ('dried-tete'                  , 'Dried Tete'                    , 'Processed Leafy Vegetables', 'Small pack'           , 143),
  ('dried-bitter-leaf'           , 'Dried Bitter Leaf'             , 'Processed Leafy Vegetables', 'Small pack'           , 144),
  ('dried-water-leaf'            , 'Dried Water Leaf'              , 'Processed Leafy Vegetables', 'Small pack'           , 145),
  ('dried-scent-leaf'            , 'Dried Scent Leaf'              , 'Processed Leafy Vegetables', 'Small pack'           , 146),
  ('dried-ugwu'                  , 'Dried Ugwu'                    , 'Processed Leafy Vegetables', 'Small pack'           , 147),
  ('dried-uziza'                 , 'Dried Uziza'                   , 'Processed Leafy Vegetables', 'Small pack'           , 148),
  ('dried-ukazi'                 , 'Dried Ukazi'                   , 'Processed Leafy Vegetables', 'Small pack'           , 149),
  ('dried-ewedu'                 , 'Dried Ewedu'                   , 'Processed Leafy Vegetables', 'Small pack'           , 150),
  ('blended-rodo'                , 'Blended Rodo'                  , 'Processed Peppers'         , 'Small pack'           , 151),
  ('blended-tatase'              , 'Blended Tatase'                , 'Processed Peppers'         , 'Small pack'           , 152),
  ('blended-shombo'              , 'Blended Shombo'                , 'Processed Peppers'         , 'Small pack'           , 153),
  ('blended-tomato'              , 'Blended Tomato'                , 'Processed Peppers'         , 'Small pack'           , 154),
  ('dried-habanero-pepper'       , 'Dried Habanero Pepper'         , 'Processed Peppers'         , 'Small pack'           , 155),
  ('dried-red-pepper'            , 'Dried Red Pepper'              , 'Processed Peppers'         , 'Small pack'           , 156),
  ('dried-cayenne-pepper'        , 'Dried Cayenne Pepper'          , 'Processed Peppers'         , 'Small pack'           , 157),
  ('dried-black-pepper'          , 'Dried Black Pepper'            , 'Processed Peppers'         , 'Small pack'           , 158),
  ('ground-dried-okro'           , 'Ground Dried Okro'             , 'Processed Vegetables'      , 'Small pack'           , 159),
  ('dried-cabbage'               , 'Dried Cabbage'                 , 'Processed Vegetables'      , 'Small pack'           , 160),
  ('dried-cauliflower'           , 'Dried Cauliflower'             , 'Processed Vegetables'      , 'Small pack'           , 161),
  ('dried-garden-egg'            , 'Dried Garden Egg'              , 'Processed Vegetables'      , 'Small pack'           , 162),
  ('dried-watercress'            , 'Dried Watercress'              , 'Processed Vegetables'      , 'Small pack'           , 163),
  ('dried-spring-onion'          , 'Dried Spring Onion'            , 'Processed Vegetables'      , 'Small pack'           , 164),
  ('dried-coriander-leaves'      , 'Dried Coriander Leaves'        , 'Processed Vegetables'      , 'Small pack'           , 165),
  ('dried-lettuce'               , 'Dried Lettuce'                 , 'Processed Vegetables'      , 'Small pack'           , 166),
  ('yam-flour-elubo-dudu'        , 'Yam Flour (Elubo Dudu)'        , 'Processed Tubers'          , 'Small pack'           , 167),
  ('cassava-flour-lafun'         , 'Cassava Flour (Lafun)'         , 'Processed Tubers'          , 'Small pack'           , 168),
  ('sweet-potato-flour'          , 'Sweet Potato Flour'            , 'Processed Tubers'          , 'Small pack'           , 169),
  ('irish-potato-flour'          , 'Irish Potato Flour'            , 'Processed Tubers'          , 'Small pack'           , 170),
  ('garri-yellow'                , 'Garri Yellow'                  , 'Processed Tubers'          , 'Small pack'           , 171),
  ('garri-white'                 , 'Garri White'                   , 'Processed Tubers'          , 'Small pack'           , 172),
  ('garri-ijebu'                 , 'Garri Ijebu'                   , 'Processed Tubers'          , 'Small pack'           , 173),
  ('cocoyam-flour'               , 'Cocoyam Flour'                 , 'Processed Tubers'          , 'Small pack'           , 174),
  ('fufu'                        , 'Fufu'                          , 'Processed Tubers'          , 'Small pack'           , 175),
  ('rice-flour'                  , 'Rice Flour'                    , 'Processed Grains'          , 'Small pack'           , 176),
  ('maize-flour'                 , 'Maize Flour'                   , 'Processed Grains'          , 'Small pack'           , 177),
  ('wheat-flour'                 , 'Wheat Flour'                   , 'Processed Grains'          , 'Small pack'           , 178),
  ('millet-flour'                , 'Millet Flour'                  , 'Processed Grains'          , 'Small pack'           , 179),
  ('sorghum-flour'               , 'Sorghum Flour'                 , 'Processed Grains'          , 'Small pack'           , 180),
  ('barley-flour'                , 'Barley Flour'                  , 'Processed Grains'          , 'Small pack'           , 181),
  ('oats-flour'                  , 'Oats Flour'                    , 'Processed Grains'          , 'Small pack'           , 182),
  ('guinea-corn-flour'           , 'Guinea Corn Flour'             , 'Processed Grains'          , 'Small pack'           , 183),
  ('plantain-flour'              , 'Plantain Flour'                , 'Processed Fruits'          , 'Small pack'           , 184),
  ('dried-mango'                 , 'Dried Mango'                   , 'Processed Fruits'          , 'Small pack'           , 185),
  ('dried-orange'                , 'Dried Orange'                  , 'Processed Fruits'          , 'Small pack'           , 186),
  ('dried-pineapple'             , 'Dried Pineapple'               , 'Processed Fruits'          , 'Small pack'           , 187),
  ('dried-watermelon'            , 'Dried Watermelon'              , 'Processed Fruits'          , 'Small pack'           , 188),
  ('dried-guava'                 , 'Dried Guava'                   , 'Processed Fruits'          , 'Small pack'           , 189),
  ('dried-coconut'               , 'Dried Coconut'                 , 'Processed Fruits'          , 'Small pack'           , 190),
  ('dried-cashew'                , 'Dried Cashew'                  , 'Processed Fruits'          , 'Small pack'           , 191),
  ('dried-apples'                , 'Dried Apples'                  , 'Processed Fruits'          , 'Small pack'           , 192),
  ('african-velvet-tamarind-awin', 'African Velvet Tamarind (Awin)', 'Processed Fruits'          , 'Small pack'           , 193),
  ('ground-egusi'                , 'Ground Egusi'                  , 'Processed Spices'          , 'Small pack'           , 194),
  ('ground-zobo-leaves'          , 'Ground Zobo Leaves'            , 'Processed Spices'          , 'Small pack'           , 195),
  ('alligator-pepper-powder'     , 'Alligator Pepper Powder'       , 'Processed Spices'          , 'Small pack'           , 196),
  ('ground-ogbono'               , 'Ground Ogbono'                 , 'Processed Spices'          , 'Small pack'           , 197),
  ('garlic-powder'               , 'Garlic Powder'                 , 'Processed Spices'          , 'Small pack'           , 198),
  ('ginger-powder'               , 'Ginger Powder'                 , 'Processed Spices'          , 'Small pack'           , 199),
  ('bay-leaf-powder'             , 'Bay Leaf Powder'               , 'Processed Spices'          , 'Small pack'           , 200),
  ('cloves-powder'               , 'Cloves Powder'                 , 'Processed Spices'          , 'Small pack'           , 201),
  ('nutmeg-powder'               , 'Nutmeg Powder'                 , 'Processed Spices'          , 'Small pack'           , 202),
  ('cinnamon-powder'             , 'Cinnamon Powder'               , 'Processed Spices'          , 'Small pack'           , 203),
  ('rosemary-powder'             , 'Rosemary Powder'               , 'Processed Spices'          , 'Small pack'           , 204),
  ('white-pepper-powder'         , 'White Pepper Powder'           , 'Processed Spices'          , 'Small pack'           , 205),
  ('turmeric-powder'             , 'Turmeric Powder'               , 'Processed Spices'          , 'Small pack'           , 206),
  ('dried-basil-powder'          , 'Dried Basil Powder'            , 'Processed Spices'          , 'Small pack'           , 207),
  ('soya-bean-flour'             , 'Soya Bean Flour'               , 'Processed Legumes & Nuts'  , 'Small pack'           , 208),
  ('beans-flour'                 , 'Beans Flour'                   , 'Processed Legumes & Nuts'  , 'Small pack'           , 209),
  ('black-eyed-beans-flour'      , 'Black Eyed Beans Flour'        , 'Processed Legumes & Nuts'  , 'Small pack'           , 210),
  ('bambara-nuts-flour'          , 'Bambara Nuts Flour'            , 'Processed Legumes & Nuts'  , 'Small pack'           , 211),
  ('sesame-flour'                , 'Sesame Flour'                  , 'Processed Legumes & Nuts'  , 'Small pack'           , 212),
  ('flaxseed-flour'              , 'Flaxseed Flour'                , 'Processed Legumes & Nuts'  , 'Small pack'           , 213),
  ('groundnut-paste'             , 'Groundnut Paste'               , 'Processed Legumes & Nuts'  , 'Small pack'           , 214),
  ('cashew-nut-paste'            , 'Cashew Nut Paste'              , 'Processed Legumes & Nuts'  , 'Small pack'           , 215),
  ('tiger-nut-paste'             , 'Tiger Nut Paste'               , 'Processed Legumes & Nuts'  , 'Small pack'           , 216),
  ('palm-oil'                    , 'Palm Oil'                      , 'Oils'                      , '1 litre bottle'       , 217),
  ('groundnut-oil'               , 'Groundnut Oil'                 , 'Oils'                      , '1 litre bottle'       , 218),
  ('vegetable-oil'               , 'Vegetable Oil'                 , 'Oils'                      , '1 litre bottle'       , 219),
  ('coconut-oil'                 , 'Coconut Oil'                   , 'Oils'                      , '1 litre bottle'       , 220),
  ('soya-oil'                    , 'Soya Oil'                      , 'Oils'                      , '1 litre bottle'       , 221),
  ('chilli-oil'                  , 'Chilli Oil'                    , 'Oils'                      , '1 litre bottle'       , 222),
  ('beef-with-bone'              , 'Beef (with bone)'              , 'Meat'                      , '1 kg'                 , 223),
  ('beef-boneless'               , 'Beef (boneless)'               , 'Meat'                      , '1 kg'                 , 224),
  ('cow-leg-bokoto'              , 'Cow Leg (Bokoto)'              , 'Meat'                      , 'Per piece'            , 225),
  ('shaki-tripe'                 , 'Shaki (Tripe)'                 , 'Meat'                      , '1 kg'                 , 226),
  ('ponmo-cow-skin'              , 'Ponmo (Cow Skin)'              , 'Meat'                      , 'Per piece'            , 227),
  ('cow-liver'                   , 'Cow Liver'                     , 'Meat'                      , '1 kg'                 , 228),
  ('cow-kidney'                  , 'Cow Kidney'                    , 'Meat'                      , '1 kg'                 , 229),
  ('cow-tail'                    , 'Cow Tail'                      , 'Meat'                      , '1 kg'                 , 230),
  ('goat-meat'                   , 'Goat Meat'                     , 'Meat'                      , '1 kg'                 , 231),
  ('ram-mutton'                  , 'Ram/Mutton'                    , 'Meat'                      , '1 kg'                 , 232),
  ('pork'                        , 'Pork'                          , 'Meat'                      , '1 kg'                 , 233),
  ('assorted-offal'              , 'Assorted Offal'                , 'Meat'                      , '1 kg'                 , 234),
  ('broiler-chicken-live'        , 'Broiler Chicken (live)'        , 'Poultry'                   , 'Per bird'             , 235),
  ('broiler-chicken-dressed'     , 'Broiler Chicken (dressed)'     , 'Poultry'                   , 'Per bird'             , 236),
  ('old-layer'                   , 'Old Layer'                     , 'Poultry'                   , 'Per bird'             , 237),
  ('cockerel'                    , 'Cockerel'                      , 'Poultry'                   , 'Per bird'             , 238),
  ('local-chicken'               , 'Local Chicken'                 , 'Poultry'                   , 'Per bird'             , 239),
  ('turkey-live'                 , 'Turkey (live)'                 , 'Poultry'                   , 'Per bird'             , 240),
  ('whole-turkey-frozen'         , 'Whole Turkey (frozen)'         , 'Poultry'                   , '1 kg'                 , 241),
  ('duck'                        , 'Duck'                          , 'Poultry'                   , 'Per bird'             , 242),
  ('guinea-fowl'                 , 'Guinea Fowl'                   , 'Poultry'                   , 'Per bird'             , 243),
  ('chicken-eggs'                , 'Chicken Eggs'                  , 'Eggs'                      , 'Crate of 30'          , 244),
  ('quail-eggs'                  , 'Quail Eggs'                    , 'Eggs'                      , 'Pack of 20'           , 245),
  ('titus-mackerel-frozen'       , 'Titus (Mackerel, frozen)'      , 'Fish & Seafood'            , '1 kg'                 , 246),
  ('kote-croaker-frozen'         , 'Kote (Croaker, frozen)'        , 'Fish & Seafood'            , '1 kg'                 , 247),
  ('panla-hake-frozen'           , 'Panla (Hake, frozen)'          , 'Fish & Seafood'            , '1 kg'                 , 248),
  ('sardine-frozen'              , 'Sardine (frozen)'              , 'Fish & Seafood'            , '1 kg'                 , 249),
  ('prawns-frozen'               , 'Prawns (frozen)'               , 'Fish & Seafood'            , '1 kg'                 , 250),
  ('shrimp-frozen'               , 'Shrimp (frozen)'               , 'Fish & Seafood'            , '1 kg'                 , 251),
  ('catfish-fresh'               , 'Catfish (fresh)'               , 'Fish & Seafood'            , '1 kg'                 , 253),
  ('tilapia-fresh'               , 'Tilapia (fresh)'               , 'Fish & Seafood'            , '1 kg'                 , 254),
  ('dried-fish-eja-gbigbe'       , 'Dried Fish (Eja Gbigbe)'       , 'Fish & Seafood'            , 'Paint bucket'         , 255),
  ('stockfish-head'              , 'Stockfish Head'                , 'Fish & Seafood'            , 'Paint bucket'         , 256),
  ('stockfish-body'              , 'Stockfish Body'                , 'Fish & Seafood'            , 'Paint bucket'         , 257),
  ('crayfish'                    , 'Crayfish'                      , 'Fish & Seafood'            , 'Paint bucket'         , 258),
  ('periwinkle'                  , 'Periwinkle'                    , 'Fish & Seafood'            , 'Paint bucket'         , 259),
  ('snails-big'                  , 'Snails (Big)'                  , 'Fish & Seafood'            , 'Per piece'            , 260),
  ('snails-medium'               , 'Snails (Medium)'               , 'Fish & Seafood'            , 'Per piece'            , 261),
  ('whole-chicken-frozen'        , 'Whole Chicken (frozen)'        , 'Poultry'                   , '1 kg'                 , 262),
  ('chicken-laps-thighs-frozen'  , 'Chicken Laps/Thighs (frozen)'  , 'Poultry'                   , '1 kg'                 , 263),
  ('chicken-wings-frozen'        , 'Chicken Wings (frozen)'        , 'Poultry'                   , '1 kg'                 , 264),
  ('chicken-breast-frozen'       , 'Chicken Breast (frozen)'       , 'Poultry'                   , '1 kg'                 , 265),
  ('turkey-laps-thighs-frozen'   , 'Turkey Laps/Thighs (frozen)'   , 'Poultry'                   , '1 kg'                 , 266),
  ('turkey-wings-frozen'         , 'Turkey Wings (frozen)'         , 'Poultry'                   , '1 kg'                 , 267),
  ('turkey-breast-frozen'        , 'Turkey Breast (frozen)'        , 'Poultry'                   , '1 kg'                 , 268)
    ) as v (slug, canonical_name, category, retail_unit, display_order)
join units u on u.name = v.retail_unit
on conflict (slug) do nothing;


-- ----------------------------------------------------------------------------
-- commodities -- the 77 the Lagos tracker adds
--
-- Source: data/tracker-map.json, the reviewed mapping from the tracker's 244
-- (Product, Variety) keys to database commodities, settled with the project
-- owner on 2026-09-30. 0045_tracker_commodities.sql carries the same rows and
-- its header carries the evidence: how `category` was inherited from each row's
-- existing catalogue neighbours, why `display_order` is appended from 269 rather
-- than curated, and which single row (ugwu-leaf-shredded) takes its default unit
-- from the first portion listed because column A is blank on all of its tracker
-- rows. This file carries the same end state so a fresh database is born with
-- them rather than patched into them.
--
-- Ayoo (confirm species) is the one tracker key still unresolved. It has no slug,
-- it is NOT here, and the importer refuses its rows.
--
-- Units are joined by name, so no UUID is hardcoded. The join is inner: without
-- 0044's units this inserts nothing rather than inserting a wrong unit.
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
-- The corrections the tracker review settled, 2026-09-30
--
-- Identical to sections 1, 2, 3 and 5 of 0045_tracker_commodities.sql, which
-- carries the reasoning for every one of them -- including why a slug is never
-- changed even when it is wrong (kote-croaker-frozen is a horse mackerel, and
-- keeps the word "croaker" forever, because the slug is the series key its
-- published observations hang off).
--
-- The 266-row VALUES list above is deliberately NOT edited. It is generated from
-- data/marketprices-products.csv, pinned by the sha256 in this file's header, and
-- it stays the record of what the source sheet actually said -- the same reason it
-- still reads "Paint bucket" for okro, ginger and garlic-local. Corrections
-- arrive as statements, exactly as 0039 and 0040 already do.
--
-- Nothing is ever deleted: guinea-corn-flour and yellow-red-pepper are
-- deactivated, because a commodity id is referenced by price_observations and a
-- delete would orphan a price.
--
-- Every statement is guarded and idempotent, so this block is inert on a second
-- run and inert after 0045 has already run against a database that was not reset.
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


-- The merge: guinea-corn-flour folded into sorghum-flour.

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


-- Retire yellow-red-pepper. Never deleted, never reused.

update commodities
   set is_active  = false,
       is_tracked = false,
       updated_at = now()
 where slug = 'yellow-red-pepper'
   and is_active;


-- Tracking.

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


-- ----------------------------------------------------------------------------
-- editorial_rules -- seed rules (P0.1 permits these; P16.2 versions them)
--
-- ingest/magnitude_ratio: how many times a submitted price may differ from the
-- last published one for the same commodity and tier before /api/ingest/price
-- flags it `outlier` for a human glance. A flag is advisory -- the row still
-- enters the review queue as `pending` and nothing is rejected on this basis.
--
-- 4, confirmed by the user on 2026-09-07: they would rather a human glance at a
-- real price swing than let a plausible extra zero through unnoticed. The
-- worked example in the build plan is a factor of 10 (₦950,000 typed for a
-- ₦95,000 commodity), but a threshold of 10 catches only exact
-- order-of-magnitude slips and passes a ₦95,000 -> ₦400,000 typo unflagged.
--
-- THIS IS NOT A DISPLAYED FIGURE. It is a control threshold; nothing renders
-- it, and no price, week or count is being asserted here (P0.2 stands).
--
-- lib/validation/ingest.ts carries NO fallback value. If this row is missing,
-- intake refuses submissions with 503 threshold_unavailable rather than storing
-- rows whose outlier check silently did not run.
--
-- changed_by is null: the table comment reserves that for exactly this initial
-- seed path, which does not go through set_editorial_rule() and has no staff
-- member behind it. Every later change to this value must go through that
-- function, which retires version 1 and inserts version 2 in one transaction.
--
-- The conflict target is the TOTAL unique index (scope, key, version), not the
-- partial active one. That is what makes a re-run inert after a human has
-- bumped the value: version 1 still exists as the retired row, the insert
-- conflicts, and nothing is resurrected or duplicated.
-- ----------------------------------------------------------------------------

insert into editorial_rules (scope, key, value, version, is_active)
values ('ingest', 'magnitude_ratio', '4'::jsonb, 1, true)
on conflict (scope, key, version) do nothing;

commit;
