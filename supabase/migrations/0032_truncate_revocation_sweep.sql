-- ============================================================================
-- 0032_truncate_revocation_sweep.sql
-- The TRUNCATE exposure sweep: the standing fix, plus the twenty-two tables
-- that were created before it.
--
-- 0031 closed TRUNCATE on three derived tables and its header recorded why
-- that was not redundant with RLS. This migration generalises that finding:
-- the gap was never a property of those three tables, it is a property of this
-- database's default privileges, and it reopens on every future `create table`
-- until the default itself changes.
--
-- THE MECHANISM, read from pg_default_acl on 2026-09-01. Schema `public`,
-- object type `r`, carries two default-ACL entries -- one granted by
-- `postgres`, one by `supabase_admin` -- and both read
-- {postgres,anon,authenticated,service_role}=arwdDxtm. Every privilege,
-- including D (TRUNCATE), to every Supabase role, on every table created in
-- public. Verified by execution rather than inference: a bare
-- `create table _probe (id int)` inside a rolled-back transaction came into
-- existence with exactly that ACL, relrowsecurity FALSE, and
-- has_table_privilege('anon', ..., 'TRUNCATE') already true.
--
-- WHY RLS NEVER CAUGHT THIS. Every table in this schema follows the same
-- habit: enable row level security, then write narrowly scoped policies. That
-- habit genuinely closes INSERT, UPDATE and DELETE, because RLS default-denies
-- any command with no matching policy. It does NOT close TRUNCATE, because
-- RLS DOES NOT APPLY TO TRUNCATE AT ALL -- TRUNCATE is governed by the table
-- privilege alone and is never filtered by a policy. The one command RLS
-- cannot reach is also the most destructive, and the review habit that has
-- protected every other command in this build is structurally blind to it.
--
-- ============================================================================
-- THIS MIGRATION IS TRUNCATE-ONLY. THAT IS A BOUNDARY, NOT AN OVERSIGHT.
-- ============================================================================
--
-- No INSERT, UPDATE, DELETE or SELECT grant is touched on any table below, and
-- no policy is created, altered or dropped. The reason is specific and load
-- bearing: nineteen of these tables carry live `authenticated` write policies
-- -- article_tags, homepage_pins and tags have DELETE policies, and most of
-- the rest have INSERT and UPDATE -- and RLS needs the underlying grant for
-- every one of them. Revoking those would not harden anything; it would break
-- the admin surfaces while leaving the policies in place to suggest otherwise.
--
-- The pull to "tidy up the other privileges while in here" is the actual risk
-- in a migration that names twenty-two tables, and it is refused explicitly so
-- that a later reader does not mistake the narrowness for incompleteness. If a
-- table's INSERT/UPDATE/DELETE posture is wrong, that is a finding about that
-- table, and it belongs in a migration that says so and verifies it. Not here.
--
-- service_role KEEPS TRUNCATE on all twenty-two, matching 0031's posture. This
-- migration makes no claim about what the crons may do; only about what anon
-- and authenticated may do, and the answer is nothing.
--
-- ============================================================================
-- WHAT SECTION 1 CAN AND CANNOT REACH
-- ============================================================================
--
-- ALTER DEFAULT PRIVILEGES is keyed to the role that CREATES an object, and it
-- can only be issued by that role or a member of it. Tested in a rolled-back
-- transaction on 2026-09-01, as `postgres`, which is what migrations run as:
--
--   alter default privileges in schema public revoke truncate ...  SUCCEEDED
--   alter default privileges for role supabase_admin ...           FAILED
--                                    'permission denied to change default privileges'
--   set role supabase_admin                                        FAILED
--                                    'permission denied to set role "supabase_admin"'
--
-- `postgres` is not a superuser (rolsuper false) and is not a member of
-- `supabase_admin`, so the supabase_admin half is UNREACHABLE FROM ANY
-- MIGRATION. There is no escalation path; it would need a superuser session
-- (dashboard SQL editor) or platform support.
--
-- IT IS ALSO UNNECESSARY, which is why this migration does not pretend to try.
-- All thirty-one tables in public are owned by `postgres` -- every one created
-- by a migration -- so the supabase_admin default has never governed a single
-- table in this project and will not govern one unless Supabase's own tooling
-- creates a table in public. Section 1 is therefore complete coverage for
-- everything this build will ever create, and the residual is logged in
-- docs/exceptions.md rather than papered over here.
--
-- CONFIRMED SURGICAL: after the section 1 statement, a table created by
-- postgres came out as anon=arwdxtm -- no D -- with anon_truncate false and
-- anon_insert still true. Nothing but TRUNCATE moved.
--
-- ============================================================================
-- WHY THE LIST IS EXPLICIT AND WHY IT STILL ENDS IN AN ASSERTION
-- ============================================================================
--
-- The exposed set is a moving target: it was 25 tables before 0031 applied and
-- is 22 now, verified fresh at draft time on 2026-09-01. A dynamic DO-loop
-- over pg_class would be self-correcting but would do something a reviewer
-- cannot read off the page, which is the opposite of how every other migration
-- in this build is written. So the twenty-two are named.
--
-- A named list has one failure mode: a table created between drafting and
-- applying is silently missed, because a REVOKE that names twenty-two tables
-- cannot know about a twenty-third. Section 3 closes that. It is a
-- post-condition over the WHOLE schema, not over the list above -- it asks
-- pg_class whether ANY table in public still grants TRUNCATE to anon or
-- authenticated, and raises if one does. So the sweep either leaves the schema
-- provably clean or it fails loudly and names the table it did not cover. It
-- also covers relkind 'p', so a partitioned table added later cannot slip
-- through the check (there are none today).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. The standing fix -- future tables
--
-- Governs objects created by `postgres` from this point on. Existing tables
-- keep their grants and are handled by section 2; ALTER DEFAULT PRIVILEGES is
-- never retroactive.
--
-- Only TRUNCATE is revoked. anon and authenticated keep the rest of the
-- default set, so a new table still arrives with the INSERT/UPDATE/DELETE
-- grants that its RLS policies will sit on top of, and the existing habit of
-- writing those policies is unchanged.
-- ----------------------------------------------------------------------------

