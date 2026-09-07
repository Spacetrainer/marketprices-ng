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
--   261 data rows, filtered to unit_source = 'Template' -> 201 products
--   across 16 categories, using 8 distinct units.
--
-- The 60 'Proposed - confirm' rows are deliberately absent, filtered PER ROW on
-- unit_source and not by category: five categories (Fish & Seafood, Meat,
-- Poultry, Oils, Eggs = 45 rows) are entirely proposed, but Fruits and Tubers
-- are split, and 15 further rows -- the products sold as single items rather
-- than by container -- drop out of categories that are otherwise included.
-- Filtering by category would have wrongly seeded those 15.
--
-- DEPENDS ON TWO MIGRATIONS. This file will fail loudly without both:
--   0036 -- units.base_multiplier nullable. Every one of the 8 units below is
--          non-metric and has no weight anywhere in the source file (both
--          size/weight columns are empty on all 261 rows). Under the old NOT
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
--   1. is_tracked is FALSE for all 201 rows. False means "cataloged, not
--      committed to weekly collection" -- the honest default. Setting it true
--      asserts that someone prices this commodity every week, which is an
--      editorial commitment, not a property of the source file. The tracked
--      set is one UPDATE once it is chosen:
--        update commodities set is_tracked = true where slug in (...);
--
--   2. base_multiplier is NULL on every unit. Null means "not yet weighed", not
--      1. Nothing may convert across these units until real weights come back
--      from the field (see 0036).
--
--   3. units.abbreviation is the ONE value in this file that is not in the
--      source CSV. The column is NOT NULL UNIQUE and the sheet carries no
--      abbreviations, so the eight below are derived from the unit names and
--      are the only thing here worth a second read before it ships. They are
--      display shorthand, nothing computes on them.
--
-- NOT SEEDED. collection_sites is deliberately empty -- the source sheet
-- dropped per-market tracking and names no real sites, and a site name renders
-- as provenance on every price (P1.6). It waits for real names. Note that
-- price_submissions.collection_site_id is NOT NULL, so no submission can be
-- accepted until at least one real site exists.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- units -- the 8 actually used by the seeded products
--
-- Only these eight, not all 25 in the source file. The other 17 belong solely
-- to the excluded rows, and `units` has NO is_active column -- unlike
-- commodities and collection_sites, a unit cannot be retired once it exists.
-- generate-form-options.ts reads the whole table, so seeding all 25 would put
-- '1 kg' and 'Carton (20 kg)' permanently in front of a collector pricing a
-- commodity whose entire series is measured in paint buckets. They arrive with
-- the migration that confirms Meat, Poultry, Eggs, Fish and Oils.
--
-- base_multiplier is omitted from the column list rather than written as NULL:
-- the column has no default, so omitting it stores NULL, and writing it out
-- would read like a value was considered.
-- ----------------------------------------------------------------------------

insert into units (name, abbreviation) values
  ('Big basket'              , 'basket'),
  ('Big bundle'              , 'bg bundle'),
  ('Big pack'                , 'bg pack'),
  ('Paint bucket'            , 'bucket'),
  ('Plate'                   , 'plate'),
  ('Sack'                    , 'sack'),
  ('Small bundle'            , 'sm bundle'),
  ('Small pack'              , 'sm pack')
on conflict (name) do nothing;


