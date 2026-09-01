-- ============================================================================
-- 0027_function_hardening.sql
-- Four function-level fixes, of which ONE is a real security fix, one closes a
-- gap that is unreachable today, one is inert-but-flagged, and one is pure
-- consistency. They are labelled below so the next reader does not have to
-- guess which is which, and so nobody later cites this migration as evidence
-- that the six revokes in section 4 fixed a vulnerability. They did not. Only
-- section 3 and, in a smaller way, section 1 address anything reachable.
--
-- NOT AN EDIT TO 0021, 0004, 0003 OR 0022. All are applied. This is a
-- fix-forward, the same posture as 0023, 0024, 0025 and 0026.
--
--
-- ---------------------------------------------------------------------------
-- WHAT EACH SECTION IS, AND HOW SERIOUSLY TO TAKE IT
-- ---------------------------------------------------------------------------
--
-- 1. can_view_audit_log() -- SEARCH_PATH PIN, plus a PARTIAL revoke. The
--    follow-up 0024 promised by name and did not take. The pin is a real fix:
--    the function is SECURITY DEFINER, reads `profiles` unqualified, and backs
--    the only SELECT policy on audit_log. The revoke here is deliberately NOT
--    0026's four-role shape, and section 1 explains at length why it cannot
--    be -- this is the one function in the schema where the client roles need
--    EXECUTE.
--
-- 2. handle_new_user_entitlement() -- EXECUTE REVOKE, full four-role shape.
--    SECURITY DEFINER with the untouched default grants: the same shape as the
--    three trigger functions revoked in 0026, and the last one left. Being
--    honest about the size of it: a PL/pgSQL trigger function cannot be run
--    outside trigger context, so the grant conveys nothing a caller could use.
--    This closes a standing linter WARN and removes a pointless grant on a
--    definer function; it does not close a demonstrated hole.
--
-- 3. protect_profile_privileges() -- SEARCH_PATH PIN, A SCHEMA-QUALIFIED CALL,
--    and the full four-role revoke. THE REAL FIX IN THIS MIGRATION. The one
--    place where this build's stated reason for leaving the plain trigger
--    functions unpinned does not hold, and the gap was demonstrated rather
--    than theorised. See SECTION 3 IN FULL below.
--
-- 4. The six remaining SECURITY INVOKER trigger functions -- EXECUTE REVOKE,
--    FOR CONSISTENCY AND NOTHING ELSE. Stated plainly rather than dressed up:
--    these run with the CALLER'S privileges, so there is no escalation to
--    close, and Supabase's definer lints do not flag them. If every one of
--    these grants stayed exactly as it is, nothing would be exploitable. They
--    are revoked so that a reviewer can read "trigger function" as implying
--    "not callable" without checking each one. That is a legibility argument,
--    not a security one, and it should not be cited as the latter.
--
--
-- ---------------------------------------------------------------------------
-- THE REVOKE POSTURE, AND THE ONE PRINCIPLED EXCEPTION
-- ---------------------------------------------------------------------------
--
-- 0026 revoked its four functions from public, anon, authenticated AND
-- service_role. This migration adopts that same shape wherever it can, so the
-- two migrations leave one posture behind rather than two conventions. The
-- rule both express is: EVERY FUNCTION IS REVOKED FROM EVERY GRANTEE THAT DOES
-- NOT NEED IT.
--
-- can_view_audit_log() IS THE EXCEPTION, AND IT IS FORCED, NOT PREFERRED. It
-- is the only function touched by either migration that is REFERENCED BY AN
-- RLS POLICY -- audit_log_select_governance, whose USING expression is
-- `can_view_audit_log()`. A policy expression is evaluated with the QUERYING
-- USER'S privileges, so a caller without EXECUTE does not get "no rows", they
-- get an error and the table becomes unreadable. Verified rather than
-- reasoned, in the rolled-back transaction described at the foot of this file:
-- with EXECUTE revoked from authenticated, an analyst selecting from audit_log
-- failed with
--
--     permission denied for function can_view_audit_log
--
-- where the same query had returned its row a moment earlier. Revoking
-- `authenticated` would therefore take down the governance audit view for
-- every member of staff who is supposed to see it. This is the same call 0024
-- made and recorded for set_editorial_rule() -- "it is the Settings screen's
-- only path in" -- reached here for a stronger reason, because there the grant
-- was merely the application's route and here it is load-bearing for a policy.
--
-- `anon` KEEPS EXECUTE TOO, for a subtler reason worth writing down. anon
-- holds table-level SELECT on audit_log (relacl reads `anon=rxtm/postgres`),
-- and the policy applies to PUBLIC rather than to a named role, so an
-- anonymous SELECT on audit_log DOES evaluate this function today: auth.uid()
-- is null, the function returns false, and the caller gets a clean empty
-- result. Revoking anon would convert that empty result into `permission
-- denied for function can_view_audit_log` -- which tells an anonymous prober
-- more than the empty set did, not less. The quieter failure is the better
-- one, so anon keeps the grant.
--
-- What can_view_audit_log() loses is PUBLIC and service_role: PUBLIC because
-- named grants make it redundant and 0024's lesson is that an unrevoked PUBLIC
-- grant makes every other revoke cosmetic, and service_role because it
-- bypasses RLS entirely and so never evaluates the policy that needs this
-- function. Neither removal changes any working path, and both are verified
-- below.
--
-- VERIFY BY READING proacl BACK, never by reading this file: this database
-- grants EXECUTE on new functions in `public` to anon, authenticated and
-- service_role BY NAME on top of the implicit PUBLIC grant, so a revoke that
-- names only PUBLIC removes one grant of four and changes nothing while
-- reading in review like a door being shut (0024).
--
--
-- ---------------------------------------------------------------------------
-- SECTION 3 IN FULL, because it is the only finding here that was not already
-- written down somewhere
-- ---------------------------------------------------------------------------
--
-- 0022 and 0025 both justify leaving the plain trigger functions unpinned with
-- the same sentence -- 0022, above set_updated_at(): "Not SECURITY DEFINER and
-- no search_path pin: the body touches no table, no schema-qualified object
-- and no other function -- only NEW and now(), which is pg_catalog and always
-- resolvable. Same posture as this build's other plain trigger functions
-- (protect_audit_log, protect_content_status, protect_weight_proposal)."
--
-- That claim was checked against all seven bodies on 2026-09-01. It holds for
-- six of them: set_updated_at (NEW and now()), protect_audit_log (a bare raise
-- on tg_op), protect_article_provenance (NEW and OLD only), and
-- protect_content_status, protect_weight_proposal and protect_price_observation
-- (NEW, OLD, jsonb operators, and a schema-qualified auth.uid()).
--
-- It does not hold for protect_profile_privileges, whose first line is:
--
--     if new.id = auth.uid() and not is_admin(auth.uid()) then
--
-- `is_admin` is UNQUALIFIED. The function is SECURITY INVOKER and unpinned, so
-- that NAME is resolved through the CALLER'S search_path at execution time.
-- is_admin() is itself SECURITY DEFINER with a pinned search_path, and that
-- does not help at all: the pin governs what happens INSIDE is_admin once it
-- has been chosen, not which function of that name gets chosen. A caller with
-- a schema of their own ahead of `public` supplies an is_admin(uuid) that
-- returns true, the guard's condition becomes false, and the branch that stops
-- a user editing `role`, `is_active` and `is_2fa_enabled` on their OWN profile
-- is skipped. profiles_update_own already grants that user the UPDATE, so this
-- trigger is the only thing between a signed-in contributor and self-promotion
-- to admin.
--
-- THE MECHANISM IS NOT SPECULATIVE -- IT WAS DEMONSTRATED. In the rolled-back
-- verification transaction described at the foot of this file, a `decoy`
-- schema holding `is_admin(uuid) returns boolean` as `select true` was placed
-- ahead of `public` on the search_path of an ordinary signed-in contributor,
-- who then ran `update profiles set role = 'admin' where id = <self>`. Against
-- the CURRENT function the update SUCCEEDED and the row came back reading
-- role = admin. Against the replacement below, the identical attempt was
-- refused with 'cannot change role, is_active or is_2fa_enabled on your own
-- profile' and the row stayed at contributor. So the guard genuinely is
-- skippable by name resolution, and the fix genuinely closes it.
--
-- WHAT MAKES IT UNREACHABLE TODAY IS THE PRECONDITION, NOT THE MECHANISM, and
-- that distinction is the whole of the risk assessment. The attack needs
-- somewhere to put the decoy, and `authenticated` cannot CREATE SCHEMA in a
-- stock Supabase project, so on this deployment there is nothing to resolve
-- to. It is fixed anyway for three reasons. The blast radius is
-- self-promotion to admin, which is the highest-value write in the schema. The
-- precondition is a GRANT rather than a code change, so it can be restored by
-- an unrelated future decision to let some role create objects, and nothing
-- would connect that decision back to this function. And it is one line to
-- close, which is a poor trade to decline.
--
-- THE FIX IS BOTH HALVES, and either alone would be weaker. The pin fixes the
-- resolution for every unqualified name in the body, including any added
-- later. The qualification makes the single call site say what it means, so
-- the guarantee survives someone removing the pin without reading this header.
-- The function stays SECURITY INVOKER: it must see auth.uid() as the caller,
-- and nothing in it needs owner rights.
--
-- CREATE OR REPLACE, not DROP and CREATE. The signature is unchanged, so the
-- existing profiles_protect_privileges trigger keeps pointing at it with no
-- DROP TRIGGER and no window in which the guard is absent. Replacing a
-- function also PRESERVES its ACL, which is why its revoke sits AFTER the
-- replace -- the revoke has to be the last word on this function's grants, and
-- would be undone if the order were reversed. Only the two changes described
-- above; the rest of the body is 0003's, unchanged.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. can_view_audit_log() -- the pin 0024 promised, and a partial revoke
--
-- ALTER, not CREATE OR REPLACE: only the setting changes, so there is no
-- reason to restate the body and no risk of restating it wrongly. The function
-- keeps its `uid uuid default auth.uid()` signature and its SECURITY DEFINER
-- marking, and audit_log_select_governance keeps calling it with no argument.
--
-- authenticated and anon KEEP EXECUTE. See THE REVOKE POSTURE above: this is
-- the only function in either migration referenced by an RLS policy, policy
-- expressions run with the querying user's privileges, and revoking either
-- role degrades a working path -- authenticated loses the audit view entirely,
-- anon trades a clean empty result for an informative error.
--
-- NOTE, not fixed here and not a bug today: the argument form means a caller
-- can ask "does THIS uuid hold a governance role" rather than only "do I",
-- which is the shape 0024 removed from set_editorial_rule(). It is benign in
-- this one because the function only reads and returns a boolean, and its only
-- caller is a policy that passes nothing -- the worst case is an oracle, not
-- impersonation. Changing the signature would mean dropping and recreating the
-- function that a live policy depends on, which is a larger change than the
-- observation justifies. Recorded so the asymmetry with 0024 is a decision on
-- the record rather than an oversight.
-- ----------------------------------------------------------------------------

