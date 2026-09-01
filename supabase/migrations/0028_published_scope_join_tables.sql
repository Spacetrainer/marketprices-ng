-- ============================================================================
-- 0028_published_scope_join_tables.sql
-- Scope the two public join-table read policies to PUBLISHED articles, so that
-- a recall takes an article's satellite rows out of anon reach at the same
-- instant it takes the article itself.
--
-- Two tables, one defect, one fix shape:
--
--   article_tags_select_public    `using (true)`               -> scoped
--   homepage_pins_select_public   `using (expires_at > now())` -> scoped
--
-- plus ONE NEW POLICY, article_tags_select_staff, which is not optional and is
-- explained at length in section 2. Scoping the public policy without it would
-- take recalled articles' tags away from the editors whose job is to fix them.
-- That regression was measured, not guessed: check 7 in the transcript.
--
-- NOT AN EDIT TO 0014. It is applied. This is a fix-forward, the same posture
-- as 0023, 0024, 0025, 0026 and 0027.
--
--
-- ---------------------------------------------------------------------------
-- SECTION 1 -- article_tags: WHAT THE LEAK IS, AND WHY 0014's ARGUMENT FAILED
-- ---------------------------------------------------------------------------
--
-- 0014 wrote the unscoped policy deliberately and said why:
--
--     "Unscoped rather than restricted to published articles -- a subquery
--      against articles in a policy would run on every row of every tag-page
--      query, and it would buy very little: the tag page joins through to
--      articles anyway, where the published filter already applies. What an
--      anon reader can learn from this table alone is that some article id
--      carries some tag, with no way to read the article."
--
-- Both halves of that are wrong, and they are wrong in different ways.
--
-- THE SECURITY HALF. "No way to read the article" is true and irrelevant. The
-- threat is not reading the article, it is that the article ID IS NOT SECRET.
-- A recalled article was PUBLISHED first -- that is the only way to reach
-- `recalled`, because articles_status_check admits exactly two values and the
-- publish job writes the first. So its id was on the public site, in the feed,
-- in the sitemap, and in every social post that pointed at it. An anon client
-- that noted the id before the recall can afterwards ask this table which tags
-- it carries, and keep asking. What leaks is not the id, it is the EDITORIAL
-- STATE AROUND a piece that was withdrawn: which tags it carried, and -- since
-- re-tagging a live article is an ordinary human write per 0014's own note --
-- which tags were added or removed while it sat recalled. That is a record of
-- the newsroom's handling of a withdrawn story, readable by the public.
--
-- THE COST HALF. "Would run on every row of every tag-page query" overstates
-- it. The subquery is an equality probe on articles' PRIMARY KEY, so it is one
-- index lookup per candidate row, and the tag page's own join to articles has
-- already brought those exact heap pages in. This is not a sequential scan
-- hiding in a policy. Correctness is bought cheaply here, and would be worth
-- buying dearly.
--
-- THE PRINCIPLE THIS RESTORES is 0013's, written on articles_select_public and
-- never carried across to the join tables:
--
--     "A recalled article is not merely unrendered -- it is unreachable by an
--      anon client, so no future page, embed, feed or API route can surface
--      one by forgetting to filter."
--
-- article_tags is precisely a route that could forget to filter. A tag page
-- written as `select tag_id, article_id from article_tags where tag_id = $1`
-- and then hydrated in the application layer -- a perfectly ordinary thing to
-- write -- surfaces recalled ids today and is fail-closed after this file.
--
--
-- ---------------------------------------------------------------------------
-- SECTION 2 -- WHY article_tags_select_staff IS PART OF THIS FIX, NOT AN EXTRA
-- ---------------------------------------------------------------------------
--
-- article_tags IS THE ONLY ONE OF THE THREE P9.1 TABLES WITH NO STAFF SELECT
-- POLICY. articles has articles_select_staff. homepage_pins has
-- homepage_pins_select_staff. article_tags has insert_staff and delete_staff
-- and nothing for reads -- because when every read was `using (true)` there was
-- nothing for a staff policy to add. Staff have been reading this table through
-- the PUBLIC policy all along.
--
-- So scoping the public policy alone does not just close the leak, it closes it
-- ON STAFF TOO, and that breaks two things 0014 and 0013 both name:
--
--   - the Publish queue's list view IS the published-article library, and 0013
--     is explicit that "it cannot hide a recall from the people whose job is to
--     fix and re-publish it";
--   - §8.13's editor form carries a Tags multi-select and its Update control
--     opens a published item in that same form. An editor repairing a recalled
--     article would open it with its tags silently emptied, and saving would
--     look like a no-op while quietly meaning "remove every tag".
--
-- MEASURED, NOT ASSUMED. The verification transaction applies the scoped public
-- policy and stops there, then reads as an editor -- check 7, which returns 0
-- where check 18 (after this policy exists) returns 2. The regression is real
-- and this policy is what prevents it.
--
-- is_staff(), not is_admin_or_editor(): matching articles_select_staff exactly,
-- for its stated reason -- an Analyst reads the Dashboard's top-content table.
--
-- A NOTE ON POLICY SUBQUERIES AND RLS, because it is easy to misread the code
-- below. A table referenced inside a policy expression is itself subject to RLS
-- for the querying role. So for anon the `exists` clause is doubly filtered:
-- articles_select_public hides recalled rows before the explicit status test
-- ever sees them. The explicit `a.status = 'published'` is therefore redundant
-- FOR ANON TODAY and is written anyway, for two reasons. It is not redundant
-- for staff -- articles_select_staff shows them recalled rows, so without the
-- literal test the public policy would return true for a recalled article and
-- the staff policy would be doing no work. And it states the rule in the place
-- a reader looks for it, rather than making the rule an emergent property of
-- another table's policy set.
--
--
-- ---------------------------------------------------------------------------
-- SECTION 3 -- homepage_pins: THE SAME LEAK, CHECKED RATHER THAN ASSUMED
-- ---------------------------------------------------------------------------
--
-- It is the same leak. It is fixed here.
--
-- The finding, stated plainly: `using (expires_at > now())` tests the pin's own
-- clock and nothing about what it points at. A pin written before a recall
-- keeps its expiry -- nothing in the recall path touches it, because a recall
-- is an UPDATE to articles.status and the pin's ON DELETE CASCADE never fires.
-- So for up to the whole pin window (§1.5's default is 72h, and the value is an
-- editorial_rules setting that can be longer) anon can read a row saying that a
-- since-withdrawn article held position N on the homepage of section S, pinned
-- by profile P at time T. Confirmed as check 6.
--
-- WHY IT IS THE SAME SITUATION AND NOT A DIFFERENT ONE. 0014's own comment on
-- this policy makes the argument for me:
--
--     "An expired pin is unreachable by a public client, not merely ignored by
--      the query -- so a future homepage, feed or embed cannot promote a stale
--      pin by forgetting to filter, which is the same fail-closed shape as
--      basket_snapshots' `using (is_complete)`."
--
-- Every word of that applies to a recalled article, and the file only spent it
-- on the clock. A homepage that reads its pins and hydrates them without
-- re-testing article status promotes a withdrawn story into the most prominent
-- slot on the site. The policy fail-closes against staleness and fail-opens
-- against recall, which is half a rule.
--
-- TWO WAYS IT IS WORSE THAN article_tags, worth recording because they cut in
-- the opposite direction from the ordering of this file:
--
--   - it leaks more per row. article_tags leaks (article_id, tag_id). A pin
--     leaks position, section, expiry, and pinned_by -- a named staff member's
--     profile id attached to a curation decision about a withdrawn piece.
--   - 0014's cost objection never applied here at all. This table is "at most N
--     pins across seven sections" by that file's own reckoning, so the subquery
--     it declined to pay for on article_tags costs nothing whatever here.
--
-- ONE WAY IT IS EASIER. homepage_pins already has homepage_pins_select_staff,
-- so section 2's problem does not arise: staff keep seeing pins on recalled
-- articles, which a curation UI needs in order to explain why the homepage
-- changed. Confirmed as check 20. This is why the fix here is one policy and
-- the fix in section 1 is two.
--
-- THE TIME RULE IS PRESERVED, NOT REPLACED. `expires_at > now()` is ANDed, not
-- swapped out. Check 17 holds an expired pin on a still-published article and
-- confirms anon cannot see it after this migration.
--
--
-- ---------------------------------------------------------------------------
-- WHAT THIS MIGRATION DOES NOT DO
-- ---------------------------------------------------------------------------
--
-- It does not delete pins on recall. That would be a write-path change, it
-- would destroy the record of a curation decision, and it would put the fix in
-- the one place P9.1 says not to trust -- application code that has to remember
-- to run. The policy is the guarantee; a cleanup job would be a convenience.
--
-- It does not touch tags_select_public. `using (true)` is correct there: a tag
-- is reference data with no article attached, and the tag vocabulary is public
-- by construction.
--
-- It does not add an article_tags_select_staff equivalent to any other table,
-- and it does not audit the remaining public policies. Two tables were named
-- and two tables are fixed.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. article_tags -- scope the public read to published parents
-- ---------------------------------------------------------------------------

