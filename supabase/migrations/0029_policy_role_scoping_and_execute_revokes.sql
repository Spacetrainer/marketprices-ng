-- ============================================================================
-- 0029_policy_role_scoping_and_execute_revokes.sql
-- Scope the last two unscoped policies to `authenticated`, then take EXECUTE
-- away from anon and PUBLIC on every helper function and every RPC entry point
-- in the schema. Two steps, one transaction, and the ORDER IS LOAD-BEARING:
-- step 1 is what makes step 2 safe, and step 2 alone would break the site.
--
-- THIS NARROWS 0027's DOCUMENTED EXCEPTION. IT DOES NOT REMOVE IT.
-- Stated up front because the exception is the most consequential thing either
-- migration says, and a later reader skimming for "is that still true?" should
-- get the answer without reading to the end:
--
--     0027 kept EXECUTE on can_view_audit_log() for anon AND authenticated,
--     for two SEPARATE reasons. This migration retires the anon reason and
--     leaves the authenticated reason exactly as it was.
--
-- Section 3 sets out both halves. The short version: anon stops evaluating the
-- policy, so anon stops needing the grant. `authenticated` still evaluates it,
-- so `authenticated` still needs the grant, and revoking it would still take
-- down the governance audit view for every member of staff. 0027's underlying
-- finding -- that a policy expression runs with the QUERYING USER'S privileges,
-- so a caller without EXECUTE gets an ERROR and not an empty result -- is not
-- weakened here. It is the reason this migration works. We removed the
-- evaluation, not the requirement.
--
-- NOT AN EDIT TO 0021, 0022, 0024, 0026 OR 0027. All are applied. Fix-forward,
-- the same posture as 0023 through 0028.
--
--
-- ---------------------------------------------------------------------------
-- SECTION 1 -- THE TWO UNSCOPED POLICIES, AND WHAT "UNSCOPED" COST
-- ---------------------------------------------------------------------------
--
-- A policy created without a TO clause defaults to PUBLIC, which means EVERY
-- role, which means anon. These were the only two left in the schema:
--
--     editorial_rules_select_staff    using (is_staff(auth.uid()))
--     audit_log_select_governance     using (can_view_audit_log())
--
-- Both tables have EXACTLY ONE policy, and it was this one. So the unscoped TO
-- clause was not a second door into a table that had others -- it was the only
-- door, standing open to a role it was never written for.
--
-- Nothing leaked. is_staff(null) is false and can_view_audit_log(null) is
-- false, so anon read zero rows from both tables, which is the correct answer.
-- WHAT IT COST WAS NOT CONFIDENTIALITY, IT WAS THE ABILITY TO LOCK THE
-- FUNCTIONS DOWN. Because anon evaluated these expressions, anon needed EXECUTE
-- on is_staff() and can_view_audit_log(); because anon needed EXECUTE on those,
-- the schema could not adopt a clean "no client role executes a helper" rule;
-- and because of that, 0027 had to carve out an exception and explain it at
-- length. The unscoped TO clause was upstream of all of it.
--
-- MEASURED, NOT REASONED. In the transaction at the foot of this file, with the
-- policies still unscoped, pulling anon's EXECUTE and re-running the SAME anon
-- query produced:
--
--     permission denied for function is_staff
--     permission denied for function can_view_audit_log
--
-- -- checks 3 and 4. That is the dependency, demonstrated rather than asserted,
-- and it is exactly the failure 0027 hit and documented.
--
-- NO OBSERVABLE CHANGE FOR ANON. This is the check worth insisting on, because
-- "we removed access" and "nothing changed for the caller" are different claims
-- and only the second one is true here. Before: anon selects editorial_rules
-- and audit_log, gets an empty result, no error. After: identical. Not "also
-- empty" -- byte-identical outcome strings, compared in-transaction as checks 7
-- and 8. Anon had no rows before and has no rows now; what changed is that
-- Postgres no longer runs a SECURITY DEFINER function to tell it so. RLS denies
-- by default when no policy applies to the querying role, which is a cheaper
-- and more honest way to reach the same answer.
--
--
-- ---------------------------------------------------------------------------
-- SECTION 2 -- THE THIRTEEN FUNCTIONS, AND WHY `authenticated` KEEPS ALL OF THEM
-- ---------------------------------------------------------------------------
--
-- SEVEN HELPERS, called from policy expressions:
--
--     is_staff(uuid)              is_admin_or_editor(uuid)
--     is_admin(uuid)              can_promote(uuid)
--     can_author(uuid)            can_edit_media(uuid, uuid)
--     can_view_audit_log(uuid)
--
-- can_edit_media() IS THE SEVENTH AND IS EASY TO MISS. It is the same shape as
-- the other six -- SECURITY DEFINER, search_path pinned, anon and PUBLIC both
-- holding EXECUTE -- and it is referenced only by media_insert_staff and
-- media_update_staff, both of which were already `to authenticated`. So anon
-- never evaluated it and never needed it. It is revoked here so that the rule
-- this migration establishes has no stragglers: a later audit that finds one
-- helper still granted to anon has to work out whether that was reasoned or
-- forgotten, and the answer should never be "forgotten".
--
-- SIX RPC ENTRY POINTS, called over PostgREST from the control room:
--
--     dismiss_signal(uuid, text)          dismiss_price_anomaly(uuid, text)
--     promote_signal(uuid)                promote_price_anomaly(uuid)
--     supersede_price_observation(uuid)   link_video_to_content_item(uuid, uuid)
--
-- Confirmed complete against pg_proc rather than against the build plan: these
-- are every non-trigger, non-helper callable in `public` that still carried an
-- anon grant. The other two RPC-shaped functions, set_editorial_rule() and
-- write_audit_entry(), are ALREADY locked -- 0024 and 0026 took anon and PUBLIC
-- off both -- and format_override_state() has only ever been granted to
-- postgres. Nothing was left out of the list below.
--
-- WHY `authenticated` KEEPS EXECUTE ON ALL THIRTEEN WHILE NOTHING ELSE DOES.
-- This is the one place this migration deliberately breaks with 0026 and 0027's
-- four-role revoke shape, and the reason is not caution, it is that the grant
-- is load-bearing for two different mechanisms:
--
--   - FOR THE SEVEN HELPERS: `authenticated` is the role that now evaluates
--     every policy in the schema that calls one. Per 0027's finding, a policy
--     expression is evaluated with the querying user's privileges, so a staff
--     member without EXECUTE does not get "no rows" -- they get an error, and
--     the table becomes unreadable. Revoking here would take down the Publish
--     queue, the Settings screen, the Dashboard and the governance audit view
--     at once. Checks 9 and 10 depend on these grants surviving.
--
--   - FOR THE SIX RPCs: SECURITY DEFINER changes WHOSE PRIVILEGES THE BODY RUNS
--     WITH. It does not remove the caller's need for EXECUTE on the function
--     itself. These six are the control room's only way to dismiss a signal,
--     promote an anomaly, supersede an observation or attach a video, and the
--     caller is always a signed-in staff member. Revoking `authenticated` here
--     would not harden the RPCs, it would delete the feature.
--
-- The rule this migration actually establishes, stated so it can be checked in
-- one query rather than inferred: NO UNAUTHENTICATED ROLE EXECUTES ANYTHING IN
-- `public`. anon holds EXECUTE on nothing; PUBLIC holds EXECUTE on nothing.
-- Verified as checks 15 and 16.
--
-- can_view_audit_log() TAKES ONLY THE anon HALF OF THE REVOKE, because 0027
-- already removed its PUBLIC grant and revoking an absent privilege is a no-op
-- that reads like a second, contradictory decision. Twelve of the thirteen
-- carry a real PUBLIC grant; that one does not. It is given its own statement
-- below rather than being folded into the group, so the asymmetry is visible in
-- the code and not only in this comment.
--
--
-- ---------------------------------------------------------------------------
-- SECTION 3 -- EXACTLY WHAT THIS DOES TO 0027's EXCEPTION
-- ---------------------------------------------------------------------------
--
-- 0027 wrote, of can_view_audit_log():
--
--     "can_view_audit_log() IS THE EXCEPTION, AND IT IS FORCED, NOT PREFERRED.
--      It is the only function touched by either migration that is REFERENCED
--      BY AN RLS POLICY -- audit_log_select_governance, whose USING expression
--      is `can_view_audit_log()`."
--
-- and then gave two grants two different justifications.
--
-- THE `anon` HALF -- RETIRED BY THIS MIGRATION. 0027's reasoning was that anon
-- holds table-level SELECT on audit_log and the policy was unscoped, so anon
-- evaluated the expression and an anon caller without EXECUTE would error
-- instead of reading an empty table. Every word of that was true when written
-- and none of it survives step 1: with the policy scoped to `authenticated`,
-- anon matches no SELECT policy at all, RLS denies by default, and the
-- expression is never reached. Checks 5, 6 and 8 confirm anon reads audit_log
-- cleanly with the grant gone, to the same empty result as before. That
-- paragraph of 0027 is now history rather than standing reasoning.
--
-- THE `authenticated` HALF -- UNTOUCHED, AND STILL THE OPERATIVE RULE. 0027's
-- other justification was verified there by an analyst getting
--
--     permission denied for function can_view_audit_log
--
-- where the same query had returned its row a moment earlier. Scoping the
-- policy does nothing whatever to this: `authenticated` is precisely the role
-- that still evaluates it. The grant stays, for the reason 0027 gave, and if a
-- future migration proposes revoking it, that migration is wrong and 0027's
-- section 1 is the reason why.
--
-- SO: 0027's exception narrows from two roles to one. It does not lapse, and
-- this file should not be cited as having cleared it.
--
--
-- ---------------------------------------------------------------------------
-- WHAT THIS MIGRATION DOES NOT DO
-- ---------------------------------------------------------------------------
--
-- It does not touch `service_role`, which keeps EXECUTE on all six RPCs.
-- FLAGGED RATHER THAN FIXED, because it deserves its own look and not a quiet
-- fold-in here: supersede_price_observation() is a price write, and P5.2 says
-- the engine has zero write access to price data. Whether service_role is the
-- engine's identity in this deployment is a question this migration is not the
-- right place to answer.
--
-- It does not revoke `authenticated`, for the two mechanisms in section 2.
--
-- It does not re-pin any search_path or change any function body. Every one of
-- the thirteen is already SECURITY DEFINER with search_path=public; 0027 closed
-- the last unpinned definer. This migration changes grants and policy roles
-- only.
--
-- It does not alter either policy's USING expression. `is_staff(auth.uid())`
-- and `can_view_audit_log()` are carried across verbatim -- Postgres has no
-- ALTER POLICY ... TO, so the drop-and-recreate below is a role change wearing
-- a rewrite's clothing, and nothing about who sees which row has changed.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Scope the two remaining unscoped policies to `authenticated`
--    MUST COME FIRST -- section 2's revokes are only safe once anon has
--    stopped evaluating these expressions.
-- ---------------------------------------------------------------------------

