-- 0015_article_type_data.sql
-- MarketPrices — Stage 2, migration batch 4
--
-- Widens articles.type to admit the third article type, 'data'.
--
-- 0013_articles.sql shipped this column with two values, 'standard' and
-- 'video'. That was wrong. §1.2 states the flag as `standard | video | data`,
-- and §1.3's article-types table gives 'data' its own row with a defined card
-- treatment ("chart or table preview instead of a photo") and a defined body
-- ("rich text + embedded price widget"). §9.1 does not enumerate the values at
-- all, so §1.2 and §1.3 are the only sources for them and both say three.
--
-- WHY THIS IS A SEPARATE MIGRATION AND NOT AN EDIT TO 0013. 0013 is applied —
-- `supabase migration list` shows it under Remote, and the repo carries it as
-- commit 02f4a40. An applied migration is never edited; the history of what the
-- database was told is not rewritten to match what we wish we had told it. The
-- record that articles briefly admitted only two types is honest history, in
-- the same sense 0012 accepts a stillborn basket version.
--
-- THE CONSTRAINT NAME IS NOT GUESSED. 0013 wrote the check inline on the
-- column, so Postgres generated the name. It was read back off the live
-- database before this file was written:
--
--   conname            | articles_type_check
--   pg_get_constraintdef| CHECK ((type = ANY (ARRAY['standard'::text, 'video'::text])))
--
-- The name is deliberately REUSED below rather than replaced with a hand-picked
-- one. A future reader looking for the type rule should find it where 0013 and
-- every error message already point, not under a second name introduced by a
-- patch.
--
-- No IF EXISTS on the drop. If the constraint is not there, this migration
-- should fail loudly rather than proceed against a database that is not the one
-- this file was written for.
--
-- This cannot fail on existing rows. The new value set is a strict superset of
-- the old one, so every row that satisfied the old check satisfies the new one;
-- the revalidation Postgres runs on ADD CONSTRAINT is a formality here.
--
-- NOTHING ELSE IN 0013 NEEDS TO MOVE, and both near-misses were checked:
--
--   * articles_check1 — `type <> 'video' or youtube_id is not null` — is
--     unaffected. A 'data' article is not 'video', so it is not required to
--     carry a youtube_id, which is correct.
--
--   * header_media_id stays NOT NULL for a data article. §1.3's "instead of a
--     photo" describes the CARD treatment, not the header; §1.4's "every
--     content item carries a designed graphical header, rendered from a
--     template against bound data" is unqualified, and a chart or table
--     rendered from bound data is precisely that. There is no exemption here
--     and none is created.

alter table articles
  drop constraint articles_type_check;

alter table articles
  add constraint articles_type_check
  check (type in ('standard', 'video', 'data'));