alter function can_view_audit_log(uuid)
  set search_path = public;

revoke execute on function can_view_audit_log(uuid)
  from public, service_role;


-- ----------------------------------------------------------------------------
-- 2. handle_new_user_entitlement() -- the last unrevoked SECURITY DEFINER
--    trigger function
--
-- The function is NOT otherwise changed: it keeps SECURITY DEFINER, which it
-- needs, because entitlements has no INSERT policy and the row is written on
-- behalf of a user who does not yet exist as a session. Its search_path is
-- already pinned.
--
-- The trigger it backs, on_auth_user_created_entitlement, is AFTER INSERT on
-- auth.users and fires for the auth service's own role. EXECUTE on a trigger
-- function is checked when the trigger is CREATED, not each time it fires, so
-- revoking it does not affect signup at all -- verified rather than assumed,
-- by the positive control described at the foot of this file.
-- ----------------------------------------------------------------------------

revoke execute on function handle_new_user_entitlement()
  from public, anon, authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 3. protect_profile_privileges() -- pinned, qualified, and revoked
--
-- The revoke follows the replace: CREATE OR REPLACE preserves the existing
-- ACL, so a replace after the revoke would restore the grants removed here.
-- ----------------------------------------------------------------------------

create or replace function protect_profile_privileges()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- public.is_admin, qualified. See SECTION 3 IN FULL in the header: this
  -- function is SECURITY INVOKER, so an unqualified name here is resolved
  -- through the caller's search_path, and the function chosen decides whether
  -- the guard below runs at all.
  if new.id = auth.uid() and not public.is_admin(auth.uid()) then
    if new.role is distinct from old.role
       or new.is_active is distinct from old.is_active
       or new.is_2fa_enabled is distinct from old.is_2fa_enabled then
      raise exception 'cannot change role, is_active or is_2fa_enabled on your own profile';
    end if;
  end if;
  return new;