alter default privileges in schema public
  revoke truncate on tables from anon, authenticated;


-- ----------------------------------------------------------------------------
-- 2. The sweep -- the twenty-two tables created before section 1 existed
--
-- Confirmed fresh against pg_class on 2026-09-01: thirty-one tables in public,
-- nine already protected by an explicit revoke (audit_log 0021,
-- price_observations 0025, format_overrides 0026, content_revisions /
-- editorial_rules / site_events 0030, basket_snapshots / daily_rollups /
-- content_performance 0031), and these twenty-two still exposed.
--
-- One statement, so the sweep is atomic: either all twenty-two are revoked or
-- none is, and there is no half-swept schema to reason about if it fails.
--
-- NONE OF THE TWENTY-TWO HAS A LEGITIMATE NEED, verified three ways rather
-- than assumed: no TypeScript under lib/, app/ or components/ references
-- TRUNCATE at all; the only TRUNCATE in the SQL tree is the guard triggers
-- from 0021, 0025 and 0030, which block it rather than issue it; and PostgREST
-- exposes no TRUNCATE verb, so no anon or authenticated caller can reach it
-- through the API even in principle. There are also zero non-SELECT policies
-- for anon anywhere in this schema -- 0029 scoped every write policy to
-- authenticated -- so there is no anon write path of any kind to preserve.
-- ----------------------------------------------------------------------------

revoke truncate on table
  article_tags,
  articles,
  basket_definition,
  collection_sites,
  collectors,
  commodities,
  content_items,
  content_templates,
  entitlements,
  homepage_pins,
  media,
  price_anomalies,
  price_submissions,
  profiles,
  raw_items,
  sections,
  signals,
  sources,
  tags,
  units,
  videos,
  weight_proposals
from anon, authenticated;


-- ----------------------------------------------------------------------------
-- 3. The closing assertion -- the whole schema, not the list above
--
-- Deliberately does NOT read the twenty-two names. It asks the catalogue the
-- question the migration exists to answer -- "can anon or authenticated
-- TRUNCATE anything in public?" -- and refuses to commit unless the answer is
-- no. A table added between drafting and applying therefore fails the
-- migration by name instead of being quietly skipped.
--
-- Raising inside the migration aborts its transaction, so a failure leaves the
-- schema exactly as it was rather than half-swept.
-- ----------------------------------------------------------------------------

do $$
declare
  v_remaining text;
begin
  select string_agg(c.relname, ', ' order by c.relname)
    into v_remaining
    from pg_class c
   where c.relnamespace = 'public'::regnamespace
     and c.relkind in ('r', 'p')
     and (has_table_privilege('anon', c.oid, 'TRUNCATE')
       or has_table_privilege('authenticated', c.oid, 'TRUNCATE'));

  if v_remaining is not null then
    raise exception
      'TRUNCATE sweep incomplete: anon or authenticated still hold TRUNCATE on: %. '
      'A table was almost certainly created after this migration was drafted -- '
      'add it to the revoke list in section 2 rather than weakening this check.',
      v_remaining;
  end if;
end;
$$;