drop policy article_tags_select_public on article_tags;

create policy article_tags_select_public
  on article_tags
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from articles a
      where a.id = article_tags.article_id
        and a.status = 'published'
    )
  );


-- ---------------------------------------------------------------------------
-- 2. article_tags -- restore the staff read the scoping above would remove
-- ---------------------------------------------------------------------------

create policy article_tags_select_staff
  on article_tags
  for select
  to authenticated
  using (is_staff(auth.uid()));


-- ---------------------------------------------------------------------------
-- 3. homepage_pins -- AND the published test onto the existing clock test
-- ---------------------------------------------------------------------------

drop policy homepage_pins_select_public on homepage_pins;

create policy homepage_pins_select_public
  on homepage_pins
  for select
  to anon, authenticated
  using (
    expires_at > now()
    and exists (
      select 1
      from articles a
      where a.id = homepage_pins.article_id
        and a.status = 'published'
    )
  );


-- ============================================================================
-- VERIFIED IN A ROLLED-BACK TRANSACTION against the live schema, on an empty
-- database, with a transient fixture that never committed: one section pair,
-- one editor profile, one signed-in reader with NO profiles row (so is_staff is
-- false), two articles sharing two tags, and three pins. The recalled article
-- was INSERTED AS PUBLISHED AND THEN UPDATED to 'recalled', because that is the
-- only path into that state and the leak only exists for rows that took it.
-- The transaction was forced to abort; post-run counts confirmed every table
-- back at zero rows and both original policies still in place.
--
--   BASELINE -- the leak, before this migration
--    1  anon: article_tags rows visible (of 4)                        -> 4
--    2  anon: article_tags rows for the RECALLED article              -> 2   <-- LEAK
--    3  anon: tag-page join rows for one tag                          -> 2
--    4  anon: articles rows visible (of 2)                            -> 1
--          (the parent was already correctly hidden -- only the satellites leaked)
--    5  anon: homepage_pins rows visible (of 3)                       -> 2
--    6  anon: homepage_pins for the RECALLED article                  -> 1   <-- LEAK
--
--   THE STAFF REGRESSION, measured with section 1 applied and section 2 not yet
--    7  editor: article_tags for RECALLED, no staff policy yet        -> 0   <-- why
--                                                                              section 2
--                                                                              exists
--
--   NEGATIVE CONTROLS -- what must no longer be reachable
--   11  anon: article_tags for the RECALLED article                   -> 0
--   12  anon: tag names joinable for the RECALLED article             -> (none)
--   16  anon: homepage_pins for the RECALLED article                  -> 0
--   17  anon: expired pin on a STILL-PUBLISHED article                -> 0
--          (the clock rule survives the change)
--   21  reader (authenticated, no profiles row): article_tags for RECALLED -> 0
--   23  reader: homepage_pins for RECALLED                            -> 0
--          (`authenticated` alone is not `staff` -- the new staff policy gates
--           on a profiles row, not on being signed in)
--
--   POSITIVE CONTROLS -- what must still work
--    9  anon: article_tags for the PUBLISHED article                  -> 2
--   10  anon: tag names joinable for the PUBLISHED article  -> fixture-a,fixture-b
--          (fully visible, both tags, joined through to tags)
--   13  anon: tag-page join rows for one tag                          -> 1
--          (was 2 at baseline; the recalled article's row dropped out, the
--           published article's row stayed)
--    8  anon: article_tags rows visible (of 4)                        -> 2
--   14  anon: homepage_pins rows visible (of 3)                       -> 1
--   15  anon: homepage_pins for the PUBLISHED, unexpired article      -> 1
--   18  editor: article_tags for RECALLED                             -> 2
--   19  editor: article_tags rows visible (of 4)                      -> 4
--   20  editor: homepage_pins for RECALLED                            -> 1
--          (18-20: the Publish queue and the editor form keep everything they
--           had; only anon lost anything)
-- ============================================================================