end;
$$;

comment on function protect_profile_privileges() is
  'BEFORE UPDATE trigger on profiles. Stops a non-admin changing role, '
  'is_active or is_2fa_enabled on their own profile. SECURITY INVOKER by '
  'design -- it must read auth.uid() as the caller -- with search_path pinned '
  'and its is_admin() call schema-qualified, so the guard cannot be skipped by '
  'resolving is_admin to a decoy through the caller''s search_path (0027).';

revoke execute on function protect_profile_privileges()
  from public, anon, authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 4. The six remaining SECURITY INVOKER trigger functions
--
-- CONSISTENCY, NOT A SECURITY FIX. Repeated here because this is the section
-- someone will read on its own: every function below runs with the caller's
-- privileges, PL/pgSQL refuses to execute a trigger function outside trigger
-- context, and Supabase's SECURITY DEFINER lints do not flag any of them.
-- Nothing here was exploitable and nothing here becomes safe that was not.
--
-- SEVEN INVOKER TRIGGER FUNCTIONS EXIST; SIX ARE LISTED HERE.
-- protect_profile_privileges is the seventh and is revoked in section 3
-- instead, with service_role included, because it is a real fix rather than a
-- consistency pass and belongs to 0026's four-role shape. That is the only
-- reason it is absent below.
--
-- These six are revoked from public, anon and authenticated but NOT
-- service_role, which is the one place this migration still differs from
-- 0026's shape. Kept deliberately: service_role is a trusted server-side
-- identity that already bypasses RLS everywhere, and for functions that are
-- inert to every caller the marginal value of removing its grant does not
-- justify a fourth statement per function. Every function in this schema that
-- a client could plausibly reach is now revoked from every grantee that does
-- not need it, which is the posture that matters.
--
-- Alphabetical. Verified against pg_proc on 2026-09-01 as the complete set of
-- SECURITY INVOKER functions in `public` returning `trigger`, less the one
-- handled in section 3.
-- ----------------------------------------------------------------------------