-- ----------------------------------------------------------------------------
-- commodities -- 201 products
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
-- display_order is the source file's own MP-#### sequence, gaps included. The
-- gaps are the 60 excluded rows, so when they are confirmed they slot back into
-- their original positions without renumbering anything already seeded.
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
  ('soko-nigerian-spinach'                 , 'Soko (Nigerian Spinach)'               , 'Leafy Vegetables'            , 'Small bundle'  ,   1),
  ('tete-amaranth-green'                   , 'Tete (Amaranth Green)'                 , 'Leafy Vegetables'            , 'Small bundle'  ,   2),
  ('ewuro-bitter-leaf'                     , 'Ewuro (Bitter Leaf)'                   , 'Leafy Vegetables'            , 'Small bundle'  ,   3),
  ('water-leaf'                            , 'Water Leaf'                            , 'Leafy Vegetables'            , 'Small bundle'  ,   4),
  ('scent-leaf-basil'                      , 'Scent Leaf (Basil)'                    , 'Leafy Vegetables'            , 'Small bundle'  ,   5),
  ('ugwu-leaf-fluted-pumpkin'              , 'Ugwu Leaf (Fluted Pumpkin)'            , 'Leafy Vegetables'            , 'Small bundle'  ,   6),
  ('uziza-leaf-piper-guineense'            , 'Uziza Leaf (Piper Guineense)'          , 'Leafy Vegetables'            , 'Small bundle'  ,   7),
  ('okazi-leaf-wild-spinach'               , 'Okazi Leaf (Wild Spinach)'             , 'Leafy Vegetables'            , 'Small bundle'  ,   8),
  ('ewedu'                                 , 'Ewedu'                                 , 'Leafy Vegetables'            , 'Small bundle'  ,   9),
  ('atama-leaves'                          , 'Atama Leaves'                          , 'Leafy Vegetables'            , 'Small bundle'  ,  10),
  ('editan-leaf'                           , 'Editan Leaf'                           , 'Leafy Vegetables'            , 'Small bundle'  ,  11),
  ('kale'                                  , 'Kale'                                  , 'Leafy Vegetables'            , 'Small bundle'  ,  12),
  ('coriander-leaf'                        , 'Coriander Leaf'                        , 'Leafy Vegetables'            , 'Small bundle'  ,  13),
  ('celery-leaf'                           , 'Celery Leaf'                           , 'Leafy Vegetables'            , 'Small bundle'  ,  14),
  ('rodo-scotch-bonnet'                    , 'Rodo (Scotch Bonnet)'                  , 'Peppers'                     , 'Paint bucket'  ,  15),
  ('tatase-bell-pepper'                    , 'Tatase (Bell Pepper)'                  , 'Peppers'                     , 'Paint bucket'  ,  16),
  ('shombo-cayenne-pepper'                 , 'Shombo (Cayenne Pepper)'               , 'Peppers'                     , 'Paint bucket'  ,  17),
  ('tomato-hausa-yoruba'                   , 'Tomato (Hausa/Yoruba)'                 , 'Peppers'                     , 'Paint bucket'  ,  18),
  ('green-pepper-bell'                     , 'Green Pepper (Bell)'                   , 'Peppers'                     , 'Paint bucket'  ,  19),
  ('yellow-red-pepper'                     , 'Yellow/Red Pepper'                     , 'Peppers'                     , 'Paint bucket'  ,  20),
  ('peppercorn'                            , 'Peppercorn'                            , 'Peppers'                     , 'Paint bucket'  ,  21),
  ('alligator-pepper'                      , 'Alligator Pepper'                      , 'Peppers'                     , 'Paint bucket'  ,  22),
  ('chilli-pepper-green-habanero'          , 'Chilli Pepper Green (Habanero)'        , 'Peppers'                     , 'Paint bucket'  ,  23),
  ('chilli-pepper-red-habanero'            , 'Chilli Pepper Red (Habanero)'          , 'Peppers'                     , 'Paint bucket'  ,  24),
  ('leek'                                  , 'Leek'                                  , 'Vegetables'                  , 'Paint bucket'  ,  25),
  ('lemon-grass'                           , 'Lemon Grass'                           , 'Vegetables'                  , 'Paint bucket'  ,  26),
  ('carrot'                                , 'Carrot'                                , 'Vegetables'                  , 'Paint bucket'  ,  27),
  ('okro'                                  , 'Okro'                                  , 'Vegetables'                  , 'Paint bucket'  ,  28),
  ('cabbage-green'                         , 'Cabbage Green'                         , 'Vegetables'                  , 'Paint bucket'  ,  29),
  ('cabbage-red'                           , 'Cabbage Red'                           , 'Vegetables'                  , 'Paint bucket'  ,  30),
  ('lettuce'                               , 'Lettuce'                               , 'Vegetables'                  , 'Paint bucket'  ,  31),
  ('cauliflower'                           , 'Cauliflower'                           , 'Vegetables'                  , 'Paint bucket'  ,  32),
  ('garden-egg-green'                      , 'Garden Egg Green'                      , 'Vegetables'                  , 'Paint bucket'  ,  33),
  ('garden-egg-white'                      , 'Garden Egg White'                      , 'Vegetables'                  , 'Paint bucket'  ,  34),
  ('watercress'                            , 'Watercress'                            , 'Vegetables'                  , 'Paint bucket'  ,  35),
  ('spring-onion'                          , 'Spring Onion'                          , 'Vegetables'                  , 'Paint bucket'  ,  36),
  ('broccoli'                              , 'Broccoli'                              , 'Vegetables'                  , 'Paint bucket'  ,  37),
  ('beetroot'                              , 'Beetroot'                              , 'Tubers'                      , 'Paint bucket'  ,  38),
  ('cocoyam'                               , 'Cocoyam'                               , 'Tubers'                      , 'Paint bucket'  ,  39),
  ('sweet-potatoes'                        , 'Sweet Potatoes'                        , 'Tubers'                      , 'Paint bucket'  ,  40),
  ('irish-potatoes'                        , 'Irish Potatoes'                        , 'Tubers'                      , 'Paint bucket'  ,  41),
  ('cassava'                               , 'Cassava'                               , 'Tubers'                      , 'Paint bucket'  ,  42),
  ('maize-yellow'                          , 'Maize Yellow'                          , 'Grains'                      , 'Paint bucket'  ,  46),
  ('maize-white'                           , 'Maize White'                           , 'Grains'                      , 'Paint bucket'  ,  47),
  ('wheat-local'                           , 'Wheat Local'                           , 'Grains'                      , 'Paint bucket'  ,  48),
  ('wheat-imported'                        , 'Wheat Imported'                        , 'Grains'                      , 'Paint bucket'  ,  49),
  ('rice-short-grain'                      , 'Rice Short Grain'                      , 'Grains'                      , 'Paint bucket'  ,  50),
  ('rice-long-grain'                       , 'Rice Long Grain'                       , 'Grains'                      , 'Paint bucket'  ,  51),
  ('ofada-rice'                            , 'Ofada Rice'                            , 'Grains'                      , 'Paint bucket'  ,  52),
  ('millet'                                , 'Millet'                                , 'Grains'                      , 'Paint bucket'  ,  53),
  ('guinea-corn-white-sorghum'             , 'Guinea Corn White (Sorghum)'           , 'Grains'                      , 'Paint bucket'  ,  54),
  ('guinea-corn-red-sorghum'               , 'Guinea Corn Red (Sorghum)'             , 'Grains'                      , 'Paint bucket'  ,  55),
  ('barley'                                , 'Barley'                                , 'Grains'                      , 'Paint bucket'  ,  56),
  ('oats'                                  , 'Oats'                                  , 'Grains'                      , 'Paint bucket'  ,  57),
  ('quinoa'                                , 'Quinoa'                                , 'Grains'                      , 'Paint bucket'  ,  58),
  ('kiwi'                                  , 'Kiwi'                                  , 'Fruits'                      , 'Plate'         ,  71),
  ('plantain-ripe'                         , 'Plantain Ripe'                         , 'Fruits'                      , 'Plate'         ,  72),
  ('plantain-unripe'                       , 'Plantain Unripe'                       , 'Fruits'                      , 'Plate'         ,  73),
  ('african-pear'                          , 'African Pear'                          , 'Fruits'                      , 'Plate'         ,  74),
  ('cucumber'                              , 'Cucumber'                              , 'Fruits'                      , 'Plate'         ,  75),
  ('avocado-unripe'                        , 'Avocado Unripe'                        , 'Fruits'                      , 'Plate'         ,  76),
  ('avocado-ripe'                          , 'Avocado Ripe'                          , 'Fruits'                      , 'Plate'         ,  77),
  ('eggplant'                              , 'Eggplant'                              , 'Fruits'                      , 'Plate'         ,  78),
  ('guava'                                 , 'Guava'                                 , 'Fruits'                      , 'Plate'         ,  79),
  ('tamarind'                              , 'Tamarind'                              , 'Fruits'                      , 'Plate'         ,  80),
  ('star-fruit'                            , 'Star Fruit'                            , 'Fruits'                      , 'Plate'         ,  81),
  ('dragon-fruit'                          , 'Dragon Fruit'                          , 'Fruits'                      , 'Plate'         ,  82),
  ('tigernut'                              , 'Tigernut'                              , 'Fruits'                      , 'Plate'         ,  83),
  ('oranges'                               , 'Oranges'                               , 'Fruits'                      , 'Plate'         ,  84),
  ('grape'                                 , 'Grape'                                 , 'Fruits'                      , 'Plate'         ,  85),
  ('passion-fruit'                         , 'Passion Fruit'                         , 'Fruits'                      , 'Plate'         ,  86),
  ('tangerine-local'                       , 'Tangerine Local'                       , 'Fruits'                      , 'Plate'         ,  87),
  ('tangelo-imported'                      , 'Tangelo Imported'                      , 'Fruits'                      , 'Plate'         ,  88),
  ('lemon'                                 , 'Lemon'                                 , 'Fruits'                      , 'Plate'         ,  89),
  ('limes'                                 , 'Limes'                                 , 'Fruits'                      , 'Plate'         ,  90),
  ('strawberry'                            , 'Strawberry'                            , 'Fruits'                      , 'Plate'         ,  91),
  ('raspberry'                             , 'Raspberry'                             , 'Fruits'                      , 'Plate'         ,  92),
  ('blackberry'                            , 'Blackberry'                            , 'Fruits'                      , 'Plate'         ,  93),
  ('dates'                                 , 'Dates'                                 , 'Fruits'                      , 'Plate'         ,  94),
  ('agbalumo'                              , 'Agbalumo'                              , 'Fruits'                      , 'Plate'         ,  95),
  ('banana-local-native'                   , 'Banana Local/Native'                   , 'Fruits'                      , 'Plate'         ,  96),
  ('banana-imported'                       , 'Banana Imported'                       , 'Fruits'                      , 'Plate'         ,  97),
  ('mango-sheri'                           , 'Mango Sheri'                           , 'Fruits'                      , 'Plate'         ,  98),
  ('mango-julie'                           , 'Mango Julie'                           , 'Fruits'                      , 'Plate'         ,  99),
  ('apricot'                               , 'Apricot'                               , 'Fruits'                      , 'Plate'         , 100),
  ('peaches'                               , 'Peaches'                               , 'Fruits'                      , 'Plate'         , 101),
  ('apple-green'                           , 'Apple Green'                           , 'Fruits'                      , 'Plate'         , 102),
  ('apple-red'                             , 'Apple Red'                             , 'Fruits'                      , 'Plate'         , 103),
  ('pomegranate'                           , 'Pomegranate'                           , 'Fruits'                      , 'Plate'         , 104),
  ('pear'                                  , 'Pear'                                  , 'Fruits'                      , 'Plate'         , 105),
  ('onions-red'                            , 'Onions Red'                            , 'Spices & Seeds'              , 'Paint bucket'  , 106),
  ('onions-white'                          , 'Onions White'                          , 'Spices & Seeds'              , 'Paint bucket'  , 107),
  ('melon-seed-egusi'                      , 'Melon Seed (Egusi)'                    , 'Spices & Seeds'              , 'Paint bucket'  , 108),
  ('cinnamon'                              , 'Cinnamon'                              , 'Spices & Seeds'              , 'Paint bucket'  , 109),
  ('locust-beans-iru'                      , 'Locust Beans (Iru)'                    , 'Spices & Seeds'              , 'Paint bucket'  , 110),
  ('zobo-leaves'                           , 'Zobo Leaves'                           , 'Spices & Seeds'              , 'Paint bucket'  , 111),
  ('thyme-leaf'                            , 'Thyme Leaf'                            , 'Spices & Seeds'              , 'Paint bucket'  , 112),
  ('ogbono-seed'                           , 'Ogbono Seed'                           , 'Spices & Seeds'              , 'Paint bucket'  , 113),
  ('banga-stick'                           , 'Banga Stick'                           , 'Spices & Seeds'              , 'Paint bucket'  , 114),
  ('garlic-local'                          , 'Garlic Local'                          , 'Spices & Seeds'              , 'Paint bucket'  , 115),
  ('garlic-imported'                       , 'Garlic Imported'                       , 'Spices & Seeds'              , 'Paint bucket'  , 116),
  ('ginger'                                , 'Ginger'                                , 'Spices & Seeds'              , 'Paint bucket'  , 117),
  ('bay-leaf'                              , 'Bay Leaf'                              , 'Spices & Seeds'              , 'Paint bucket'  , 118),
  ('cloves'                                , 'Cloves'                                , 'Spices & Seeds'              , 'Paint bucket'  , 119),
  ('nutmeg'                                , 'Nutmeg'                                , 'Spices & Seeds'              , 'Paint bucket'  , 120),
  ('rosemary'                              , 'Rosemary'                              , 'Spices & Seeds'              , 'Paint bucket'  , 121),
  ('turmeric'                              , 'Turmeric'                              , 'Spices & Seeds'              , 'Paint bucket'  , 122),
  ('ehuru'                                 , 'Ehuru'                                 , 'Spices & Seeds'              , 'Paint bucket'  , 123),
  ('ugba'                                  , 'Ugba'                                  , 'Spices & Seeds'              , 'Paint bucket'  , 124),
  ('ogiri'                                 , 'Ogiri'                                 , 'Spices & Seeds'              , 'Paint bucket'  , 125),
  ('uda-seed'                              , 'Uda Seed'                              , 'Spices & Seeds'              , 'Paint bucket'  , 126),
  ('moringa-leaf'                          , 'Moringa Leaf'                          , 'Spices & Seeds'              , 'Paint bucket'  , 127),
  ('red-kidney-beans'                      , 'Red Kidney Beans'                      , 'Beans & Nuts'                , 'Paint bucket'  , 128),
  ('soyabeans'                             , 'Soyabeans'                             , 'Beans & Nuts'                , 'Paint bucket'  , 129),
  ('beans-oloyin'                          , 'Beans Oloyin'                          , 'Beans & Nuts'                , 'Paint bucket'  , 130),
  ('beans-oloo'                            , 'Beans Oloo'                            , 'Beans & Nuts'                , 'Paint bucket'  , 131),
  ('groundnut-uncooked'                    , 'Groundnut Uncooked'                    , 'Beans & Nuts'                , 'Paint bucket'  , 132),
  ('black-eyed-beans'                      , 'Black Eyed Beans'                      , 'Beans & Nuts'                , 'Paint bucket'  , 133),
  ('bambara-nuts-okpa'                     , 'Bambara Nuts (Okpa)'                   , 'Beans & Nuts'                , 'Paint bucket'  , 134),
  ('lentils'                               , 'Lentils'                               , 'Beans & Nuts'                , 'Paint bucket'  , 135),
  ('rye-grain'                             , 'Rye Grain'                             , 'Beans & Nuts'                , 'Paint bucket'  , 136),
  ('sesame-seed'                           , 'Sesame Seed'                           , 'Beans & Nuts'                , 'Paint bucket'  , 137),
  ('flaxseed'                              , 'Flaxseed'                              , 'Beans & Nuts'                , 'Paint bucket'  , 138),
  ('runner-beans'                          , 'Runner Beans'                          , 'Beans & Nuts'                , 'Paint bucket'  , 139),
  ('cashew-nut'                            , 'Cashew Nut'                            , 'Beans & Nuts'                , 'Paint bucket'  , 140),
  ('african-walnut-asala'                  , 'African Walnut (Asala)'                , 'Beans & Nuts'                , 'Paint bucket'  , 141),
  ('dried-soko'                            , 'Dried Soko'                            , 'Processed Leafy Vegetables'  , 'Small pack'    , 142),
  ('dried-tete'                            , 'Dried Tete'                            , 'Processed Leafy Vegetables'  , 'Small pack'    , 143),
  ('dried-bitter-leaf'                     , 'Dried Bitter Leaf'                     , 'Processed Leafy Vegetables'  , 'Small pack'    , 144),
  ('dried-water-leaf'                      , 'Dried Water Leaf'                      , 'Processed Leafy Vegetables'  , 'Small pack'    , 145),
  ('dried-scent-leaf'                      , 'Dried Scent Leaf'                      , 'Processed Leafy Vegetables'  , 'Small pack'    , 146),
  ('dried-ugwu'                            , 'Dried Ugwu'                            , 'Processed Leafy Vegetables'  , 'Small pack'    , 147),
  ('dried-uziza'                           , 'Dried Uziza'                           , 'Processed Leafy Vegetables'  , 'Small pack'    , 148),
  ('dried-ukazi'                           , 'Dried Ukazi'                           , 'Processed Leafy Vegetables'  , 'Small pack'    , 149),
  ('dried-ewedu'                           , 'Dried Ewedu'                           , 'Processed Leafy Vegetables'  , 'Small pack'    , 150),
  ('blended-rodo'                          , 'Blended Rodo'                          , 'Processed Peppers'           , 'Small pack'    , 151),
  ('blended-tatase'                        , 'Blended Tatase'                        , 'Processed Peppers'           , 'Small pack'    , 152),
  ('blended-shombo'                        , 'Blended Shombo'                        , 'Processed Peppers'           , 'Small pack'    , 153),
  ('blended-tomato'                        , 'Blended Tomato'                        , 'Processed Peppers'           , 'Small pack'    , 154),
  ('dried-habanero-pepper'                 , 'Dried Habanero Pepper'                 , 'Processed Peppers'           , 'Small pack'    , 155),
  ('dried-red-pepper'                      , 'Dried Red Pepper'                      , 'Processed Peppers'           , 'Small pack'    , 156),
  ('dried-cayenne-pepper'                  , 'Dried Cayenne Pepper'                  , 'Processed Peppers'           , 'Small pack'    , 157),
  ('dried-black-pepper'                    , 'Dried Black Pepper'                    , 'Processed Peppers'           , 'Small pack'    , 158),
  ('ground-dried-okro'                     , 'Ground Dried Okro'                     , 'Processed Vegetables'        , 'Small pack'    , 159),
  ('dried-cabbage'                         , 'Dried Cabbage'                         , 'Processed Vegetables'        , 'Small pack'    , 160),
  ('dried-cauliflower'                     , 'Dried Cauliflower'                     , 'Processed Vegetables'        , 'Small pack'    , 161),
  ('dried-garden-egg'                      , 'Dried Garden Egg'                      , 'Processed Vegetables'        , 'Small pack'    , 162),
  ('dried-watercress'                      , 'Dried Watercress'                      , 'Processed Vegetables'        , 'Small pack'    , 163),
  ('dried-spring-onion'                    , 'Dried Spring Onion'                    , 'Processed Vegetables'        , 'Small pack'    , 164),
  ('dried-coriander-leaves'                , 'Dried Coriander Leaves'                , 'Processed Vegetables'        , 'Small pack'    , 165),
  ('dried-lettuce'                         , 'Dried Lettuce'                         , 'Processed Vegetables'        , 'Small pack'    , 166),
  ('yam-flour-elubo-dudu'                  , 'Yam Flour (Elubo Dudu)'                , 'Processed Tubers'            , 'Small pack'    , 167),
  ('cassava-flour-lafun'                   , 'Cassava Flour (Lafun)'                 , 'Processed Tubers'            , 'Small pack'    , 168),
  ('sweet-potato-flour'                    , 'Sweet Potato Flour'                    , 'Processed Tubers'            , 'Small pack'    , 169),
  ('irish-potato-flour'                    , 'Irish Potato Flour'                    , 'Processed Tubers'            , 'Small pack'    , 170),
  ('garri-yellow'                          , 'Garri Yellow'                          , 'Processed Tubers'            , 'Small pack'    , 171),
  ('garri-white'                           , 'Garri White'                           , 'Processed Tubers'            , 'Small pack'    , 172),
  ('garri-ijebu'                           , 'Garri Ijebu'                           , 'Processed Tubers'            , 'Small pack'    , 173),
  ('cocoyam-flour'                         , 'Cocoyam Flour'                         , 'Processed Tubers'            , 'Small pack'    , 174),
  ('fufu'                                  , 'Fufu'                                  , 'Processed Tubers'            , 'Small pack'    , 175),
  ('rice-flour'                            , 'Rice Flour'                            , 'Processed Grains'            , 'Small pack'    , 176),
  ('maize-flour'                           , 'Maize Flour'                           , 'Processed Grains'            , 'Small pack'    , 177),
  ('wheat-flour'                           , 'Wheat Flour'                           , 'Processed Grains'            , 'Small pack'    , 178),
  ('millet-flour'                          , 'Millet Flour'                          , 'Processed Grains'            , 'Small pack'    , 179),
  ('sorghum-flour'                         , 'Sorghum Flour'                         , 'Processed Grains'            , 'Small pack'    , 180),
  ('barley-flour'                          , 'Barley Flour'                          , 'Processed Grains'            , 'Small pack'    , 181),
  ('oats-flour'                            , 'Oats Flour'                            , 'Processed Grains'            , 'Small pack'    , 182),
  ('guinea-corn-flour'                     , 'Guinea Corn Flour'                     , 'Processed Grains'            , 'Small pack'    , 183),
  ('plantain-flour'                        , 'Plantain Flour'                        , 'Processed Fruits'            , 'Small pack'    , 184),
  ('dried-mango'                           , 'Dried Mango'                           , 'Processed Fruits'            , 'Small pack'    , 185),
  ('dried-orange'                          , 'Dried Orange'                          , 'Processed Fruits'            , 'Small pack'    , 186),
  ('dried-pineapple'                       , 'Dried Pineapple'                       , 'Processed Fruits'            , 'Small pack'    , 187),
  ('dried-watermelon'                      , 'Dried Watermelon'                      , 'Processed Fruits'            , 'Small pack'    , 188),
  ('dried-guava'                           , 'Dried Guava'                           , 'Processed Fruits'            , 'Small pack'    , 189),
  ('dried-coconut'                         , 'Dried Coconut'                         , 'Processed Fruits'            , 'Small pack'    , 190),
  ('dried-cashew'                          , 'Dried Cashew'                          , 'Processed Fruits'            , 'Small pack'    , 191),
  ('dried-apples'                          , 'Dried Apples'                          , 'Processed Fruits'            , 'Small pack'    , 192),
  ('african-velvet-tamarind-awin'          , 'African Velvet Tamarind (Awin)'        , 'Processed Fruits'            , 'Small pack'    , 193),
  ('ground-egusi'                          , 'Ground Egusi'                          , 'Processed Spices'            , 'Small pack'    , 194),
  ('ground-zobo-leaves'                    , 'Ground Zobo Leaves'                    , 'Processed Spices'            , 'Small pack'    , 195),
  ('alligator-pepper-powder'               , 'Alligator Pepper Powder'               , 'Processed Spices'            , 'Small pack'    , 196),
  ('ground-ogbono'                         , 'Ground Ogbono'                         , 'Processed Spices'            , 'Small pack'    , 197),
  ('garlic-powder'                         , 'Garlic Powder'                         , 'Processed Spices'            , 'Small pack'    , 198),
  ('ginger-powder'                         , 'Ginger Powder'                         , 'Processed Spices'            , 'Small pack'    , 199),
  ('bay-leaf-powder'                       , 'Bay Leaf Powder'                       , 'Processed Spices'            , 'Small pack'    , 200),
  ('cloves-powder'                         , 'Cloves Powder'                         , 'Processed Spices'            , 'Small pack'    , 201),
  ('nutmeg-powder'                         , 'Nutmeg Powder'                         , 'Processed Spices'            , 'Small pack'    , 202),
  ('cinnamon-powder'                       , 'Cinnamon Powder'                       , 'Processed Spices'            , 'Small pack'    , 203),
  ('rosemary-powder'                       , 'Rosemary Powder'                       , 'Processed Spices'            , 'Small pack'    , 204),
  ('white-pepper-powder'                   , 'White Pepper Powder'                   , 'Processed Spices'            , 'Small pack'    , 205),
  ('turmeric-powder'                       , 'Turmeric Powder'                       , 'Processed Spices'            , 'Small pack'    , 206),
  ('dried-basil-powder'                    , 'Dried Basil Powder'                    , 'Processed Spices'            , 'Small pack'    , 207),
  ('soya-bean-flour'                       , 'Soya Bean Flour'                       , 'Processed Legumes & Nuts'    , 'Small pack'    , 208),
  ('beans-flour'                           , 'Beans Flour'                           , 'Processed Legumes & Nuts'    , 'Small pack'    , 209),
  ('black-eyed-beans-flour'                , 'Black Eyed Beans Flour'                , 'Processed Legumes & Nuts'    , 'Small pack'    , 210),
  ('bambara-nuts-flour'                    , 'Bambara Nuts Flour'                    , 'Processed Legumes & Nuts'    , 'Small pack'    , 211),
  ('sesame-flour'                          , 'Sesame Flour'                          , 'Processed Legumes & Nuts'    , 'Small pack'    , 212),
  ('flaxseed-flour'                        , 'Flaxseed Flour'                        , 'Processed Legumes & Nuts'    , 'Small pack'    , 213),
  ('groundnut-paste'                       , 'Groundnut Paste'                       , 'Processed Legumes & Nuts'    , 'Small pack'    , 214),
  ('cashew-nut-paste'                      , 'Cashew Nut Paste'                      , 'Processed Legumes & Nuts'    , 'Small pack'    , 215),
  ('tiger-nut-paste'                       , 'Tiger Nut Paste'                       , 'Processed Legumes & Nuts'    , 'Small pack'    , 216)
    ) as v (slug, canonical_name, category, retail_unit, display_order)
join units u on u.name = v.retail_unit
on conflict (slug) do nothing;


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
