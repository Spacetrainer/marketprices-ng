-- 0001_extensions.sql
-- MarketPrices — Stage 2, migration batch 1
--
-- uuid-ossp: uuid_generate_v4() defaults for every primary key in the schema.
-- pg_trgm:   trigram matching — powers §5.7 /search fuzzy matching and the
--            commodity/collector alias lookups used by fusion (P5.8).
--
-- Both extensions are created in the `extensions` schema rather than `public`,
-- per Supabase convention — keeps the public schema free of extension-owned
-- objects and matches what `supabase gen types` expects.

create schema if not exists extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists "pg_trgm"   with schema extensions;