revoke execute on function protect_article_provenance()
  from public, anon, authenticated;

revoke execute on function protect_audit_log()
  from public, anon, authenticated;

revoke execute on function protect_content_status()
  from public, anon, authenticated;

revoke execute on function protect_price_observation()
  from public, anon, authenticated;

revoke execute on function protect_weight_proposal()
  from public, anon, authenticated;

revoke execute on function set_updated_at()
  from public, anon, authenticated;


-- ============================================================================
-- VERIFICATION -- run 2026-09-01. This migration was applied INSIDE a
-- transaction that ended in ROLLBACK, so the database was never changed;
-- confirmed afterwards by reading the catalogue back. Eighteen assertions.
--
--   THE SECTION 3 BEFORE/AFTER CONTROL -- the point of the exercise
--   A  PRE-FIX   contributor + decoy is_admin on the search_path, self-promote
--                to admin                                       -> ALLOWED
--      resulting profiles.role                                  -> admin
--   B  POST-FIX  identical attempt, identical decoy path        -> RAISED
--                'cannot change role, is_active or is_2fa_enabled on your own
--                 profile'
--      resulting profiles.role                                  -> contributor
--
--   THE can_view_audit_log GRANT IS LOAD-BEARING -- why section 1 is partial
--   C  with EXECUTE revoked from authenticated, an analyst reading audit_log
--                                    -> RAISED 'permission denied for function
--                                       can_view_audit_log'
--      (the same query returned its row immediately before the revoke)
--   D  with this migration's actual revoke (public, service_role), the same
--      analyst reads audit_log                                  -> OK, 1 row
--   E  anon selecting audit_log still gets a clean empty result -> OK, 0 rows
--
--   POSITIVE CONTROLS -- what must still work
--   1  a new auth.users row still produces its entitlement, with
--      handle_new_user_entitlement() revoked from all four roles
--                                    -> rows=1 tier=free source=signup
--   3  contributor edits own name (profiles_update_own)         -> ALLOWED
--   4  admin sets own is_2fa_enabled -- the is_admin() exemption still
--      resolves after qualification                             -> ALLOWED
--   2a can_view_audit_log() is true for an analyst              -> ALLOWED
--   2b can_view_audit_log() is false for a contributor          -> ALLOWED
--
--   THE GUARD STILL BITES ON THE ORDINARY PATH, no decoy involved
--   5  contributor self-promotes to admin                       -> RAISED
--   6a contributor self-sets is_active                          -> RAISED
--   6b contributor self-sets is_2fa_enabled                     -> RAISED
--
--   THE CHANGES LANDED
--   7  can_view_audit_log         -> {anon=X/postgres, authenticated=X/postgres}
--                                    plus postgres; PUBLIC and service_role gone
--   8  handle_new_user_entitlement, protect_profile_privileges
--                                 -> {postgres=X/postgres}
--   9  the six consistency revokes -> {postgres=X/postgres,
--                                      service_role=X/postgres}
--  10  can_view_audit_log         = search_path=public / definer=true
--      protect_profile_privileges = search_path=public / definer=false
--      (still SECURITY INVOKER, as it must be)
-- ============================================================================