drop policy editorial_rules_select_staff on editorial_rules;

create policy editorial_rules_select_staff
  on editorial_rules
  for select
  to authenticated
  using (is_staff(auth.uid()));


drop policy audit_log_select_governance on audit_log;

create policy audit_log_select_governance
  on audit_log
  for select
  to authenticated
  using (can_view_audit_log());


-- ---------------------------------------------------------------------------
-- 2. Revoke EXECUTE from anon and PUBLIC -- the six helpers holding both
-- ---------------------------------------------------------------------------

revoke execute on function
  public.is_staff(uuid),
  public.is_admin_or_editor(uuid),
  public.is_admin(uuid),
  public.can_promote(uuid),
  public.can_author(uuid),
  public.can_edit_media(uuid, uuid)
from anon, public;


-- ---------------------------------------------------------------------------
-- 3. can_view_audit_log() -- the anon half only. 0027 already took PUBLIC.
-- ---------------------------------------------------------------------------

revoke execute on function public.can_view_audit_log(uuid) from anon;


-- ---------------------------------------------------------------------------
-- 4. The six RPC entry points
-- ---------------------------------------------------------------------------

revoke execute on function
  public.dismiss_signal(uuid, text),
  public.dismiss_price_anomaly(uuid, text),
  public.promote_signal(uuid),
  public.promote_price_anomaly(uuid),
  public.supersede_price_observation(uuid),
  public.link_video_to_content_item(uuid, uuid)
