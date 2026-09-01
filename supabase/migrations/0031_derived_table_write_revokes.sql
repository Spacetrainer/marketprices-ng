-- ============================================================================
-- 0031_derived_table_write_revokes.sql
-- The derived-table safety net: basket_snapshots, daily_rollups,
-- content_performance.
--
-- Three computed tables, each written by a cron under service-role, each
-- carrying the full default grant set for every Supabase role. This migration
-- takes the four write privileges away from anon and authenticated and does
-- nothing else. service_role is not touched, on purpose and by name.
--
-- WHAT WAS EXPOSED, read from the live catalogue on 2026-09-01. All three
-- tables are identical: relacl {postgres=arwdDxtm/postgres,
-- anon=arwdDxtm/postgres, authenticated=arwdDxtm/postgres,
-- service_role=arwdDxtm/postgres}, RLS enabled, relforcerowsecurity false,
-- zero triggers, and SELECT-only policies:
--   basket_snapshots    -- select_public (is_complete), select_staff
--   daily_rollups       -- select_staff
--   content_performance -- select_staff
-- No INSERT, UPDATE or DELETE policy exists on any of the three.
--
-- THIS IS NOT PURELY A SAFETY NET, AND THAT IS THE POINT OF THE FILE. The
-- four privileges being revoked here fall into two genuinely different cases,
-- verified by execution against the live schema rather than by reading the
-- catalogue:
--
--   INSERT, UPDATE, DELETE -- ALREADY DENIED BY RLS. Confirmed as
--     `authenticated` with a real JWT claim against a table holding a real
--     row: INSERT raises "new row violates row-level security policy", and
--     UPDATE and DELETE report success with rows affected = 0, because with
--     no policy for those commands RLS filters every candidate row before the
--     write is attempted. For these three, the REVOKE below is defence in
--     depth: it changes no outcome today, and it means the outcome no longer
--     depends on a policy set staying SELECT-only. A future `create policy
--     ... for update` added for one purpose would otherwise silently acquire
--     a grant underneath it.
--
--   TRUNCATE -- NOT DENIED BY ANYTHING. RLS DOES NOT APPLY TO TRUNCATE. It is
--     governed by the TRUNCATE privilege alone, and all three tables grant it
--     to anon and authenticated today. Verified by executing it: as
--     `authenticated`, `truncate daily_rollups` and `truncate
--     basket_snapshots` both succeeded against tables holding a row and left
--     them empty; as `anon`, `truncate content_performance` succeeded. This
--     REVOKE is the only thing that closes that, and no policy, present or
--     future, would ever have closed it.
--
-- So the file is a safety net for three privileges and a real fix for the
-- fourth. Recorded here because "RLS already blocks this" is the obvious
-- objection to the whole migration, and it is true of exactly three quarters
-- of it.
--
-- NO TRIGGER LAYER, DELIBERATELY, and this is where 0031 parts company with
-- 0025, 0026 and 0030. Those tables are append-only, so a guard that refuses
-- every UPDATE and DELETE is exactly right. These three are the opposite:
-- recomputation IS the intended behaviour. basket_snapshots is recomputed
-- when a correction lands upstream, daily_rollups is rewritten by
-- /api/cron/rollups, and content_performance is re-collected per day per
-- platform. A Layer 3 trigger here would have to permit the very writes it
-- was added to police, so it would be enforcing nothing while looking like it
-- enforced something. Two layers is the correct depth for a recomputed table.
--
-- SERVICE_ROLE IS NOT MENTIONED IN ANY STATEMENT BELOW. It keeps INSERT,
-- UPDATE, DELETE and TRUNCATE on all three tables, including the ability to
-- overwrite figures it wrote earlier, because that is what recomputation is.
-- This migration makes NO judgement about how the crons write -- whether a
-- rollup should be upserted or replaced, whether a recompute may move a
-- figure a reader has already seen, whether a snapshot should be versioned
-- rather than overwritten. Those are real questions and none of them is
-- answered here. The only claim this file makes is about who OTHER than the
-- cron may write, and the answer is nobody.
--
-- SELECT IS UNTOUCHED on all three. Each table's read policy needs the grant
-- underneath it -- including basket_snapshots' anon policy, which P9.1
-- explicitly permits ("basket_snapshots where is_complete"). Revoking anon's
-- SELECT would break the public basket index.
--
-- PUBLIC HOLDS NOTHING on any of the three -- no `=.../postgres` entry in any
-- relacl -- so anon and authenticated are the complete set of roles to name.
-- (On FUNCTIONS the opposite is true and PUBLIC must be named; see 0024 and
-- the exceptions.md entry recording why.)
-- ============================================================================


-- ----------------------------------------------------------------------------
-- basket_snapshots -- the weekly basket index (0012 §9.2, P2.10)
--
-- 0012: "No insert, update or delete policy: rows are computed, never
-- authored. /api/cron/price-intel writes them under service-role credentials."
-- The policy set matched that sentence; the grants never did.
-- ----------------------------------------------------------------------------

revoke insert, update, delete, truncate on basket_snapshots
  from anon, authenticated;

-- ----------------------------------------------------------------------------
-- daily_rollups -- the Dashboard's only source (0020 §9.4, P8.7, P11.1)
--
-- 0020: "No insert, update or delete policy. Default deny. The rollup cron
-- writes under service-role; a hand-written rollup row is an invented figure."
-- P11.1 says metrics are real or absent -- which a table any signed-in reader
-- could TRUNCATE cannot promise, since absent-because-wiped and
-- absent-because-not-yet-computed are indistinguishable to every screen
-- reading it.
-- ----------------------------------------------------------------------------

revoke insert, update, delete, truncate on daily_rollups
  from anon, authenticated;

-- ----------------------------------------------------------------------------
-- content_performance -- per-item, per-platform measurement (0019 §9.4)
--
-- The table behind every "does decision utility predict engagement?" question.
-- Same posture as the two above: collected, never authored.
-- ----------------------------------------------------------------------------

revoke insert, update, delete, truncate on content_performance
  from anon, authenticated;