from anon, public;


-- ============================================================================
-- VERIFIED IN A ROLLED-BACK TRANSACTION against the live schema, running the
-- four statements above VERBATIM between a before-pass and an after-pass, on a
-- transient fixture that never committed: one analyst profile, one
-- editorial_rules row, one audit_log row. Each anon read was captured as an
-- OUTCOME STRING -- error text, or "empty result, no error (rows=N)" -- so that
-- before and after could be compared for equality rather than merely both
-- being called empty. The transaction was forced to abort; post-run checks
-- confirmed zero rows in every fixture table, both policies back to {public},
-- and anon's thirteen grants restored.
--
--   BEFORE -- and the dependency that forced 0027's exception
--    1  anon: select editorial_rules       -> empty result, no error (rows=0)
--    2  anon: select audit_log             -> empty result, no error (rows=0)
--    3  anon: select editorial_rules, with is_staff EXECUTE pulled
--                                          -> ERROR: permission denied for
--                                             function is_staff
--    4  anon: select audit_log, with can_view_audit_log EXECUTE pulled
--                                          -> ERROR: permission denied for
--                                             function can_view_audit_log
--          (3 and 4 are 0027's exception reproduced on demand: while the
--           policies are unscoped, anon's grant is load-bearing)
--
--   THE CHECK THAT MATTERS -- anon's observable behaviour is UNCHANGED, not
--   merely also-empty
--    5  anon: select editorial_rules       -> empty result, no error (rows=0)
--    6  anon: select audit_log             -> empty result, no error (rows=0)
--    7  editorial_rules, before = after ?  -> IDENTICAL
--    8  audit_log, before = after ?        -> IDENTICAL
--          (same outcome string on both sides. anon read nothing before and
--           reads nothing now; what went away is the function call, not a
--           result the public ever had)
--
--   POSITIVE CONTROLS -- staff keep everything
--    9  analyst: select audit_log                              -> 1 row
--   10  analyst: select editorial_rules                        -> 1 row
--          (9 depends on authenticated KEEPING EXECUTE on can_view_audit_log --
--           the half of 0027's exception this migration leaves standing)
--   14  authenticated holds EXECUTE on the thirteen            -> 13 of 13
--   17  service_role holds EXECUTE on the six RPCs             -> 6 of 6
--
--   NEGATIVE CONTROLS -- the doors that are now shut
--   11  anon: call is_staff() directly
--                            -> ERROR: permission denied for function is_staff
--   12  anon: call promote_signal() directly
--                            -> ERROR: permission denied for function
--                               promote_signal
--   13  anon: call link_video_to_content_item() directly
--                            -> ERROR: permission denied for function
--                               link_video_to_content_item
--   15  anon holds EXECUTE on the thirteen                     -> 0 of 13
--   16  of the thirteen, carrying a real PUBLIC grant          -> 0
--          (tested by looking for an ACL item with an empty grantee. A LIKE
--           against '=X/postgres' does NOT work -- it matches
--           'postgres=X/postgres' as a substring and reports every function as
--           still public. That false reading was caught and corrected before
--           this file was written; do not reintroduce it.)
--   18  policies in `public` still unscoped to a role          -> 0
--
--   THE RESULTING GRANTS
--   19  is_staff             -> {postgres=X/postgres, authenticated=X/postgres,
--                               service_role=X/postgres}
--   20  can_view_audit_log   -> {postgres=X/postgres, authenticated=X/postgres}
--          (no service_role on 20: 0027 revoked it there and this file does not
--           put it back)
-- ============================================================================
